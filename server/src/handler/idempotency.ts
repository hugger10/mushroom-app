import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import idempotencyRepository from "../repository/idempotency_repository";
import { logger } from "../utils/logger";

export type IdempotencyOptions = {
  /**
   * 命中即生效的路径白名单。条目可为字符串（精确匹配 req.path）或 RegExp。
   */
  paths: Array<string | RegExp>;
  /**
   * 幂等记录的存活时长（秒）。默认 24h。
   */
  ttlSeconds?: number;
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DEFAULT_TTL_SECONDS = 86400;

function matchPath(path: string, patterns: Array<string | RegExp>): boolean {
  for (const p of patterns) {
    if (typeof p === "string") {
      if (p === path) return true;
    } else if (p.test(path)) {
      return true;
    }
  }
  return false;
}

function hashBody(body: unknown): string {
  // 稳定化策略：
  // 1) 剔除 client_request_id：它已是幂等键的一部分，再次参与 hash 反而会让
  //    客户端注入位置（手动写在 body 头部 vs transport 自动追加尾部）影响 hash，
  //    导致同一逻辑请求被误判为 IDEMPOTENCY_CONFLICT。
  // 2) 顶层 key 排序：消除字段书写顺序对 hash 的影响。
  //    当前 6 个白名单接口的 body 均为浅层结构，顶层排序足以覆盖常见误命中；
  //    嵌套对象与数组顺序仍按写入保持（数组顺序往往承载业务语义，不应排序）。
  try {
    const record = (body ?? {}) as Record<string, unknown>;
    const filtered: Record<string, unknown> = {};
    for (const k of Object.keys(record).sort()) {
      if (k === "client_request_id") continue;
      filtered[k] = record[k];
    }
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(filtered))
      .digest("hex");
  } catch {
    return "";
  }
}

export function idempotency(options: IdempotencyOptions) {
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const patterns = options.paths;

  return async function idempotencyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!MUTATING_METHODS.has(req.method)) {
        return next();
      }
      if (!matchPath(req.path, patterns)) {
        return next();
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const clientRequestId =
        typeof body.client_request_id === "string"
          ? body.client_request_id.trim()
          : "";

      if (!clientRequestId) {
        // 兼容老客户端：未携带 key 时不参与幂等保护。
        return next();
      }

      const userId = req.JwtPayload?.userId;
      if (typeof userId !== "number" || !Number.isFinite(userId)) {
        return next();
      }

      const requestHash = hashBody(body);
      const key = {
        userId,
        method: req.method,
        path: req.path,
        clientRequestId
      };

      const existing = await idempotencyRepository.findOne(key);
      if (existing) {
        if (existing.request_hash !== requestHash) {
          res.status(409);
          res.sendResult({
            code: 409,
            success: false,
            message: "Idempotency key reused with a different request body",
            data: { reason: "idempotency_conflict" },
            timestamp: Date.now()
          });
          return;
        }
        res.status(existing.status_code);
        return res.json(existing.response_body);
      }

      // 未命中：拦截 res.json，在响应发送后异步写入幂等记录。
      const originalJson = res.json.bind(res);
      res.json = function patchedJson(payload: unknown) {
        // 仅在 2xx 成功响应时缓存
        const status = res.statusCode || 200;
        if (status >= 200 && status < 300) {
          // best-effort：失败仅记录 warn，不影响响应。
          idempotencyRepository
            .insert({
              ...key,
              requestHash,
              statusCode: status,
              responseBody: payload,
              ttlSeconds
            })
            .catch(err => {
              logger.warn(
                {
                  err,
                  userId,
                  method: req.method,
                  path: req.path,
                  clientRequestId
                },
                "Failed to persist idempotency record"
              );
            });
        }
        return originalJson(payload);
      };

      return next();
    } catch (err) {
      // 中间件自身异常不应阻塞业务请求。
      logger.warn({ err }, "Idempotency middleware error, falling through");
      return next();
    }
  };
}

export default idempotency;

import { Request, Response, NextFunction } from "express";
import type { ApiResult } from "@mushroom/shared";
import { getRequestLogger } from "../utils/log_context";
import { BusinessError } from "./business_error";

export type BaseResult<T> = ApiResult<T | null>;

export const responseWrapper = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    res.sendResult = <T>(data: T | BaseResult<T>) => {
      let result: BaseResult<T>;
      if (data && (data as BaseResult<T>).code !== undefined) {
        result = data as BaseResult<T>;
      } else {
        result = {
          code: 0,
          success: true,
          message: null,
          data: data === undefined ? null : (data as T),
          timestamp: Date.now()
        };
      }
      return res.json(result);
    };
    next();
  };
};

export const wrapAsync = (
  fn: (req: Request, res: Response) => Promise<unknown>
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await fn(req, res);
      if (!res.headersSent) {
        res.sendResult(data);
      }
    } catch (err) {
      next(err);
    }
  };
};

export const errorHandler = () => {
  return (err: unknown, req: Request, res: Response, next: NextFunction) => {
    void next;
    const error = err as { code?: number; message?: string };
    const status =
      error.code && error.code >= 100 && error.code < 600 ? error.code : 500;
    const log = getRequestLogger({
      path: req.path,
      method: req.method,
      status
    });
    // BusinessError 与 4xx 走 warn（业务可预期的拒绝），5xx 才升 error。
    if (err instanceof BusinessError || (status >= 400 && status < 500)) {
      log.warn({ err }, "Request rejected");
    } else {
      log.error({ err }, "Request failed");
    }
    const result: BaseResult<null> = {
      code: error.code || -1,
      success: false,
      message: error.message || "Internal Server Error",
      data: null,
      timestamp: Date.now()
    };

    res.status(status).json(result);
  };
};

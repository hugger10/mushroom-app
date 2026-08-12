import { AsyncLocalStorage } from "node:async_hooks";
import type { Logger } from "pino";
import baseLogger from "./logger";

/**
 * 每条请求 / WS 消息内的日志上下文。
 *
 * 通过 AsyncLocalStorage 在异步链路上隐式传递，service / repository / handler
 * 等下游层无需修改函数签名即可读取到 reqId / userId / deviceId 等标签，并自动
 * 写入到日志输出中。
 *
 * 字段约定见 docs/architecture/logging.md §13。
 */
export interface LogContext {
  reqId?: string;
  userId?: number;
  deviceId?: string;
  /** 自定义额外标签，谨慎使用以免日志膨胀。 */
  extra?: Record<string, unknown>;
}

const storage = new AsyncLocalStorage<LogContext>();

/**
 * 在给定上下文中执行回调；回调内部所有 getLogContext() / getRequestLogger()
 * 都能拿到这里注入的字段。
 */
export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
  return storage.run({ ...ctx }, fn);
}

/**
 * 读取当前异步执行栈上的日志上下文。栈外调用返回 undefined。
 */
export function getLogContext(): LogContext | undefined {
  return storage.getStore();
}

/**
 * 在已有上下文的基础上合并新字段（仅影响当前 store 的浅拷贝），常用于
 * authenticateToken 之后把解析出来的 userId / deviceId 补绑到当前请求。
 *
 * 若当前栈不存在上下文（极少数同步路径），调用是 no-op。
 */
export function mergeLogContext(patch: Partial<LogContext>): void {
  const current = storage.getStore();
  if (!current) {
    return;
  }
  Object.assign(current, patch);
  if (patch.extra) {
    current.extra = { ...current.extra, ...patch.extra };
  }
}

/**
 * 取一个自动绑定当前 LogContext 字段的 child logger。
 * 没有上下文时退化为根 logger，调用方无需做空值判断。
 */
export function getRequestLogger(extra?: Record<string, unknown>): Logger {
  const ctx = storage.getStore();
  if (!ctx && !extra) {
    return baseLogger;
  }
  const bindings: Record<string, unknown> = {};
  if (ctx?.reqId !== undefined) bindings.reqId = ctx.reqId;
  if (ctx?.userId !== undefined) bindings.userId = ctx.userId;
  if (ctx?.deviceId !== undefined) bindings.deviceId = ctx.deviceId;
  if (ctx?.extra) Object.assign(bindings, ctx.extra);
  if (extra) Object.assign(bindings, extra);
  return baseLogger.child(bindings);
}

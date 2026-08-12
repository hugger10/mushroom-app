import type { Request } from "express";
import { BusinessError } from "./business_error";

function readValue(source: unknown, key: string) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  return (source as Record<string, unknown>)[key];
}

export function requireStringField(
  source: unknown,
  key: string,
  message = `${key} is required`
) {
  const value = readValue(source, key);
  if (typeof value !== "string" || value.trim() === "") {
    throw new BusinessError(message);
  }

  return value.trim();
}

export function optionalQueryString(
  req: Request,
  key: string
): string | undefined {
  const value = readValue(req.query, key);
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

export function optionalStringField(
  source: unknown,
  key: string
): string | undefined {
  const value = readValue(source, key);
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

export function requireNumberField(
  source: unknown,
  key: string,
  message = `${key} is required`
) {
  const value = readValue(source, key);
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  ) {
    throw new BusinessError(message);
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new BusinessError(message);
  }

  return parsed;
}

export function optionalNumberField(
  source: unknown,
  key: string
): number | undefined {
  const value = readValue(source, key);
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new BusinessError(`${key} must be a valid number`);
  }

  return parsed;
}

export function optionalQueryNumber(
  req: Request,
  key: string
): number | undefined {
  const value = optionalQueryString(req, key);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new BusinessError(`${key} must be a valid number`);
  }

  return parsed;
}

/**
 * 业务字段长度上限校验：value 超过 max 时抛中文 BusinessError。
 * 与客户端 maxLength 保持同一阈值（来源：packages/shared 的字段长度常量）。
 */
export function assertMaxLength(
  label: string,
  value: string | undefined | null,
  max: number
) {
  if (typeof value === "string" && value.length > max) {
    throw new BusinessError(`${label}不能超过 ${max} 个字符`);
  }
}

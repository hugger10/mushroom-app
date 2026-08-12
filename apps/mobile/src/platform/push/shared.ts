import log from "../../utils/log";

export const pushLog = log.scope("push");

export function normalizeStringValue(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeDataMap(
  value: unknown
): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  return typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function extractTokenValue(value: unknown) {
  if (typeof value === "string") {
    return normalizeStringValue(value);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  for (const key of ["token", "result", "pushToken"]) {
    const token = normalizeStringValue((value as Record<string, unknown>)[key]);
    if (token) {
      return token;
    }
  }

  return null;
}

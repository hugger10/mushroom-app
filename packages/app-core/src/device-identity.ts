/**
 * 设备身份纯函数：统一各端（mobile / electron / web）的 device_id 生成规则
 * 与 device_name 展示格式，避免三端各自实现。
 *
 * - device_id：统一 UUID v4。客户端生成一次并持久化，卸载/清数据前保持不变。
 * - device_name：参考 Telegram 展示风格 `型号 (系统名 系统版本)`。
 */

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 判断字符串是否为合法的 UUID v4。用于设备身份迁移：
 * 旧格式（如 mobile 早期的 `rn-<os>-<ts>-<random>`）不属于 UUID v4。
 */
export function isUuidV4(id: string): boolean {
  return UUID_V4_RE.test(id);
}

/**
 * 生成一个 UUID v4 字符串。优先使用 `crypto.getRandomValues`（Node / 现代
 * Hermes / 浏览器均可用），不可用时退回 `Math.random` —— device_id 只是身份
 * 标识，不需要密码学强度。
 */
export function createDeviceId(): string {
  const bytes = new Uint8Array(16);
  const globalCrypto = (
    globalThis as {
      crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array };
    }
  ).crypto;

  if (typeof globalCrypto?.getRandomValues === "function") {
    globalCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join("")
  ].join("-");
}

export interface DeviceNameInput {
  /** 设备型号（mobile Android：`DeviceInfo.getModel()`；iOS：营销名；electron：`os.hostname()`）。 */
  model?: string | null;
  /** 系统名（mobile：`DeviceInfo.getSystemName()`；electron：macOS/Windows/Linux）。 */
  osName?: string | null;
  /** 系统版本（mobile：`DeviceInfo.getSystemVersion()`；electron：`os.release()`）。 */
  osVersion?: string | null;
  /**
   * 设备制造商/品牌前缀（Android：`buildVendorLabel()` 拼出的 brand+manufacturer，
   * 如 `Redmi Xiaomi`）。仅 Android 需要传——iOS 的 `getModel()` 已是营销名
   * （如 `iPhone 15 Pro`），若再拼 "Apple" 会冗余。
   */
  vendor?: string | null;
  /** 全部字段都不可用时兜底展示。 */
  fallback?: string | null;
}

/**
 * 拼接品牌 + 制造商标签，大小写不敏感去重：
 *
 * - `brand="Redmi"`, `manufacturer="Xiaomi"` → `Redmi Xiaomi`
 * - `brand="HUAWEI"`, `manufacturer="HUAWEI"` → `HUAWEI`（去重，避免重复）
 * - 仅一方有值 → 返回该方；都为空 → null
 */
export function buildVendorLabel(
  brand?: string | null,
  manufacturer?: string | null
): string | null {
  const b = brand?.trim();
  const m = manufacturer?.trim();

  if (!b && !m) {
    return null;
  }
  if (!b) {
    return m ?? null;
  }
  if (!m) {
    return b ?? null;
  }
  return b.toLowerCase() === m.toLowerCase() ? b : `${b} ${m}`;
}

/**
 * 拼接 Telegram 风格的设备名：`iPhone 15 Pro (iOS 17.5)` /
 * `Xiaomi 24094RAD4C (Android 14)`。有 vendor 时拼在型号前（Android 真实
 * 制造商），若型号本身已带 vendor 前缀则跳过避免重复。字段缺失时优雅降级，
 * 始终返回非空字符串。
 */
export function buildDeviceName(input: DeviceNameInput): string {
  const model = input.model?.trim();
  const osName = input.osName?.trim();
  const osVersion = input.osVersion?.trim();
  const vendor = input.vendor?.trim();
  const fallback = input.fallback?.trim();

  let baseModel = model || vendor;
  if (vendor && model) {
    const modelStartsWithVendor = model
      .toLowerCase()
      .startsWith(vendor.toLowerCase());
    baseModel = modelStartsWithVendor ? model : `${vendor} ${model}`;
  }

  if (!baseModel && !osName && !osVersion) {
    return fallback || "Unknown Device";
  }

  if (osName && osVersion) {
    return `${baseModel || "Device"} (${osName} ${osVersion})`;
  }

  return baseModel || osName || osVersion || fallback || "Unknown Device";
}

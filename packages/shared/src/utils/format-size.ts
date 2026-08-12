/**
 * 字节大小格式化（共享于桌面 / 移动 / Web）。
 * 1024 进制；超过 100 取整，超过 10 保留 1 位，否则保留 2 位。
 */
export function formatStorageSize(bytes: number, locale?: string): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const fractionDigits = value >= 100 || index === 0 ? 0 : value >= 10 ? 1 : 2;
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits
  });
  return `${formatter.format(value)} ${units[index]}`;
}

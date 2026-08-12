// 直接复用共享层的策略判定，移动端只是补一个透传函数以保持原有 import 形态。
export { shouldAutoDownload } from "@mushroom/shared";
export type { ShouldAutoDownloadInput } from "@mushroom/shared";

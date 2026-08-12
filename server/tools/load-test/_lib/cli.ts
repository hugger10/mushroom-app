/**
 * 极简 CLI 解析：
 *   位置参数 → positionals（非 -- 开头）
 *   选项     → --key=value 或 --key value 或 --flag（布尔）
 */
import readline from "readline";

export interface ParsedArgs {
  positionals: string[];
  options: Record<string, string | boolean>;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eqIdx = body.indexOf("=");
      if (eqIdx >= 0) {
        options[body.slice(0, eqIdx)] = body.slice(eqIdx + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          options[body] = next;
          i += 1;
        } else {
          options[body] = true;
        }
      }
    } else {
      positionals.push(token);
    }
  }
  return { positionals, options };
}

export function getNumber(
  options: Record<string, string | boolean>,
  key: string,
  fallback: number
): number {
  const value = options[key];
  if (value === undefined || value === true || value === false) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function getString(
  options: Record<string, string | boolean>,
  key: string,
  fallback: string
): string {
  const value = options[key];
  if (typeof value === "string") return value;
  return fallback;
}

export function getBool(
  options: Record<string, string | boolean>,
  key: string,
  fallback = false
): boolean {
  const value = options[key];
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return value === "true" || value === "1" || value === "yes";
}

/**
 * 在终端等待回车确认。--yes 时直接放行。
 */
export async function confirmOrExit(
  options: Record<string, string | boolean>,
  description: string
): Promise<void> {
  if (getBool(options, "yes", false)) return;
  if (!process.stdin.isTTY) {
    console.error("[load-test] 非交互终端且未传 --yes，已退出以避免误操作。");
    process.exit(1);
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  await new Promise<void>(resolve => {
    rl.question(`${description}\n确认执行？输入回车继续，Ctrl-C 取消: `, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * 解析 --start 时间。支持 ISO 字符串或 "now-7d" / "now-3h" / "now"。
 */
export function parseStartTime(value: string | undefined): number {
  if (!value || value === "now") return Date.now();
  const match = /^now-(\d+)([smhd])$/.exec(value);
  if (match) {
    const n = Number(match[1]);
    const unit = match[2];
    const ms =
      unit === "s"
        ? n * 1000
        : unit === "m"
          ? n * 60_000
          : unit === "h"
            ? n * 3_600_000
            : n * 86_400_000;
    return Date.now() - ms;
  }
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) {
    throw new Error(`无法解析 --start=${value}`);
  }
  return ts;
}

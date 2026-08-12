/**
 * 公共环境加载与基础常量。所有 load-test 脚本入口都应先 import 本模块。
 */
import { loadEnv } from "../../../src/utils/load-env";
loadEnv();

import { config } from "../../../src/utils/config";
import pg, { pgp } from "../../../src/db/pg";

export { pg, pgp };

const host = process.env.SERVER_HOST || "127.0.0.1";
const portRaw = Number(process.env.SERVER_PORT || 9100);
const port = Number.isFinite(portRaw) ? portRaw : 9100;
const httpHost = host === "0.0.0.0" ? "127.0.0.1" : host;

export const baseUrl =
  process.env.LOADTEST_BASE_URL || `http://${httpHost}:${port}`;
export const wsBaseUrl =
  process.env.LOADTEST_WS_URL || `ws://${httpHost}:${port}/ws`;

export function ensureNotProduction() {
  if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") {
    console.error(
      "[load-test] 拒绝在 NODE_ENV=production 下运行。请在开发/测试环境执行。"
    );
    process.exit(1);
  }
}

export function dbInfo() {
  return {
    host: config.pg.host,
    port: config.pg.port,
    database: config.pg.database,
    user: config.pg.user
  };
}

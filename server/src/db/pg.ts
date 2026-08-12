import pgPromise, { type IEventContext } from "pg-promise";
import { config } from "../utils/config";
import logger from "../utils/logger";

// 用 Map 以 ctx 引用为 key 暂存查询开始时间，receive 钩子里计算耗时。
const queryStartTimes = new WeakMap<IEventContext, number>();

export const pgp = pgPromise({
  query(event) {
    queryStartTimes.set(event, Date.now());
    logger.trace({ query: event.query }, "Postgres query");
  },
  receive(event) {
    const start = queryStartTimes.get(event.ctx);
    if (start) {
      queryStartTimes.delete(event.ctx);
      const elapsed = Date.now() - start;
      const slowMs = config.pg.slowQueryMs;
      if (slowMs > 0 && elapsed >= slowMs) {
        logger.warn(
          {
            elapsedMs: elapsed,
            slowMs,
            // 注意：不打印参数，避免泄漏敏感信息。
            query:
              typeof event.ctx.query === "string"
                ? event.ctx.query.slice(0, 500)
                : undefined
          },
          "Slow Postgres query"
        );
      }
    }
  },
  error(error, event) {
    logger.error(
      {
        err: error,
        query:
          typeof event?.query === "string"
            ? event.query.slice(0, 500)
            : undefined
      },
      "Postgres query error"
    );
  }
});

const statementTimeoutMs = Math.max(
  0,
  Math.floor(config.pg.statementTimeoutMs)
);
const idleInTxTimeoutMs = Math.max(0, Math.floor(config.pg.idleInTxTimeoutMs));

// 服务端会话级 GUC 通过 libpq options 字符串注入，每个新连接首次握手即生效；
// 客户端 query_timeout 由 node-postgres 兜底，避免客户端无限等待。
const pgOptionsParts: string[] = [];
if (statementTimeoutMs > 0) {
  pgOptionsParts.push(`-c statement_timeout=${statementTimeoutMs}`);
}
if (idleInTxTimeoutMs > 0) {
  pgOptionsParts.push(
    `-c idle_in_transaction_session_timeout=${idleInTxTimeoutMs}`
  );
}

const pg = pgp({
  host: config.pg.host,
  port: config.pg.port,
  database: config.pg.database,
  user: config.pg.user,
  password: config.pg.password,
  max: config.pg.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  query_timeout:
    config.pg.queryTimeoutMs > 0 ? config.pg.queryTimeoutMs : undefined,
  application_name: "mushroom-server",
  keepAlive: true,
  // pg-promise 的 d.ts 未暴露 node-postgres 透传字段 `options`，这里通过 spread 注入。
  ...(pgOptionsParts.length > 0
    ? ({ options: pgOptionsParts.join(" ") } as Record<string, unknown>)
    : {})
});

logger.info(
  {
    dbHost: config.pg.host,
    dbPort: config.pg.port,
    database: config.pg.database,
    slowQueryMs: config.pg.slowQueryMs,
    poolMax: config.pg.poolMax,
    statementTimeoutMs,
    idleInTxTimeoutMs,
    queryTimeoutMs: config.pg.queryTimeoutMs
  },
  "Postgres pool configured"
);

export default pg;

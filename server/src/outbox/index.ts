import { loadEnv } from "../utils/load-env";
loadEnv();
import { runServerMigrations } from "../db/migrate";
import outboxWorker from "./outbox_worker";
import logger from "../utils/logger";
import { closeAllRedis } from "../cache/redis";

let shutdownPromise: Promise<void> | null = null;

async function shutdown(signal: string) {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    logger.info({ signal }, "Outbox worker process shutdown started");
    try {
      await outboxWorker.stop();
      await closeAllRedis();
      logger.info("Outbox worker process shutdown completed");
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, "Outbox worker process shutdown failed");
      process.exit(1);
    }
  })();

  return shutdownPromise;
}

async function start() {
  await runServerMigrations();
  outboxWorker.start();
  logger.info("Standalone outbox worker process started");
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

void start().catch(error => {
  logger.error({ err: error }, "Failed to start standalone outbox worker");
  process.exit(1);
});

import { loadEnv } from "./utils/load-env";
loadEnv();
import express, {
  type NextFunction,
  type Request,
  type Response
} from "express";
import http from "http";
import rateLimit from "express-rate-limit";
import { config } from "./utils/config";
import { wsServer } from "./websocket";
import userRouter from "./routers/user_router";
import conversationRouter from "./routers/conversation_router";
import messageRouter from "./routers/message_router";
import { fileRouter } from "./routers/file_router";
import { authenticateToken } from "./handler/jwt";
import { idempotency } from "./handler/idempotency";
import { runServerMigrations } from "./db/migrate";
import pg from "./db/pg";
import outboxWorker from "./outbox/outbox_worker";
import { closeAllRedis } from "./cache/redis";
import { recoverPendingThumbnails } from "./service/thumbnail_worker";
import idempotencyRepository from "./repository/idempotency_repository";
import outboxRepository, { outboxStatus } from "./repository/outbox_repository";
import { startAttachmentOrphanCleanup } from "./storage/attachment_orphan_cleanup";
import logger from "./utils/logger";
import { runWithLogContext, mergeLogContext } from "./utils/log_context";
import pinoHttp from "pino-http";
import {
  errorHandler,
  responseWrapper,
  wrapAsync
} from "./handler/response_wrapper";

type StartupIssue = {
  code: "database_unavailable" | "migration_failed" | "startup_failed";
  message: string;
};

type ServerLifecycle = {
  startedAt: string;
  migrationsReady: boolean;
  shuttingDown: boolean;
  startupIssue: StartupIssue | null;
  stopIdempotencyCleanup: (() => void) | null;
  stopOutboxCleanup: (() => void) | null;
  stopAttachmentOrphanCleanup: (() => void) | null;
};

const openPaths = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/healthz",
  "/readyz"
];

function createLifecycle(): ServerLifecycle {
  return {
    startedAt: new Date().toISOString(),
    migrationsReady: false,
    shuttingDown: false,
    startupIssue: null,
    stopIdempotencyCleanup: null,
    stopOutboxCleanup: null,
    stopAttachmentOrphanCleanup: null
  };
}

export function buildApp(
  lifecycle: ServerLifecycle = createLifecycle()
): express.Express {
  const app = express();
  app.use(
    pinoHttp({
      logger,
      autoLogging: true,
      // 2xx/3xx 走 debug：生产默认 LOG_LEVEL=info 静默，排障时把 level
      // 降到 debug 即可看到完整访问日志；4xx 仍 warn，5xx 仍 error。
      customLogLevel: function (req: Request, res: Response, err?: Error) {
        void req;
        if (res.statusCode >= 500 || err) {
          return "error";
        }
        if (res.statusCode >= 400) {
          return "warn";
        }
        return "debug";
      },
      serializers: {
        req(req: Request & { id?: string }) {
          const headers = req.headers ?? {};
          // 屏蔽鉴权/cookie，避免敏感信息落盘。

          const {
            authorization: _authorization,
            cookie: _cookie,
            ...safeHeaders
          } = headers as Record<string, unknown>;
          return {
            id: req.id,
            method: req.method,
            url: req.url,
            remoteAddress: req.socket?.remoteAddress,
            headers: safeHeaders
          };
        }
      }
    })
  );

  app.use(express.json({ limit: "128kb" }));
  app.use(responseWrapper());
  // ALS：每个 HTTP 请求一个 store。authenticateToken 之后由
  // mergeLogContext 补绑 userId/deviceId。在路由进入前就 run，使得 service
  // 层即便在 healthz/auth 这种未鉴权路径也能拿到 reqId。
  app.use((req: Request, res: Response, next: NextFunction) => {
    runWithLogContext({ reqId: (req as Request & { id?: string }).id }, () =>
      next()
    );
  });
  app.get("/healthz", (_req: Request, res: Response) => {
    res.sendResult({
      status: "ok",
      started_at: lifecycle.startedAt,
      uptime_seconds: Math.floor(process.uptime()),
      shutting_down: lifecycle.shuttingDown,
      startup_issue: lifecycle.startupIssue,
      websocket: wsServer.getStats()
    });
  });
  app.get(
    "/readyz",
    wrapAsync(async (_req: Request, res: Response) => {
      const ready = lifecycle.migrationsReady && !lifecycle.shuttingDown;
      let outbox:
        | Awaited<ReturnType<typeof outboxWorker.getSnapshot>>
        | (ReturnType<typeof outboxWorker.getStatus> & {
            queue: null;
            snapshot_error: string;
          });

      try {
        outbox = await outboxWorker.getSnapshot();
      } catch (error) {
        outbox = {
          ...outboxWorker.getStatus(),
          queue: null,
          snapshot_error: error instanceof Error ? error.message : String(error)
        };
      }

      if (!ready) {
        res.status(503);
      }
      return {
        status: ready ? "ready" : "starting",
        migrations_ready: lifecycle.migrationsReady,
        shutting_down: lifecycle.shuttingDown,
        startup_issue: lifecycle.startupIssue,
        outbox,
        websocket: wsServer.getStats()
      };
    })
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (openPaths.includes(req.path)) {
      return next();
    }

    if (lifecycle.shuttingDown) {
      res.status(503);
      res.sendResult({
        code: 503,
        success: false,
        message: "Server is shutting down",
        data: { reason: "shutting_down" },
        timestamp: Date.now()
      });
      return;
    }

    if (lifecycle.startupIssue) {
      res.status(503);
      res.sendResult({
        code: 503,
        success: false,
        message: lifecycle.startupIssue.message,
        data: { reason: lifecycle.startupIssue.code },
        timestamp: Date.now()
      });
      return;
    }

    if (!lifecycle.migrationsReady) {
      res.status(503);
      res.sendResult({
        code: 503,
        success: false,
        message: "Server is still starting",
        data: { reason: "starting" },
        timestamp: Date.now()
      });
      return;
    }

    return next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (openPaths.includes(req.path)) {
      return next();
    }
    return authenticateToken(req, res, err => {
      if (!err && req.JwtPayload) {
        mergeLogContext({
          userId: Number(req.JwtPayload.userId),
          deviceId: req.JwtPayload.deviceId
        });
      }
      next(err);
    });
  });

  // 幂等中间件：仅作用于会产生不可回滚副作用（多条系统消息 / 多条 outbox 事件 / 重复实体）
  // 的写入接口。请求体携带 client_request_id 时启用；命中即回放上次响应，避免重复执行业务。
  app.use(
    idempotency({
      paths: [
        "/conversation/create",
        "/conversation/members/add",
        "/conversation/members/remove",
        "/conversation/announcement",
        "/conversation/owner/transfer",
        "/message/recall"
      ]
    })
  );

  // 认证端点速率限制：1分钟内最多 20 次请求
  const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: 429, success: false, message: "请求过于频繁，请稍后再试" }
  });

  app.use("/auth/login", authLimiter);
  app.use("/auth/register", authLimiter);
  app.use("/auth/refresh", authLimiter);
  app.use("/auth", userRouter);
  app.use("/conversation", conversationRouter);
  app.use("/message", messageRouter);
  app.use("/file", fileRouter);
  app.get("/api/config/limits", (_req: Request, res: Response) => {
    res.sendResult({
      maxTextLength: config.limits.maxTextLength,
      avatar: { maxBytes: config.limits.avatarMaxBytes },
      attachments: config.limits.attachment,
      upload: {
        chunkSize: config.limits.upload.chunkSize,
        concurrency: config.limits.upload.concurrency,
        maxRetries: config.limits.upload.maxRetries,
        presignedExpiresSeconds: config.limits.upload.presignedExpiresSeconds,
        multipartThreshold: config.limits.upload.multipartThreshold
      }
    });
  });

  app.use(errorHandler());

  return app;
}

export function createHttpServer(app: express.Express) {
  const server = http.createServer(app);

  server.on("upgrade", (req, socket, head) => {
    const pathname = req.url
      ? new URL(req.url, `http://${req.headers.host}`).pathname
      : "";
    if (pathname === "/ws" || pathname === "/wss") {
      wsServer.handleUpgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  return server;
}

function registerShutdown(server: http.Server, lifecycle: ServerLifecycle) {
  let shutdownPromise: Promise<void> | null = null;
  const shutdown = async (signal: string) => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    lifecycle.shuttingDown = true;
    shutdownPromise = (async () => {
      logger.info({ signal }, "Server shutdown started");
      const timeout: ReturnType<typeof setTimeout> = setTimeout(() => {
        logger.error("Server shutdown timed out");
        process.exit(1);
      }, config.server.gracefulShutdownTimeoutMs);
      (timeout as { unref?: () => void }).unref?.();

      try {
        await outboxWorker.stop();
        await wsServer.close();
        await new Promise<void>((resolve, reject) => {
          if (!server.listening) {
            resolve();
            return;
          }
          server.close(error => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
        try {
          lifecycle.stopIdempotencyCleanup?.();
        } catch (err) {
          logger.warn({ err }, "Stop idempotency cleanup failed");
        }
        try {
          lifecycle.stopOutboxCleanup?.();
        } catch (err) {
          logger.warn({ err }, "Stop outbox cleanup failed");
        }
        try {
          lifecycle.stopAttachmentOrphanCleanup?.();
        } catch (err) {
          logger.warn({ err }, "Stop attachment orphan cleanup failed");
        }
        await closeAllRedis();
        try {
          await pg.$pool.end();
        } catch (err) {
          logger.warn({ err }, "Close Postgres pool failed");
        }
        clearTimeout(timeout);
        logger.info("Server shutdown completed");
        process.exit(0);
      } catch (error) {
        clearTimeout(timeout);
        logger.error({ err: error }, "Server shutdown failed");
        process.exit(1);
      }
    })();

    return shutdownPromise;
  };

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  return shutdown;
}

type StartServerResult = {
  app: express.Express;
  server: http.Server;
  lifecycle: ServerLifecycle;
  shutdown: (signal: string) => Promise<void>;
};

export function startServer(): StartServerResult {
  const lifecycle = createLifecycle();
  const app = buildApp(lifecycle);
  const server = createHttpServer(app);
  const shutdown = registerShutdown(server, lifecycle);

  wsServer.start();
  server.listen(config.server.port, config.server.host, () => {
    logger.info(
      {
        host: config.server.host,
        port: config.server.port,
        outboxEnabled: config.outbox.enabled,
        outboxPollIntervalMs: config.outbox.pollIntervalMs
      },
      `Server running at http://${config.server.host}:${config.server.port}`
    );
  });

  void runServerMigrations()
    .then(() => {
      lifecycle.migrationsReady = true;
      lifecycle.startupIssue = null;
      outboxWorker.start();
      void recoverPendingThumbnails();
      lifecycle.stopIdempotencyCleanup = startIdempotencyCleanup();
      lifecycle.stopOutboxCleanup = startOutboxCleanup();
      lifecycle.stopAttachmentOrphanCleanup = startAttachmentOrphanCleanup();
      logger.info("Server migrations completed");
    })
    .catch(error => {
      const rawMessage =
        error instanceof Error
          ? error.message
          : String(error ?? "unknown error");
      const normalized = rawMessage.toLowerCase();
      lifecycle.startupIssue = {
        code:
          normalized.includes("connect") ||
          normalized.includes("econn") ||
          normalized.includes("timeout") ||
          normalized.includes("database") ||
          normalized.includes("postgres")
            ? "database_unavailable"
            : "migration_failed",
        message: rawMessage
      };
      logger.error({ err: error }, "Server migration failed");
    });

  return { app, server, lifecycle, shutdown };
}

export function createApp() {
  return startServer().server;
}

/**
 * 每小时清理一次已过期的幂等键记录。失败仅打 warn，不影响主流程。
 * 返回一个 stop 函数，由 shutdown 流程负责取消定时器。
 */
function startIdempotencyCleanup(): () => void {
  const intervalMs = 60 * 60 * 1000;
  const tick = async () => {
    try {
      const removed = await idempotencyRepository.deleteExpired();
      if (removed > 0) {
        logger.info({ removed }, "Idempotency keys cleanup");
      }
    } catch (err) {
      logger.warn({ err }, "Idempotency keys cleanup failed");
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  (timer as { unref?: () => void }).unref?.();
  void tick();
  return () => clearInterval(timer);
}

/**
 * Phase 3：周期性清理已派发与死信的 outbox 行，避免表无界增长。
 * dispatched 行保留 OUTBOX_DISPATCHED_RETENTION_HOURS（默认 24h），
 * dead 行保留 OUTBOX_DEAD_RETENTION_DAYS（默认 30d）。
 */
function startOutboxCleanup(): () => void {
  const { cleanup } = config.outbox;
  const tick = async () => {
    const now = Date.now();
    try {
      const dispatchedCutoff = new Date(
        now - cleanup.dispatchedRetentionHours * 60 * 60 * 1000
      );
      const dispatchedRemoved = await outboxRepository.deleteOlderThan(
        outboxStatus.dispatched,
        dispatchedCutoff,
        cleanup.batchSize
      );
      const deadCutoff = new Date(
        now - cleanup.deadRetentionDays * 24 * 60 * 60 * 1000
      );
      const deadRemoved = await outboxRepository.deleteOlderThan(
        outboxStatus.dead,
        deadCutoff,
        cleanup.batchSize
      );
      if (dispatchedRemoved > 0 || deadRemoved > 0) {
        logger.info(
          { dispatchedRemoved, deadRemoved },
          "Outbox cleanup removed expired rows"
        );
      }
    } catch (err) {
      logger.warn({ err }, "Outbox cleanup failed");
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, cleanup.intervalMs);
  (timer as { unref?: () => void }).unref?.();
  void tick();
  return () => clearInterval(timer);
}

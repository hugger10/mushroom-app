import { loadEnv } from "./load-env";

loadEnv();

const isProduction = process.env.NODE_ENV === "production";

function readString(name: string, fallback = ""): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function readStringList(name: string, fallback: string[] = []): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  return raw
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function readEnum<T extends string>(
  name: string,
  allowed: readonly T[],
  fallback: T
): T {
  const raw = process.env[name]?.trim().toLowerCase() as T | undefined;
  if (!raw) return fallback;
  if ((allowed as readonly string[]).includes(raw)) {
    return raw;
  }
  return fallback;
}

const jwtSecret = readString("JWT_SECRET");

if (!jwtSecret) {
  if (isProduction) {
    throw new Error("JWT_SECRET must be set in production");
  }
  throw new Error(
    "JWT_SECRET environment variable is required. Set it in your .env file."
  );
}

const redisPassword = readString("REDIS_PASSWORD");

export const config = {
  server: {
    host: readString("SERVER_HOST", "0.0.0.0"),
    port: readNumber("SERVER_PORT", 9100),
    nodeId: readString(
      "SERVER_NODE_ID",
      `${readString("SERVER_HOST", "0.0.0.0")}:${readNumber("SERVER_PORT", 9100)}`
    ),
    gracefulShutdownTimeoutMs: readNumber(
      "SERVER_GRACEFUL_SHUTDOWN_TIMEOUT_MS",
      10_000
    ),
    /**
     * 是否多节点部署（多个 server 进程 / 多副本 + LB）。
     *
     * 单节点（默认 false）：
     *   - WS 派发只走本地 ws.send，不依赖 Redis pub/sub
     *   - redis_dispatcher 不启动 subscriber 连接，零 zombie 风险
     *
     * 多节点（true）：
     *   - 本地 socket 仍直投（主路径）
     *   - 同时通过 Redis pub/sub 通知其他节点投递它们持有的 socket（桥路径）
     *   - subscriber 端启用 30s 心跳 + 自动重订阅，应对长连接半开
     *
     * Redis pub/sub 是 fire-and-forget，绝不应作为单节点投递的关键路径。
     */
    multiNode: readBoolean("WS_MULTI_NODE", false)
  },
  minio: {
    host: readString("MINIO_HOST", "localhost"),
    port: readNumber("MINIO_PORT", 9000),
    useSSL: readString("MINIO_USE_SSL", "false") === "true",
    accessKey: readString("MINIO_ACCESS_KEY", "minioadmin"),
    secretKey: readString("MINIO_SECRET_KEY", "minioadmin"),
    publicUrl: readString("MINIO_PUBLIC_URL", "http://localhost:9000")
  },
  pg: {
    host: readString("DB_HOST", "localhost"),
    port: readNumber("DB_PORT", 5432),
    database: readString("DB_NAME", "mushroom"),
    user: readString("DB_USER", "mushroom"),
    password: readString("DB_PASSWORD", "mushroom"),
    /** 慢查询告警阈值（毫秒）。0 表示不告警。 */
    slowQueryMs: readNumber("PG_SLOW_QUERY_MS", 300),
    /** 连接池最大连接数。 */
    poolMax: readNumber("DB_POOL_MAX", 20),
    /**
     * 服务端 statement_timeout（毫秒）。单条 SQL 超过该时长会被 PG 取消，
     * 防止慢查询长期占用连接，配合 idleInTxTimeoutMs 一起防止池被打满。
     * 设为 0 表示不限制（不推荐）。
     */
    statementTimeoutMs: readNumber("DB_STATEMENT_TIMEOUT_MS", 15_000),
    /**
     * 服务端 idle_in_transaction_session_timeout（毫秒）。事务开启后若
     * 长时间未发起新语句（例如在 tx 中等待外部 IO）会被强制回滚并断连。
     */
    idleInTxTimeoutMs: readNumber("DB_IDLE_IN_TX_TIMEOUT_MS", 30_000),
    /**
     * 客户端 query_timeout（毫秒），node-postgres 兜底。配合 statement_timeout
     * 形成双保险：前者由服务端取消，后者由客户端断开。
     */
    queryTimeoutMs: readNumber("DB_QUERY_TIMEOUT_MS", 20_000)
  },
  logging: {
    /**
     * Payload 采样开关配置。默认全部关闭，运维需要时手动打开。
     * 实现见 utils/payload_logger.ts。
     */
    payload: {
      enabled: readBoolean("LOG_PAYLOAD_ENABLED", false),
      scopes: readStringList("LOG_PAYLOAD_SCOPES"),
      maxBytes: readNumber("LOG_PAYLOAD_MAX_BYTES", 2048),
      sampleRate: readNumber("LOG_PAYLOAD_SAMPLE_RATE", 1),
      userAllowlist: readStringList("LOG_PAYLOAD_USER_ALLOWLIST"),
      redactKeys: readStringList("LOG_PAYLOAD_REDACT_KEYS")
    }
  },
  SECRET: jwtSecret,
  auth: {
    accessTokenTtlSeconds: readNumber("JWT_ACCESS_TTL_SECONDS", 24 * 60 * 60),
    refreshTokenTtlSeconds: readNumber(
      "JWT_REFRESH_TTL_SECONDS",
      30 * 24 * 60 * 60
    ),
    refreshGraceSeconds: readNumber("JWT_REFRESH_GRACE_SECONDS", 30),
    accessGraceSeconds: readNumber("JWT_ACCESS_GRACE_SECONDS", 30)
  },
  redis: {
    host: readString("REDIS_HOST", "127.0.0.1"),
    port: readNumber("REDIS_PORT", 6379),
    password: redisPassword || undefined,
    db: readNumber("REDIS_DB", 0)
  },
  outbox: {
    enabled: readBoolean("OUTBOX_ENABLED", true),
    batchSize: readNumber("OUTBOX_BATCH_SIZE", 100),
    pollIntervalMs: readNumber("OUTBOX_POLL_INTERVAL_MS", 1000),
    leaseMs: readNumber("OUTBOX_LEASE_MS", 30_000),
    maxRetryCount: readNumber("OUTBOX_MAX_RETRY_COUNT", 5),
    maxRetryDelayMs: readNumber("OUTBOX_MAX_RETRY_DELAY_MS", 60_000),
    monitorLogIntervalMs: readNumber("OUTBOX_MONITOR_LOG_INTERVAL_MS", 60_000),
    // Phase 3：清理后台任务，避免 message_outbox 无界增长。
    cleanup: {
      dispatchedRetentionHours: readNumber(
        "OUTBOX_DISPATCHED_RETENTION_HOURS",
        24
      ),
      deadRetentionDays: readNumber("OUTBOX_DEAD_RETENTION_DAYS", 30),
      intervalMs: readNumber("OUTBOX_CLEANUP_INTERVAL_MS", 60 * 60 * 1000),
      batchSize: readNumber("OUTBOX_CLEANUP_BATCH", 5000)
    }
  },
  attachmentOrphanCleanup: {
    // Phase 3：附件孤儿清扫，回收未绑定到消息的上传记录与对应 MinIO 对象。
    ttlHours: readNumber("ATTACHMENT_ORPHAN_TTL_HOURS", 24),
    intervalMs: readNumber(
      "ATTACHMENT_ORPHAN_CLEANUP_INTERVAL_MS",
      60 * 60 * 1000
    ),
    batchSize: readNumber("ATTACHMENT_ORPHAN_CLEANUP_BATCH", 200)
  },
  push: {
    enabled: readBoolean("PUSH_ENABLED", true),
    fcmProjectId: readString("PUSH_FCM_PROJECT_ID"),
    fcmClientEmail: readString("PUSH_FCM_CLIENT_EMAIL"),
    fcmPrivateKey: readString("PUSH_FCM_PRIVATE_KEY").replace(/\\n/g, "\n"),
    huaweiAppId: readString("PUSH_HUAWEI_APP_ID"),
    huaweiClientId: readString("PUSH_HUAWEI_CLIENT_ID"),
    huaweiClientSecret: readString("PUSH_HUAWEI_CLIENT_SECRET"),
    huaweiOauthUrl: readString(
      "PUSH_HUAWEI_OAUTH_URL",
      "https://oauth-login.cloud.huawei.com/oauth2/v3/token"
    ),
    huaweiPushApiUrl: readString(
      "PUSH_HUAWEI_API_URL",
      "https://push-api.cloud.huawei.com"
    ),
    xiaomiAppId: readString("PUSH_XIAOMI_APP_ID"),
    xiaomiAppKey: readString("PUSH_XIAOMI_APP_KEY"),
    xiaomiAppSecret: readString("PUSH_XIAOMI_APP_SECRET"),
    xiaomiPackageName: readString("PUSH_XIAOMI_PACKAGE_NAME"),
    xiaomiRegion: readString("PUSH_XIAOMI_REGION", "singapore"),
    xiaomiJavaBin: readString("PUSH_XIAOMI_JAVA_BIN", "java"),
    xiaomiSdkDir: readString("PUSH_XIAOMI_SDK_DIR"),
    xiaomiHelperClasspath: readString(
      "PUSH_XIAOMI_HELPER_CLASSPATH",
      "server/tools/xiaomi/classes"
    ),
    /**
     * APNs VoIP (PushKit) channel — delivers `call.invite` directly to iOS over
     * the dedicated VoIP topic so a killed/background app reliably wakes and
     * reports a CallKit incoming call. Authenticated with a token-based (.p8)
     * APNs key. Independent of the FCM channel used for chat-message pushes.
     */
    apnsKeyId: readString("PUSH_APNS_KEY_ID"),
    apnsTeamId: readString("PUSH_APNS_TEAM_ID"),
    apnsPrivateKey: readString("PUSH_APNS_PRIVATE_KEY").replace(/\\n/g, "\n"),
    apnsBundleId: readString("PUSH_APNS_BUNDLE_ID"),
    apnsProduction: readBoolean("PUSH_APNS_PRODUCTION", isProduction),
    /**
     * JPush (极光) 聚合推送 — 可选厂商通道。客户端注册为 `push_provider:
     * "jpush"`、`push_token` 存极光 registrationId；服务端经
     * `https://api.jpush.cn/v3/push`（国内可达）投递，极光内部按设备路由
     * 各厂商通道。未配置时设备按现有 xiaomi → huawei → fcm 优先级注册。
     */
    jpushAppKey: readString("JPUSH_APP_KEY"),
    jpushMasterSecret: readString("JPUSH_MASTER_SECRET"),
    jpushApnsProduction: readBoolean("JPUSH_APNS_PRODUCTION", isProduction),
    dryRun: readBoolean("PUSH_DRY_RUN", !isProduction)
  },
  call: {
    inviteTimeoutSeconds: readNumber("CALL_INVITE_TIMEOUT_SECONDS", 45),
    stunUrls: readStringList("CALL_STUN_URLS", [
      "stun:stun.l.google.com:19302"
    ]),
    turnUrls: readStringList("CALL_TURN_URLS"),
    turnSecret: readString("CALL_TURN_SECRET"),
    turnUsername: readString("CALL_TURN_USERNAME"),
    turnCredential: readString("CALL_TURN_CREDENTIAL"),
    turnTtlSeconds: readNumber("CALL_TURN_TTL_SECONDS", 3600),
    groupMaxParticipants: readNumber("CALL_GROUP_MAX_PARTICIPANTS", 8),
    liveKitUrl: readString("CALL_LIVEKIT_URL"),
    liveKitApiKey: readString("CALL_LIVEKIT_API_KEY"),
    liveKitApiSecret: readString("CALL_LIVEKIT_API_SECRET"),
    liveKitTokenTtlSeconds: readNumber("CALL_LIVEKIT_TOKEN_TTL_SECONDS", 3600)
  },
  websocket: {
    /** 心跳扫描间隔（毫秒）。默认 35000。 */
    heartbeatCheckIntervalMs: readNumber(
      "WS_HEARTBEAT_CHECK_INTERVAL_MS",
      35_000
    ),
    /** 客户端最长无 ping 容忍（毫秒）。超过即 terminate。默认 40000。 */
    heartbeatTimeoutMs: readNumber("WS_HEARTBEAT_TIMEOUT_MS", 40_000),
    /**
     * Redis 中 device presence key 的 TTL（秒）。心跳时刷新。默认 70。
     * 不变量：心跳扫描间隔 < ttl/2，否则 device presence key 会在心跳到达前过期。
     */
    devicePresenceTtlSeconds: readNumber("WS_DEVICE_PRESENCE_TTL_SECONDS", 70)
  },
  presence: {
    /**
     * 在线状态扇出模式：
     *   - "contacts"    仅推送给联系人（旧行为，含 P1 的 forward∪reverse union）
     *   - "subscribers" 仅推送给按需订阅者（P2 引入的新模型）
     *   - "both"        两者并集，作为切换灰度期的安全网（默认）
     */
    fanoutMode: readEnum(
      "PRESENCE_FANOUT_MODE",
      ["contacts", "subscribers", "both"] as const,
      "both"
    ),
    /** 单个 device 订阅集合在 Redis 中的 TTL（秒）。心跳时刷新。 */
    subscriptionDeviceTtlSeconds: readNumber(
      "PRESENCE_SUBSCRIPTION_DEVICE_TTL_SECONDS",
      300
    ),
    /** 单次 subscribe 帧最多允许的 user_ids 数，防御异常客户端。 */
    subscribeBatchLimit: readNumber("PRESENCE_SUBSCRIBE_BATCH_LIMIT", 500),
    /**
     * P3.4：presence transition 抖动 debounce 窗口（毫秒）。
     * 同一 user 在窗口内的多次上下线只会触发一次 broadcast，flush 时以最新 summary 为准。
     * 设为 0 即关闭 debounce（兼容老行为）。默认 3000ms。
     */
    transitionDebounceMs: readNumber("PRESENCE_TRANSITION_DEBOUNCE_MS", 3000)
  },
  limits: {
    /** 单条文本消息最大字符数。 */
    maxTextLength: readNumber("MAX_TEXT_LENGTH", 2000),
    /** 用户头像最大字节数（默认 5MB）。 */
    avatarMaxBytes: readNumber("MAX_AVATAR_SIZE_MB", 5) * 1024 * 1024,
    /** 分级附件大小限额（字节）。 */
    attachment: {
      image: readNumber("MAX_IMAGE_SIZE_MB", 30) * 1024 * 1024,
      video: readNumber("MAX_VIDEO_SIZE_MB", 300) * 1024 * 1024,
      audio: readNumber("MAX_AUDIO_SIZE_MB", 100) * 1024 * 1024,
      voice: readNumber("MAX_VOICE_SIZE_MB", 50) * 1024 * 1024,
      file: readNumber("MAX_FILE_SIZE_MB", 200) * 1024 * 1024
    },
    upload: {
      chunkSize: readNumber("UPLOAD_CHUNK_SIZE_MB", 5) * 1024 * 1024,
      concurrency: readNumber("UPLOAD_CHUNK_CONCURRENCY", 3),
      maxRetries: readNumber("UPLOAD_CHUNK_MAX_RETRIES", 3),
      presignedExpiresSeconds: readNumber(
        "UPLOAD_PRESIGNED_EXPIRES_SECONDS",
        3600
      ),
      /** >= 该阈值的请求会走 multipart；小文件单 PUT。 */
      multipartThreshold:
        readNumber("UPLOAD_MULTIPART_THRESHOLD_MB", 5) * 1024 * 1024
    }
  }
};

# Server

服务端负责 HTTP API、WebSocket、会话同步、消息同步、隐私/拉黑能力和文件上传接口。

## 启动

```bash
pnpm --filter @mushroom/server dev
```

## 依赖

- PostgreSQL
- Redis
- MinIO 或兼容 S3

## 关键环境变量

服务端从 `server/.env`（以及可选的 `server/.env.local`）加载配置；完整列表见
`server/.env.example`。常用项：

```env
SERVER_HOST=0.0.0.0
SERVER_PORT=9100
JWT_SECRET=replace-this-in-production
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=mushroom
DB_USER=mushroom
DB_PASSWORD=mushroom
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
MINIO_HOST=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_PUBLIC_URL=http://127.0.0.1:9000
```

## 当前路由

- `POST /auth/login`
- `POST /auth/register`
- `GET /auth/profile`
- `GET /auth/search`
- `GET /auth/contacts`
- `POST /auth/contacts/match`
- `POST /auth/contacts`
- `PUT /auth/contacts/:contactUserId`
- `DELETE /auth/contacts/:contactUserId`
- `GET /auth/blocks`
- `POST /auth/block`
- `POST /auth/unblock`
- `GET /auth/privacy`
- `PUT /auth/privacy`
- `GET /conversation/sync`
- `POST /conversation/create`
- `POST /conversation/direct`
- `GET /conversation/members`
- `POST /message/sync`
- `POST /file/*`
- `GET /ws`

## 注意事项

- 生产环境必须显式设置 `JWT_SECRET`
- WebSocket 投递范围和消息同步规则仍需在后续阶段继续收紧

## 日志排障 cheat sheet

服务端使用 pino + AsyncLocalStorage 注入请求上下文，关键字段：
`reqId / userId / deviceId / conversationId / messageId / clientMessageId /
sequence / classify / outboxId / eventType / retryCount`。详见
[`docs/architecture/logging.md`](../docs/architecture/logging.md#13-服务端结构化日志规范pino)。

- 串一次消息链路：按 `clientMessageId` 过滤 `ws.chat.in` →
  `message.save.outbox` → `outbox.deliver.chat`。
- 串一次 HTTP / 单条 WS 消息：按 `reqId` 过滤。
- 临时打开 payload 采样：

  ```bash
  LOG_LEVEL=trace \
  LOG_PAYLOAD_ENABLED=true \
  LOG_PAYLOAD_SCOPES=ws.chat.in,outbox.deliver.chat \
  LOG_PAYLOAD_USER_ALLOWLIST=123 \
  pnpm --filter @mushroom/server dev
  ```

  默认禁用，开启后会按 key 脱敏并按字节截断（见 `LOG_PAYLOAD_MAX_BYTES`）。

- 慢查询阈值：`PG_SLOW_QUERY_MS=300`（默认）。命中输出
  `Slow Postgres query`（仅 SQL 文本，不含参数）。

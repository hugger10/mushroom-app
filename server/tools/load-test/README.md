# 文字消息批量生成脚本

为开发/测试环境批量灌入文字消息，覆盖 **DB 直插 / HTTP / WS** 三种路径，分别针对 **私聊 / 群聊** 两种会话类型，共 6 个生成脚本 + 1 个清理脚本。

> 启动时会强制校验 `NODE_ENV !== "production"`，并在非 `--yes` 模式下交互确认。仅传用户名即可运行，缺失用户/会话会自动幂等创建（密码默认 `123456`）。

## 脚本一览

| Scenario       | 脚本                  | pnpm 命令                    | 默认 count |
| -------------- | --------------------- | ---------------------------- | ---------- |
| 私聊 DB 直插   | `seed-direct-db.ts`   | `pnpm loadtest:db:direct`    | 5000       |
| 群聊 DB 直插   | `seed-group-db.ts`    | `pnpm loadtest:db:group`     | 5000       |
| 私聊 HTTP 路径 | `seed-direct-http.ts` | `pnpm loadtest:http:direct`  | 1000       |
| 群聊 HTTP 路径 | `seed-group-http.ts`  | `pnpm loadtest:http:group`   | 1000       |
| 私聊 WS 路径   | `seed-direct-ws.ts`   | `pnpm loadtest:ws:direct`    | 500        |
| 群聊 WS 路径   | `seed-group-ws.ts`    | `pnpm loadtest:ws:group`     | 500        |
| 批量造数据     | `seed-bulk-users.ts`  | `pnpm loadtest:bulk`         | 100 用户   |
| 数据清理       | `cleanup.ts`          | `pnpm loadtest:cleanup`      | -          |
| 批量数据清理   | `cleanup-bulk.ts`     | `pnpm loadtest:cleanup:bulk` | -          |

> 服务端目前没有「发消息」HTTP 端点；HTTP 脚本只在登录/建会话阶段走 HTTP，实际发送回退到 WS 仅等待 ack（不采样接收端延时）。WS 脚本则做完整端到端延时统计。

## 通用参数

- `--count=N`：要生成的消息条数。
- `--batch=N`：DB 模式批大小（一次事务内的消息数；默认 500）。
- `--password=xxx`：HTTP/WS 路径登录密码，默认 `123456`。
- `--name=xxx`：群聊会话 name，默认 `loadtest-group-<owner>`。
- `--start=now-7d|now-3h|<ISO>`：时间戳基线，会均匀+jitter 推进到当前时刻。
- `--with-outbox`（仅 DB 模式）：同时写入 `message_outbox` 让 outbox worker 做正常分发。
- `--yes`：跳过交互确认。

## 行为细节

- **发言顺序**：马尔可夫链（自留概率 0.55，否则等概率切换其他成员），外加 5% 概率触发 2~3 条「连发」。
- **文字内容**：从中文短句池按 `tiny:short:medium:long = 30:35:25:10` 加权抽样、随机拼接，并按低概率叠加 emoji 与 `@提及`。
- **DB sequence**：每批一次性 `UPDATE conversations.message_seq += batch RETURNING` 拿到连续区间。
- **DB user_state**：事务内逐成员维护 `unread_count` / `last_read_seq` / `last_delivered_seq`。
- **WS / HTTP 模式**：每条消息走 `handleChatMessage`，落库 + 出 outbox + 走 worker 正常分发链路。

## 用例

```bash
# 1) 私聊 DB 灌 5000 条
pnpm --filter @mushroom/server loadtest:db:direct -- alice bob --count=5000

# 2) 群聊 DB 灌 1 万条且写 outbox
pnpm --filter @mushroom/server loadtest:db:group -- alice bob carol dave \
  --count=10000 --with-outbox

# 3) HTTP 路径冒烟（默认 1000 条）
pnpm --filter @mushroom/server loadtest:http:direct -- alice bob

# 4) WS 端到端延时基线（含接收端延时统计）
pnpm --filter @mushroom/server loadtest:ws:group -- alice bob carol --count=500

# 5) 清理某个会话的消息数据（保留会话壳）
pnpm --filter @mushroom/server loadtest:cleanup -- 7234567890123456789

# 6) 一键造 100 个用户、联系人、20 私聊 + 20 群聊/人，每会话 ~500 条消息
pnpm --filter @mushroom/server loadtest:bulk -- --yes
#    可通过环境变量覆盖默认值，例如：
#    USER_COUNT=50 MESSAGES_PER_CONV=200 pnpm --filter @mushroom/server loadtest:bulk -- --yes

# 7) 清理由 loadtest:bulk 造出来的全部数据（按 username LIKE 'lt_%' 匹配）
pnpm --filter @mushroom/server loadtest:cleanup:bulk -- --yes
```

## 输出指标

每个脚本完成后打印 JSON 块，包含：

- `scenario` / `done` / `total` / `elapsed_ms` / `rate_per_sec`
- WS 脚本另含 `ackLatency.{p50,p90,p99,max,avg}`
- WS 端到端脚本还有 `receiverLatency.{samples,p50,p90,p99,max,avg}`

## 清理脚本

`cleanup` 脚本只清理一个 `conversation_id` 的消息相关数据：

- 删除：`messages` / `message_outbox` / `message_user_state` / `message_reactions` / `attachment_uploads`（按 `bound_message_id` 关联）
- 复位：`conversations.message_seq=0`、`last_message_id=NULL`，`conversation_user_state` 的未读/已读/已送达，`conversation_members.join_seq=0`
- **不会**删除会话壳与成员关系
- **不会**删除 MinIO 中的对象

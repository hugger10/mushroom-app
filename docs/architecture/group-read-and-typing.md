# 群聊已读回执与"正在输入"实时状态设计

本文沉淀群聊已读勾（已读回执）与"正在输入"指示器从 1:1 扩展到群聊的设计决策、协议规范、数据模型、客户端规则与回归测试清单。供后续维护与扩展参考。

> **定位**：本文为**专项实现档案**（位于 `docs/architecture/`，横切 messaging / websocket / account-privacy / conversation-group 四个模块）。架构层事实已同步回写本目录下的 [`websocket.md`](./websocket.md)（classify 清单与 typing 扇出）、[`messaging.md`](./messaging.md)（群已读水位与 outbox 边界）、[`account-privacy.md`](./account-privacy.md)（隐私开关状态与 Roadmap）、[`conversation-group.md`](./conversation-group.md)（markRead 群 fanout）；各文档以相对链接互链到本文，不再复述全文。

适用版本：协议版本需较当前再 bump 一次（typing 字段调整 + 新增 `group_read` 事件）。

> 实现进度：Phase 0/1/2/3/4 全部完成 ✅
>
> - 服务端 typing 扇出 + `group_read` 广播 + `GET /api/conversation/:id/read-state` 补齐
> - 三端（web / electron / mobile）聚合状态、列表已读勾、消息已读勾、长按"查看已读"详情面板
> - 隐私开关 `read_receipts_visibility`（0/2 二态）三端 UI 已接入

---

## 1. 目标与非目标

### 目标

- 群聊支持已读勾（仅对消息发送者本人渲染），点击/长按可查看 "已读 N / 未读 M" 详情。
- 群聊支持"正在输入"指示器，多人并发输入时聚合渲染。
- 与 1:1 现有体验保持一致，零行为回归。
- 新增全局"已读回执"隐私开关，私聊与群聊统一遵守。

### 非目标

- 不引入按消息维度的 `message_read_receipts` 表（避免写放大）。
- 不为 typing 引入持久化；`group_read` 事件本身仍非持久化，但客户端会把
  群已读高水位作为本地缓存持久化，用于冷启动列表离线展示。
- 本期不做迁移脚本（数据库由人工 reset 重建）。

---

## 2. 关键决策一览

| 决策项                     | 结论                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| 已读勾语义                 | ≥1 人已读即亮蓝（策略函数封装，未来一行可切换为全员已读）                                         |
| 已读勾可见受众             | **仅消息发送者本人**（群和私聊统一规则）                                                          |
| 大群降级 / 阈值            | **不需要**，server 只 dispatch 给原作者 → 流量 O(N) 而非 O(N²)                                    |
| 隐私开关存储               | `user_privacy_settings.read_receipts_visibility SMALLINT`（0=任何人，1=仅联系人[预留]，2=不允许） |
| 隐私关闭后本人详情面板     | 仍能看完整已读列表；关闭仅影响"我作为读者向他人广播已读"                                          |
| `group_read` 是否入 outbox | **否**，非持久化直发；客户端本地缓存高水位，缺失帧由 `read-state` API 补齐                        |
| `read-state` 补齐接口      | 实现，仅消息原作者可调用                                                                          |
| 群 typing                  | server 按 `conversation_id` 扇出 + 1.5s/(conv,sender) 节流                                        |
| 协议版本                   | 需 bump 一次                                                                                      |

---

## 3. 协议规范

### 3.1 WebSocket 事件

#### `group_read`（新增，server → client，非持久化）

```ts
{
  messageClassify: "group_read",
  conversation_id: string,
  reader_user_id: number,
  read_seq: number,
  updated_at: string  // ISO8601
}
```

**Dispatch 规则**：

- 仅当会话为群聊（`conversations.type !== 1`）。
- Server 在 `markConversationRead` 写库成功后，**仅向该 reader 新覆盖的 read_seq 区间内消息的原作者** dispatch 一帧（按 author 聚合，每个 author 一帧）。
- reader 自身的 `read_receipts_visibility = 2` 时跳过广播。
- 同时对扇出目标的每个候选 sender 批量查 `read_receipts_visibility`，sender = 2 时也排除（A2 双向 enforcement，详见 §3.3）。
- 不写 `outbox`；直接通过 Redis dispatcher → WS。

#### `typing`（改造，client ↔ server）

**移除** `target_user_id`。Server 按 `conversation_id` 校验成员资格后，扇出给除 `sender_user_id` 之外的所有 active 成员（`leave_seq IS NULL`）。

```ts
{
  messageClassify: "typing",
  conversation_id: string,
  sender_user_id: number,
  activity: "typing" | "recording" | "idle"
}
```

**节流**：server 端按 `(conversation_id, sender_user_id)` 维护内存 LRU，min 1.5s 一帧 `activity != "idle"`，`idle` 帧不节流（立即传递）。

向后兼容：旧客户端若仍发送 `target_user_id`，server 容忍并忽略；旧客户端接收到的 typing 与新版结构一致（旧字段缺失不影响渲染）。

#### `privacy_sync`（新增，server → client）

`PrivacyService.update()` 写库成功后 fire-and-forget 推送一帧给该用户所有
在线设备，让其他端的 toggle / 已读勾 gate 跨设备秒同步，不必等
`refreshMeData` 或下一次冷启动。

```ts
{
  messageClassify: "privacy_sync",
  settings: UserPrivacySettings,
  version: number,    // user_privacy_settings.version，每次 update +1
  updated_at: string  // ISO8601
}
```

非持久化（不写 `outbox`）。客户端用 `applyPrivacyVersion(baseline, frame)`
（`packages/shared/src/utils/privacy-version.ts`）做单调合并：
`frame.version <= baseline.version` 则丢弃，避免乱序写覆盖新值。

### 3.2 隐私开关双向 enforcement (A2)

`read_receipts_visibility = 2`（关闭）的承诺是 **双向失效**：自己看不到对方
是否已读，对方也看不到自己是否已读。系统在四层兜底：

1. **Server SQL JOIN（私聊主屏障）** —
   `ConversationRepository.findByUser` / `findByUserConversationId` 用
   `LEFT JOIN user_privacy_settings` 同时拉调用者 (`caller_priv`) 与对端
   (`peer_priv`) 两侧设置，对 `peer_last_read_sequence` 用
   `CASE WHEN COALESCE(caller_priv, 0) <> 2 AND COALESCE(peer_priv, 0) <> 2
THEN ... ELSE 0 END` 双向归零。结果：任一端关闭，所有列表/详情 API
   返回的 `peer_last_read_sequence` 都为 0。
2. **Server group_read fanout（群主屏障）** —
   `dispatchGroupReadFanout` 在按 block 过滤后再 batch 查所有候选 sender
   的隐私，sender 自身关闭则不向其推送（与 reader 关闭对称）。同时短路
   `conversation.sync` outbox 在 1:1 reader 或 peer 任一关闭时跳过。
3. **WS `privacy_sync` 帧** — 见 §3.1。客户端用单调 `version` 合并避免
   乱序写覆盖新值。
4. **客户端兜底 gating** —
   - `packages/app-core/Controller.handleGroupReadMessage` 入站首条 gate
     `currentReceiptsEnabled`，断网期间残留的旧帧 / server 暂未感知本机
     关闭的窗口都会被丢弃；切到关闭时同步调用
     `repository.clearAllGroupReadStates()` 一次性清空所有群已读高水位缓存
     （三端均已实现：`packages/app-core` in-memory、mobile
     `sqlite-data-repository.ts`、electron 主进程 `db:group-read:clear-all`
     IPC），避免重新打开已读回执时残留的 ✓✓ 立刻回显。
   - Web `useIsReceiptsEnabled()` (`apps/web/src/hooks/useMyPrivacySettings.ts`)
     模块级 pub/sub 单例，`MessageList.renderReadStatus` / `ConversationList`
     在渲染勾前 gate。
   - Mobile 在 `chat-screen-props` / `home-screen-props` 注入
     `isReceiptsEnabled = isReadReceiptsEnabled(state.privacySettings)`，
     传到 `MessageBubble.peerHasRead` 与 `ConversationRow.showTick`。

> **不引入 `markReadOnce` 等"已读后再关闭不撤回"语义**：本设计与 WhatsApp /
> Telegram 一致 —— 关闭后立即双向失效，包括历史消息。这也是为何切到关闭
> 时需要清空群已读 high-water-mark。

### 3.3 HTTP API

#### `GET /api/conversation/:id/read-state`（新增）

**权限**：调用者必须是会话的 active member。**响应仅返回 readers 名单**（已读回执 visibility 过滤后）。

```ts
// Response 200
{
  conversation_id: string,
  readers: Array<{
    user_id: number,
    last_read_seq: number,
    updated_at: string
  }>,
  // 不出现在 readers 中的成员视为"未读"或"已关闭已读回执"
  total_members: number
}
```

- 关闭 `read_receipts_visibility = 2` 的成员**不会出现在** `readers` 中（对调用者表现为"未读"）。
- 客户端用法：长按自己发的群消息时调用，渲染 "已读 N / 未读 M" 详情面板。
- 也用于客户端重连/重装后补齐 `group_read` 离线缺失数据。

#### `PATCH /api/privacy/me`（已存在，扩展字段）

新增可写字段 `read_receipts_visibility: 0 | 1 | 2`。

---

## 4. 数据模型

### 4.1 服务端 PostgreSQL

**仅新增 1 列**，无破坏性变更：

```sql
ALTER TABLE user_privacy_settings
  ADD COLUMN read_receipts_visibility SMALLINT NOT NULL DEFAULT 0;
COMMENT ON COLUMN user_privacy_settings.read_receipts_visibility IS
  '已读回执可见性：0=任何人（默认），1=仅联系人（预留），2=不允许';
```

**复用**：

- `conversation_user_state.last_read_seq` 作为每用户每会话已读高水位（已存在）。
- `conversation_members` 提供"应读成员"集合 (`leave_seq IS NULL`)（已存在）。

### 4.2 Electron 本地 SQLite

```sql
CREATE TABLE IF NOT EXISTS local_group_read_states (
  server_conversation_id TEXT NOT NULL,
  reader_user_id         INTEGER NOT NULL,
  last_read_seq          INTEGER NOT NULL DEFAULT 0,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (server_conversation_id, reader_user_id)
);
```

仅缓存群聊中其他成员的 `last_read_seq`。写入按
`(server_conversation_id, reader_user_id)` 取 max，永不回退；关闭已读回执、
删除会话、退出并清理本地数据时清空对应缓存。

### 4.3 Mobile

Mobile SQLite 使用等价表 `mobile_group_read_states`，并在仓库初始化时回灌到
`MobileAppController` snapshot 的
`groupReadStateByConversation: Record<serverConversationId, Record<readerUserId, lastReadSeq>>`。
JSON-backed 仓库同样把该字段作为本地缓存持久化。服务端仍是权威来源，WS
`group_read` 和 `GET /api/conversation/:id/read-state` 会继续校准本地缓存。

---

## 5. Server 实现要点

### 5.1 `ConversationService.markConversationRead`

- 1:1 分支保持不变。
- 群分支新增：
  1. 查询 reader 此前的 `last_read_seq`（在 markRead 写入前），计算新增已读区间 `(prev_seq, new_seq]`。
  2. 若新增区间为空，跳过 dispatch。
  3. 查询 reader 的 `read_receipts_visibility`；若 = 2，跳过广播（仅自己设备同步）。
  4. 查询 `messages` 在 `(prev_seq, new_seq]` 区间内、按 `sender_user_id` 聚合作者集合（排除 reader 自己）。
  5. 对每个 author，dispatch 一帧 `group_read`。
- 不再为群聊发笨重的 `conversation.sync` 给其他成员（仅 1:1 仍保留兼容）。
- self 的 `conversation_read` 多设备同步行为不变。

### 5.2 `call_handler.ts` typing

- 接收 `TypingMessage` 后：
  1. 校验 sender 是 `conversation_id` 的 active member。
  2. 节流：若不是 `idle` 且距上次 < 1.5s，丢弃。
  3. 加载 `findMembers(conversation_id)`，dispatch 给除 sender 外所有 active 成员。

### 5.3 `ConversationController.getReadState`（新增）

- 权限：caller 必须是该会话 active member。
- 查询：`SELECT cus.user_id, cus.last_read_seq, cus.updated_at FROM conversation_user_state cus JOIN conversation_members cm USING(conversation_id, user_id) WHERE cus.conversation_id=$1 AND cm.left_at IS NULL AND cus.user_id != $caller`；JOIN `user_privacy_settings` 过滤 `read_receipts_visibility = 2`。
- 返回 readers + `total_members`。

---

## 6. 客户端规则

### 6.1 已读勾渲染规则（三端统一）

```ts
function shouldRenderReadIndicator(conv, msg, self_user_id): boolean {
  if (msg.sender_user_id !== self_user_id) return false; // 仅自己发的
  if (conv.type === 1) return true; // 1:1 现状
  return true; // 群聊：自己发的也显示
}
```

**勾状态计算**：

```ts
// packages/shared/src/utils/message-delivery.ts
export function isGroupMessageRead(
  readerSeqs: number[],
  messageSeq: number
): boolean {
  // 当前策略：≥1 人已读
  return readerSeqs.some(seq => seq >= messageSeq);
  // 切换为 WhatsApp 全员已读：return readerSeqs.every(seq => seq >= messageSeq);
}
```

### 6.2 群已读状态聚合

- 类型：`Map<conversationId, Map<userId, last_read_seq>>`。
- 初始化时机：
  1. 用户进入会话且会话中存在自己发的消息时，调用 `GET /api/conversation/:id/read-state` 拉取初始快照。
  2. 收到 `group_read` 帧时增量更新（`max(existing, msg.read_seq)`）。
  3. 重连后下一次进入该会话再次拉取（增量校准）。

> 实现：请求 + 归一化逻辑统一封装在
> `packages/shared/src/utils/group-read-refresh.ts` 的 `refreshGroupReadState`，
> 双端调用：
>
> - 移动端：`packages/app-core/.../read-receipt-service.ts:refreshConversationReadState`
>   → repository `upsertGroupReadStates`。
> - Web/Electron：`apps/web/src/hooks/useChat.ts` 的 `openConversation`
>   → `window.electronAPI.bulkApplyGroupRead`。
>
> 单聊（`type === 1`）由调用方过滤；不会触发该接口。
>
> **Electron renderer reload / app restart 生命周期（重要）**：群已读高水位在桌面端有两层
> 热状态，并由 SQLite 本地缓存兜底——
>
> 1. **main 进程** `groupReadCache`（`apps/electron/src/main/db/ipc/read-receipts.ts`），
>    随 main 进程存活，整页 renderer reload **不丢**；main 进程重启后从
>    `local_group_read_states` 回灌。
> 2. **renderer React state** `groupReadStateByConversation`（`useChat.ts`），
>    整页 reload **被清空**。
>
> 列表已读勾仅读 renderer state，而 renderer 填充它的途径是 main 推来的
> `group-read-update` 事件和启动时的 `getAllGroupReadStates` 快照。为避免
> reload / 重启后两层缓存生命周期不一致导致「群勾回到单勾」，约定：
>
> - `db:group-read:bulk-apply`（冷启动 / 重连的全量补齐路径）即便本次合并没有
>   推进任何高水位，也**始终**把该会话 bucket 的**全量快照**作为 `bulk` 下发；
>   renderer 的 `onGroupReadUpdate` 对 `bulk` 做幂等单调合并，收全量零副作用。
> - renderer 启动时调用 `db:group-read:get-all`（`getAllGroupReadStates`）一次性
>   从 main 缓存回灌全部会话快照，使**未点开**的群会话 reload 后也能立即恢复
>   双勾。若 main 进程也被重启，main 会先从 SQLite hydrate，列表不需要等用户
>   点开会话即可恢复本地已知状态；随后由 `refreshGroupReadState` 校准。
> - 增量实时帧仍走 `db:group-read:apply`（单条），保留增量去重以省事件。
>
> 注：`refreshGroupReadState` 在 `serverConversationId` 为空或纯空白时
> 静默 no-op，不发请求；行为相对旧实现（web 直接调用并依赖 server 422、
> app-core 走仓库查询后早返回）更早收敛。

### 6.3 typing 状态

- `Map<conversationId, Map<senderUserId, { activity, expiresAt }>>`。
- 客户端独立 6s 超时清理（防 `idle` 丢失）。
- 渲染（`getGroupTypingSubtitle`）：
  - 1 人 → `Alice 正在输入…`
  - 2 人 → `Alice、Bob 正在输入…`
  - ≥3 人 → `3 人正在输入…`
- 会话切换/后台清理逻辑沿用既有机制。

### 6.4 详情面板

- 触发：长按自己发的群消息。
- 入口仅对 `sender_user_id === self_user_id && conv.type !== 1` 显示。
- 调 `read-state` API，渲染：
  - 已读：readers 列表（按 `updated_at` 倒序，昵称+头像）。
  - 未读：`total_members - readers.length - 1`（减去自己），不展开名单（避免社交压力）。

### 6.5 隐私开关 UI

- 设置页"已读回执"开关（二态：开/关，映射 0/2）。
- 提示文案：「关闭后，他人无法看到你已读其消息；同时你也无法看到他人是否已读你的消息。」

---

## 7. 风险与缓解

| 风险                              | 缓解                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------- |
| 协议版本兼容（typing 移除字段）   | Server 容忍旧字段；新 typing 在旧客户端可正常渲染（多 typer 退化为最后一帧） |
| 三端 UI 守卫解除可能影响 1:1 渲染 | 严守"按 conv.type 分派渲染函数"原则；补 shared 单测；三端手工验收            |
| `read-state` 大群响应体           | 500 人群约 30KB，可接受；客户端按需调用，非热路径                            |
| `group_read` 帧丢失               | 由 `read-state` 在用户进入会话时补齐；高水位单调收敛保证最终一致             |
| typing 大群放大                   | 1.5s/(conv,sender) 节流 + 仅发给 active 成员；大群典型 1-3 人同时输入，可控  |

---

## 8. 回归测试清单

### Shared 单测

- `isGroupMessageRead([0,5,10], 6)` → true（≥1 人已读）
- `isGroupMessageRead([0,0,0], 1)` → false
- `getGroupTypingSubtitle` 各分支（0/1/2/3 人）

### Server 单测

- `markConversationRead` 1:1 分支行为零变化（已存在用例需通过）
- `markConversationRead` 群分支：
  - 新增区间为空 → 不 dispatch
  - reader visibility=2 → 不 dispatch
  - 区间内有自己发的消息 → 不向自己 dispatch
  - 区间内有多个作者 → 每个作者一帧
- `getReadState`：
  - 非成员调用 → 403
  - visibility=2 的成员不出现在 readers
  - 排除调用者自身
- `typing` handler：
  - 非成员发 typing → 拒绝
  - 1.5s 内重复 typing → 第二帧被丢弃
  - `idle` 帧不被节流

### 三端手工验收

- 1:1 已读勾、typing 行为零回归。
- 群聊：自己发的消息显示勾，他人发的消息无勾。
- 群聊详情面板正确显示 N/M。
- 关闭已读回执后双向失效。
- 群多人输入时聚合渲染正确。

---

## 9. 后续可扩展点

- "仅联系人可见已读"（`read_receipts_visibility = 1`）的语义实现。
- 大群（>1000 人）若出现 dispatch 压力，再引入按 author 的批量合并与节流。
- typing `recording` 动效升级。
- 详情面板按"已读时间"分组展示。

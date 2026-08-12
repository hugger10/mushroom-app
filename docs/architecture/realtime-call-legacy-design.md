# Electron 实时通话与语音消息技术方案 v1

## 1. 文档定位

- 本文档用于承载计划外迭代“Electron 实时音视频通话”的技术实现细节。
- 本文档同时覆盖：
  - 实时语音 / 视频通话
  - 直接语音消息
- 对应的产品目标、阶段步骤、状态与结论统一维护在根目录 `task_plan.md`。
- 对应的详细开发任务拆解维护在 `docs/realtime-calling-implementation-plan.md`。
- 当前版本基于已确认决策形成第一版可落地方案。
- 本文档重点记录：
  - 架构选择
  - 技术边界
  - 数据模型
  - 信令协议
  - 通话状态机
  - 弱网与 TURN 策略
  - 风险与规避方案

## 2. 背景与问题定义

当前聊天输入栏中的语音、视频按钮，本质上只是附件消息的快捷上传入口，不具备成熟 IM 所需的实时通话能力。

与目标能力的差距主要体现在：

- 没有麦克风实时采集能力
- 没有摄像头实时采集能力
- 没有实时媒体传输链路
- 没有来电、接听、拒绝、忙线、超时、挂断的会话状态机
- 没有多设备同时振铃与单设备接通后的收敛逻辑
- 没有群聊实时通话模型
- 没有弱网、NAT 穿透与 TURN 中继支持

因此，本轮能力必须作为独立通话域来设计，而不是继续复用附件消息模型。

同时，本轮还新增一项独立能力：直接语音消息。它与实时通话的产品形态相似，但技术链路不同，也不能混用实现。

## 3. 需求边界

### 3.1 已确认范围

- 支持单聊实时语音通话
- 支持单聊实时视频通话
- 支持群聊实时语音 / 视频通话
- 支持直接语音消息
- 单条语音消息最长 `60` 秒
- 实时通话不设产品时长上限
- 输入栏交互约定：
  - 麦克风按钮发起语音通话
  - 摄像头按钮发起视频通话
  - 语音消息采用“按住说话”
  - 松开发送
  - 不做上滑取消
  - 录音中显示波形和时长
  - 权限被拒绝时提示用户开通麦克风权限
- 平台优先级为 `Electron`
- `mobile` 暂不实现
- 来电 `45` 秒未接听自动超时
- 同账号全部在线设备同时振铃
- 用户通话中收到新来电时直接忙线
- 每次通话结束后生成一条通话记录消息
- 首版包含弱网支持与 `TURN` 中继

### 3.2 明确不做

- `mobile` 端实现
- 屏幕共享
- 通话录制
- 美颜、背景虚化、AI 降噪
- 主持人、举手、直播、旁听
- 跨端通话无缝迁移

说明：

- “直接语音消息”不属于上述排除项，属于本轮明确范围内能力。

## 4. 已冻结核心决策

- 单聊媒体拓扑：`WebRTC P2P`
- 群聊媒体拓扑：`SFU`
- NAT 穿透与中继：自建 `coturn`
- 通话生命周期权威状态：服务端维护
- 多设备策略：同账号全部振铃，但单用户单设备接通
- 语音消息与实时通话分属不同技术链路：
  - 实时通话走 `WebRTC`
  - 语音消息走“录制 + 上传 + 消息发送”链路

## 4.1 已确认实现决策

- `SFU` 方向：
  - 采用自建成熟 `SFU` 服务
- signaling 承载：
  - 复用现有 `WebSocket`
  - 新增 `call.*` 协议族
- signaling 风格：
  - 客户端发送请求事件
  - 服务端校验并广播权威状态事件
- 单聊竞态裁决：
  - 以服务端先落库成功的权威状态为准
- 群聊首版人数上限：
  - `8` 人
- 群聊结束规则：
  - 发起人离开不自动结束
  - 最后一个已加入成员离开时结束
- 单聊 / 群聊通话能力边界：
  - 首版支持视频关闭摄像头后退化为语音
  - 语音升级视频后置
- 语音消息编码格式：
  - `m4a/aac`
- 语音消息最短时长：
  - 少于 `1` 秒不发送
- 语音消息发送方式：
  - 按住录音
  - 松开发送
- MinIO 路径策略：
  - 按业务分目录存储
- 语音消息与通话记录落库：
  - 统一写入现有 `messages` 表
  - 内容类型分别为 `voice_message` 与 `call_record`
- `coturn` 鉴权：
  - 服务端签发短期凭证
- 设备切换能力：
  - 首版不做复杂设备切换
  - 仅做设备可用性检测与权限提示
- 可观测性：
  - 首版即接入基础通话指标

## 4.2 设备能力与交互规则概要

- 单聊视频通话：
  - 被叫没有摄像头时，允许仅语音接听
  - 若最终按语音接通，则整通会话按语音通话处理
- 群视频通话：
  - 成员没有摄像头时，允许以纯语音成员身份加入
  - 群会话本身仍可保持视频通话类型
- 麦克风不可用：
  - 允许以“只看不说”或“只听不说”方式加入
  - 不因缺少麦克风而强制拒绝加入当前通话
- 发起侧设备能力不足：
  - 发起视频通话但没有摄像头时，自动降级为语音通话发起
  - 发起视频通话但没有麦克风时，允许以视频无声模式发起
- 设备完全不可用但仍有输出能力时：
  - 允许以只听模式加入语音 / 视频通话
- 通话中设备丢失：
  - 摄像头丢失时，自动退化为纯语音或只听模式
  - 麦克风丢失时，自动退化为只看不说或只听不说模式
- 通话记录消息：
  - 记录最终接通类型，而不是最初请求类型

## 5. 总体架构

### 5.1 分层原则

- 消息链路与通话链路分离
  - 文本 / 图片 / 文件仍走现有消息链路
  - 实时音视频走独立通话链路
- 媒体传输层使用 `WebRTC`
- 信令交换层优先复用现有 `WebSocket`
- 通话状态由服务端维护权威状态
- 通话结束后以消息形式沉淀到会话历史
- 语音消息仍走消息模型，但内容类型应从普通附件消息中独立识别

### 5.2 推荐职责划分

- Electron Renderer：
  - 发起通话、接收来电、展示通话 UI
  - 调用浏览器媒体 API 获取本地媒体流
  - 维护本地 `RTCPeerConnection`
  - 上报和接收 signaling 事件
- Electron Main：
  - 承担有限的平台桥接能力
  - 处理可能需要平台能力感知的设备或权限补充逻辑
- Server WebSocket：
  - 作为 signaling 分发中枢
  - 保存权威通话状态
  - 负责多设备振铃、一致性收敛、超时判定、忙线判定
- TURN / STUN：
  - 提供 NAT 穿透与中继能力

### 5.3 目标部署形态

- 单聊：
  - 双方通过 signaling 交换 SDP / ICE
  - 优先直连，必要时通过 `coturn` 中继
- 群聊：
  - 客户端与 `SFU` 建立上行 / 下行媒体连接
  - `SFU` 负责媒体转发
  - 服务端 signaling 层负责会话状态和成员状态，不直接承载媒体
- `coturn`：
  - 为单聊与群聊统一提供 TURN 能力
  - 作为基础网络组件部署，不与应用进程耦合

### 5.4 为什么群聊直接选择 SFU

- 群聊如果走纯 `mesh`，人数稍多就会出现：
  - 上行带宽爆炸
  - CPU 占用急剧上升
  - 质量不稳定
- 既然本轮范围已经明确包含群聊，继续使用 `mesh` 只会把成本后移。
- 因此群聊方案直接按 `SFU` 设计，避免首发后重做协议和会话模型。

### 5.5 服务端权威原则

- 服务端是以下状态的唯一权威来源：
  - 呼叫是否存在
  - 呼叫是否仍在振铃
  - 呼叫是否已接通
  - 呼叫是否已结束
  - 某参与者是否忙线、超时、拒绝、已加入、已离开
- 客户端可以持有本地 UI 状态，但不能独立决定最终状态。
- 通话记录消息只能基于服务端最终状态生成。

### 5.6 单用户单设备接通原则

- 用户级策略：
  - 所有在线设备都可以振铃
  - 同一用户在同一通话中只允许一个设备进入实际通话
- 设备级收敛：
  - 某设备接听成功后，服务端立即向同账号其他在线设备广播已处理终态
  - 其他设备退出振铃 UI，不再允许继续接听
- 这样可以避免：
  - 同一用户重复入会
  - 同账号多个端同时占用音视频资源
  - 挂断与离会状态难以收敛

## 6. 核心数据模型

## 6.1 通话会话实体

建议新增独立 `call_sessions` 表或等价模型，至少包含：

- `call_id`
- `conversation_id`
- `call_scope`
  - `direct`
  - `group`
- `media_type`
  - `audio`
  - `video`
- `initiator_user_id`
- `status`
  - `initiated`
  - `ringing`
  - `ongoing`
  - `ended`
  - `cancelled`
  - `timeout`
  - `failed`
- `started_at`
- `answered_at`
- `ended_at`
- `end_reason`

推荐表名：

- `call_sessions`

推荐主键方案：

- 数据库自增主键：`id`
- 业务主键：`call_id`

推荐字段设计：

| 字段名                | 类型          | 约束                     | 说明                  |
| --------------------- | ------------- | ------------------------ | --------------------- |
| `id`                  | `BIGSERIAL`   | `PRIMARY KEY`            | 内部主键              |
| `call_id`             | `VARCHAR(64)` | `NOT NULL UNIQUE`        | 对外暴露的通话 ID     |
| `conversation_id`     | `BIGINT`      | `NOT NULL`               | 关联现有会话          |
| `call_scope`          | `SMALLINT`    | `NOT NULL`               | `1=direct`, `2=group` |
| `media_type`          | `SMALLINT`    | `NOT NULL`               | `1=audio`, `2=video`  |
| `initiator_user_id`   | `BIGINT`      | `NOT NULL`               | 发起人                |
| `status`              | `SMALLINT`    | `NOT NULL`               | 通话会话状态          |
| `active_device_count` | `INTEGER`     | `NOT NULL DEFAULT 0`     | 当前已入会设备数      |
| `participant_count`   | `INTEGER`     | `NOT NULL DEFAULT 0`     | 当前参与者总数快照    |
| `started_at`          | `TIMESTAMPTZ` | `NOT NULL`               | 发起时间              |
| `answered_at`         | `TIMESTAMPTZ` | `NULL`                   | 首次接通时间          |
| `ended_at`            | `TIMESTAMPTZ` | `NULL`                   | 结束时间              |
| `end_reason`          | `SMALLINT`    | `NULL`                   | 结束原因              |
| `created_at`          | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | 创建时间              |
| `updated_at`          | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | 更新时间              |

推荐状态枚举：

- `status`
  - `1 = initiated`
  - `2 = ringing`
  - `3 = ongoing`
  - `4 = ended`
  - `5 = cancelled`
  - `6 = timeout`
  - `7 = failed`
- `end_reason`
  - `1 = completed`
  - `2 = cancelled_by_initiator`
  - `3 = rejected`
  - `4 = busy`
  - `5 = timeout`
  - `6 = network_failure`
  - `7 = force_closed`

推荐索引：

- `UNIQUE INDEX ux_call_sessions_call_id (call_id)`
- `INDEX idx_call_sessions_conversation_id_started_at (conversation_id, started_at DESC)`
- `INDEX idx_call_sessions_initiator_started_at (initiator_user_id, started_at DESC)`
- `INDEX idx_call_sessions_status_started_at (status, started_at DESC)`

## 6.2 参与者状态实体

建议新增 `call_participants` 表或等价模型，至少包含：

- `call_id`
- `user_id`
- `device_id`
- `participant_status`
  - `invited`
  - `ringing`
  - `accepted`
  - `joined`
  - `declined`
  - `busy`
  - `timeout`
  - `left`
- `ringing_at`
- `answered_at`
- `joined_at`
- `left_at`
- `end_reason`

说明：

- `user_id` 与 `device_id` 必须并存。
- 这是“全部振铃、单设备接通收敛”的基础。

推荐表名：

- `call_participants`

推荐字段设计：

| 字段名               | 类型           | 约束                     | 说明                         |
| -------------------- | -------------- | ------------------------ | ---------------------------- |
| `id`                 | `BIGSERIAL`    | `PRIMARY KEY`            | 内部主键                     |
| `call_id`            | `VARCHAR(64)`  | `NOT NULL`               | 关联 `call_sessions.call_id` |
| `conversation_id`    | `BIGINT`       | `NOT NULL`               | 冗余存储，便于查询           |
| `user_id`            | `BIGINT`       | `NOT NULL`               | 参与用户                     |
| `device_id`          | `VARCHAR(128)` | `NOT NULL`               | 参与设备                     |
| `participant_role`   | `SMALLINT`     | `NOT NULL DEFAULT 1`     | `1=initiator`, `2=invitee`   |
| `participant_status` | `SMALLINT`     | `NOT NULL`               | 参与状态                     |
| `ringing_at`         | `TIMESTAMPTZ`  | `NULL`                   | 振铃时间                     |
| `answered_at`        | `TIMESTAMPTZ`  | `NULL`                   | 设备接听时间                 |
| `joined_at`          | `TIMESTAMPTZ`  | `NULL`                   | 实际入会时间                 |
| `left_at`            | `TIMESTAMPTZ`  | `NULL`                   | 离会时间                     |
| `end_reason`         | `SMALLINT`     | `NULL`                   | 该参与者结束原因             |
| `created_at`         | `TIMESTAMPTZ`  | `NOT NULL DEFAULT NOW()` | 创建时间                     |
| `updated_at`         | `TIMESTAMPTZ`  | `NOT NULL DEFAULT NOW()` | 更新时间                     |

推荐参与者状态枚举：

- `participant_role`
  - `1 = initiator`
  - `2 = invitee`
- `participant_status`
  - `1 = invited`
  - `2 = ringing`
  - `3 = accepted`
  - `4 = joined`
  - `5 = declined`
  - `6 = busy`
  - `7 = timeout`
  - `8 = left`
  - `9 = superseded_by_sibling_device`

推荐约束：

- `UNIQUE INDEX ux_call_participants_call_device (call_id, device_id)`
- `INDEX idx_call_participants_call_user (call_id, user_id)`
- `INDEX idx_call_participants_user_status (user_id, participant_status, created_at DESC)`
- `INDEX idx_call_participants_conversation_created (conversation_id, created_at DESC)`

关键约束说明：

- `(call_id, device_id)` 唯一，避免同一设备重复写入。
- 不建议对 `(call_id, user_id)` 做唯一约束，因为同一用户多设备同时振铃是明确需求。
- “单用户单设备接通”由服务端状态机保证，而不是单纯依赖数据库唯一索引硬顶。

## 6.3 可选事件流水表

为了排障和竞态回溯，建议增加事件流水表：

- `call_events`

推荐字段：

| 字段名             | 类型           | 约束                     | 说明               |
| ------------------ | -------------- | ------------------------ | ------------------ |
| `id`               | `BIGSERIAL`    | `PRIMARY KEY`            | 内部主键           |
| `call_id`          | `VARCHAR(64)`  | `NOT NULL`               | 关联通话           |
| `conversation_id`  | `BIGINT`       | `NOT NULL`               | 会话 ID            |
| `event_type`       | `VARCHAR(64)`  | `NOT NULL`               | 例如 `call.invite` |
| `request_id`       | `VARCHAR(64)`  | `NULL`                   | 幂等请求 ID        |
| `sender_user_id`   | `BIGINT`       | `NULL`                   | 发送者             |
| `sender_device_id` | `VARCHAR(128)` | `NULL`                   | 发送设备           |
| `payload`          | `JSONB`        | `NOT NULL`               | 原始事件快照       |
| `created_at`       | `TIMESTAMPTZ`  | `NOT NULL DEFAULT NOW()` | 创建时间           |

推荐索引：

- `INDEX idx_call_events_call_created (call_id, created_at ASC)`
- `INDEX idx_call_events_request_id (request_id)`

用途说明：

- 这张表不是主业务状态表，而是审计 / 调试表。
- 如果首版开发压力较大，可以先不建，但我更建议一开始就保留。

## 6.4 通话记录消息模型

建议新增专用消息内容结构，例如：

```json
{
  "type": "call_record",
  "call_id": "call_xxx",
  "scope": "direct",
  "media_type": "video",
  "initiator_user_id": 1001,
  "outcome": "completed",
  "duration_seconds": 128,
  "started_at": "2026-03-30T10:00:00.000Z",
  "ended_at": "2026-03-30T10:02:08.000Z"
}
```

群聊建议扩展参与者摘要，例如：

- `joined_count`
- `declined_count`
- `busy_count`
- `timeout_count`

落库建议：

- 不单独新建“通话记录表”作为用户历史主展示来源。
- 通话记录最终仍写入现有 `messages` 表，作为一种新的消息内容类型。
- 这样可以直接复用：
  - 现有会话时间线
  - 同步机制
  - 多端消息拉取
  - 搜索和跳转入口

建议消息内容示例：

```json
{
  "type": "call_record",
  "call_id": "call_xxx",
  "scope": "group",
  "media_type": "audio",
  "initiator_user_id": 1001,
  "outcome": "completed",
  "duration_seconds": 302,
  "started_at": "2026-03-30T10:00:00.000Z",
  "ended_at": "2026-03-30T10:05:02.000Z",
  "summary": {
    "joined_count": 4,
    "declined_count": 1,
    "busy_count": 1,
    "timeout_count": 2
  }
}
```

## 6.5 语音消息模型

建议新增独立语音消息内容结构，至少包含：

- `type`
  - `voice_message`
- `url`
- `duration_seconds`
- `mime_type`
- `size`
- `waveform`
  - 可选，首版可先不做

说明：

- `duration_seconds` 必须由客户端和服务端共同约束，最大不超过 `60` 秒。
- 语音消息虽然也可能存储为音频文件，但不应继续作为“普通附件消息快捷入口”处理。

落库建议：

- 语音消息不单独新建消息主表。
- 继续写入现有 `messages` 表。
- `messages.type` 可以继续沿用当前文件/媒体类型，或在现有消息体系中新增更细的媒体类型枚举。
- 如果现有消息模型允许 `content` 多态，推荐直接新增 `voice_message` 内容类型，不强行复用普通附件结构。

建议消息内容示例：

```json
{
  "type": "voice_message",
  "url": "https://cdn.example.com/voice/abc.m4a",
  "duration_seconds": 27,
  "mime_type": "audio/mp4",
  "size": 182304,
  "waveform": [3, 8, 11, 7, 4, 9, 12, 6]
}
```

## 6.6 与现有表的关系

建议关系如下：

- `call_sessions.conversation_id -> conversations.id`
- `call_participants.call_id -> call_sessions.call_id`
- `call_participants.conversation_id -> conversations.id`
- 通话记录消息写入现有 `messages` 表，并与 `conversations.id` 关联
- 语音消息同样写入现有 `messages` 表

说明：

- `call_sessions` 和 `call_participants` 负责实时会话状态。
- `messages` 负责用户可见的历史沉淀。
- 不建议让 `messages` 直接承担实时通话状态机，因为查询、并发和状态回写会变得很脆弱。

## 7. 信令协议设计

## 7.1 事件清单

建议至少包含以下事件：

- `call.invite`
- `call.ringing`
- `call.accept`
- `call.reject`
- `call.busy`
- `call.timeout`
- `call.cancel`
- `call.end`
- `call.offer`
- `call.answer`
- `call.ice-candidate`
- `call.state-sync`
- `call.media-state`

说明：

- 语音消息不使用这套 signaling 事件。
- 语音消息继续走消息发送协议，但需要新增专用消息内容模型与录制入口。

## 7.2 协议承载与事件风格

- signaling 承载在现有 `WebSocket` 上，不单独新增第二条通话专用长连接。
- 推荐区分两类事件：
  - 请求类事件：
    - `call.invite.request`
    - `call.accept.request`
    - `call.reject.request`
    - `call.end.request`
  - 广播 / 同步类事件：
    - `call.invited`
    - `call.ringing`
    - `call.accepted`
    - `call.rejected`
    - `call.busy`
    - `call.timeout`
    - `call.ended`
    - `call.state-sync`
    - `call.media-state`
- 客户端不能直接把本地状态视为最终状态，必须以服务端回写和广播为准。
- `call.media-state` 用于同步参与者运行时设备能力变化：
  - 麦克风断开
  - 摄像头断开
  - 纯语音 / 只看不说 / 只听不说等参与模式变化

## 7.2 设计原则

- 每个 signaling 事件都必须具备：
  - `call_id`
  - `conversation_id`
  - `sender_user_id`
  - `sender_device_id`
  - `timestamp`
- 事件应尽量幂等。
- 服务端必须校验事件是否与当前权威状态兼容。
- 对于重复事件、过期事件、非法状态迁移，服务端应拒绝或忽略，并回发同步状态。

## 7.3 关键事件字段约束

所有 signaling 事件建议共用以下基础字段：

- `messageClassify`
- `call_id`
- `conversation_id`
- `call_scope`
- `media_type`
- `sender_user_id`
- `sender_device_id`
- `timestamp`
- `request_id`

说明：

- `request_id` 用于幂等和排障。
- `call_scope` 明确区分单聊与群聊事件处理路径。
- `media_type` 保持 `audio` / `video` 两种固定值，避免隐式推断。

## 7.4 邀请事件示例

```json
{
  "messageClassify": "call.invite",
  "call_id": "call_xxx",
  "conversation_id": "c_100",
  "scope": "group",
  "media_type": "audio",
  "sender_user_id": 1001,
  "sender_device_id": "device_a",
  "target_user_ids": [1002, 1003, 1004],
  "timeout_seconds": 45,
  "timestamp": "2026-03-30T10:00:00.000Z"
}
```

## 7.5 服务端处理原则

- `call.invite`
  - 创建通话会话
  - 创建参与者记录
  - 向目标用户所有在线设备分发振铃事件
- `call.accept`
  - 服务端先检查用户当前是否已被其他设备接通
  - 若允许接听，则把该用户其他设备立即收敛为已处理状态
- `call.reject`
  - 更新当前用户参与者状态为拒绝
- `call.busy`
  - 由服务端根据当前活跃通话状态判定，不依赖客户端自报
- `call.timeout`
  - 由服务端定时器或延迟任务统一触发
- `call.end`
  - 更新通话会话状态
  - 结束参与者状态
  - 生成通话记录消息

## 7.6 状态同步事件

建议提供 `call.state-sync` 事件用于以下场景：

- 客户端重连后恢复当前通话状态
- 多设备之间状态重新收敛
- 客户端本地状态与服务端权威状态不一致时进行覆盖修正

## 8. 状态机设计

## 8.1 单聊状态机

发起方视角：

- `idle`
- `calling`
- `ringing`
- `connected`
- `ended`
- `cancelled`
- `busy`
- `timeout`
- `failed`

被叫方视角：

- `idle`
- `incoming`
- `ringing`
- `connected`
- `declined`
- `busy`
- `timeout`
- `ended`

关键竞态需要提前定义：

- 发起方取消，接收方几乎同时接听
- 超时触发时，接收方刚刚点击接听
- 多设备同时收到来电，其中一个设备已接听

推荐裁决规则：

- `cancel` 已被服务端成功写入终态后，后续 `accept` 一律失败，并返回“通话已结束”。
- `timeout` 已被服务端成功写入终态后，后续 `accept` 一律失败，并返回“通话已超时”。
- 某设备接听成功后，同一用户其他设备收到 `superseded_by_sibling_device` 终态。
- 用户处于有效通话中时，新来电由服务端直接判定为 `busy`。

## 8.2 群聊状态机

群聊状态不要简单复制单聊模型，建议拆成：

- 会话级状态
  - `initiated`
  - `ringing`
  - `ongoing`
  - `ended`
- 参与者级状态
  - `ringing`
  - `joined`
  - `declined`
  - `busy`
  - `timeout`
  - `left`

群聊的关键点在于：

- 有人接通不代表所有人都接通
- 有人离开不代表通话结束
- 群通话结束条件必须明确

建议首版通话结束规则至少定义清楚：

- 发起方主动结束
- 所有已加入成员都离开
- 无任何成员在超时窗口内加入

本方案已确认：

- 群聊首版人数上限为 `8` 人。
- 发起人离开不自动结束群通话。
- 当最后一个已加入成员离开时，群通话结束。

## 9. coturn 与 SFU 集成方案

## 9.1 coturn 部署原则

- 推荐：
  - 自建 `coturn`
  - 与应用服务分离部署
  - 通过环境变量向 server / Electron 下发 ICE server 配置
- 不建议：
  - 把 TURN 逻辑直接塞进应用服务进程
  - 使用写死账号密码的长期静态凭证

## 9.2 coturn 鉴权建议

- 使用临时凭证方案：
  - 应用服务在呼叫建立前为客户端签发短期 TURN 凭证
  - 客户端仅在当前通话周期内使用
- 这样可以降低：
  - 凭证泄漏风险
  - 长期有效凭证被滥用风险

## 9.3 SFU 选择原则

- 群聊首版既然已确定使用 `SFU`，则需要新增或接入一层媒体转发服务。
- 当前文档暂不锁定具体 SFU 产品，但要求满足：
  - 可与 Electron WebRTC 客户端对接
  - 能被现有服务端 signaling 协调
  - 支持基础的上行发布与下行订阅
  - 支持后续群规模扩展

实际落地时可以在单独子文档中再比较具体实现，如：

- 自建成熟 SFU
- 接入现成媒体服务

但在本方案 v1 中，群聊不再讨论 `mesh` 作为正式方向。

补充约束：

- 首版群聊人数上限按照 `8` 人设计和压测。
- 后续若扩容，需要基于真实 `SFU` 负载和网络指标再评估。

## 10. 弱网与 TURN 策略

## 10.1 TURN 必须首版进入

原因：

- 仅靠 STUN 无法保证复杂 NAT 环境的稳定接通率
- 本地开发能通不代表真实用户环境能通
- 如果首版不引入 TURN，线上体验很容易出现“有时能打、有时不能打”的随机失败

本方案已确认：

- 采用自建 `coturn`
- 通过服务端签发短期凭证供客户端在通话期间使用

## 10.2 弱网处理目标

首版应至少做到：

- 音频优先于视频
- 视频劣化时通话不断开
- 网络抖动时给出明确 UI 提示
- ICE 失败后有可观测日志与明确错误提示

## 10.3 建议的弱网策略

- 默认优先保活音频流
- 视频在高丢包 / 高延迟下允许自动降级
- 提供本地网络质量提示：
  - 网络较差
  - 正在重连
  - 视频已降级
- 记录关键质量指标供后端排障

## 11. Electron 端实现要点

## 11.1 权限

需要处理：

- 麦克风权限请求
- 摄像头权限请求
- 权限被拒绝后的明确提示
- 设备不可用或被占用时的提示

不能把“没有声音 / 没有画面”都归结为网络问题。

## 11.2 通话 UI

至少包含：

- 呼叫发起态
- 来电弹窗
- 通话中窗口
- 挂断按钮
- 静音按钮
- 开关摄像头按钮
- 成员状态展示

群聊首版还需要明确展示：

- 哪些成员正在振铃
- 哪些成员已加入
- 哪些成员拒绝 / 忙线 / 超时

补充能力边界：

- 首版支持视频通话中关闭摄像头并退化为纯语音通话。
- 语音通话升级为视频通话后置，不纳入当前首发闭环。

## 11.3 语音消息 UI

至少包含：

- “按住说话”的明确入口
- 录音中状态
- 波形与已录制时长提示
- 达到 `60` 秒上限时自动停止
- 松开发送
- 不做上滑取消
- 会话中的语音消息播放控件
- 麦克风权限被拒绝时，明确提示用户开通权限

补充约束：

- 录制文件编码格式为 `m4a/aac`
- 少于 `1` 秒的录音不发送

如果要对齐成熟 IM 体验，建议在交互上明确区分：

- 麦克风按钮：
  - 发起实时语音通话
- 摄像头按钮：
  - 发起实时视频通话
- 语音消息入口：
  - 独立的“按住说话”交互区域或切换态

避免用户把两种能力混淆。

## 12. 服务器职责拆解建议

建议至少拆分为以下服务职责：

- `call_service`
  - 创建 / 更新 / 结束通话会话
  - 维护通话状态机
- `call_participant_service`
  - 维护参与者和设备状态
  - 处理多设备振铃与收敛
- `call_signal_gateway`
  - 基于现有 `WebSocket` 分发 signaling
  - 处理断线重连后的状态同步
- `call_record_service`
  - 在通话结束后生成会话记录消息
- `turn_credential_service`
  - 为客户端签发短期 TURN 凭证

## 13. 实施拆解建议

## 13.1 Step 1：服务端通话域基础设施

- 建立通话领域模型与数据库结构
- 定义服务端状态机
- 增加 signaling 事件处理入口
- 增加超时与忙线判定

交付结果：

- 服务端可以创建和维护通话生命周期

## 13.2 Step 2：Electron 单聊语音

- 接入来电 / 去电 UI
- 接入麦克风采集
- 完成单聊语音闭环

交付结果：

- Electron 单聊语音可稳定打通

## 13.3 Step 3：Electron 单聊视频

- 接入摄像头采集与本地预览
- 接入远端视频渲染
- 完成单聊视频闭环

交付结果：

- Electron 单聊视频可稳定打通

## 13.4 Step 4：coturn 接入与弱网增强

- 部署 `coturn`
- 接入短期凭证签发
- 在客户端使用动态 ICE server 配置
- 增加弱网提示和质量日志

交付结果：

- 单聊在复杂网络环境中的接通率明显提升

## 13.5 Step 5：群聊 SFU 通话

- 接入 SFU
- 完成群聊 signaling 和成员状态同步
- 完成群聊加入 / 离开 / 结束闭环

交付结果：

- 群聊首版实时通话可用

## 13.6 Step 6：语音消息能力

- 增加 Electron 侧麦克风录制入口
- 增加 `60` 秒限制与录制中状态
- 完成语音上传、消息发送与播放闭环

交付结果：

- 语音消息形成独立闭环，不与实时通话链路混用

## 13.7 Step 7：通话记录与历史沉淀

- 通话结束时写入记录消息
- 在会话中展示通话结果、类型与时长

交付结果：

- 历史消息可回溯通话结果

## 13.8 Step 8：验证、运维与发布准备

- 增加测试、回归清单和运行指标
- 增加 TURN / SFU 运维文档

交付结果：

- 形成可排障、可发布版本

## 14. 验证与可观测性

## 14.1 必测场景

- 单聊语音正常发起与接听
- 单聊视频正常发起与接听
- 来电拒绝
- 发起后取消
- 超时未接
- 忙线返回
- 多设备同时振铃
- 某设备接听后其他设备收敛
- 群聊多人加入 / 离开
- 断网、切网、短暂重连
- 摄像头 / 麦克风权限拒绝
- 设备热插拔或被其他应用占用

## 14.2 关键指标

建议首版就采集：

- 呼叫发起次数
- 接通率
- 平均接通时延
- 拒绝率
- 忙线率
- 超时率
- 平均通话时长
- ICE 失败率
- TURN 使用率
- 通话中断率

本方案已确认：

- 以上基础指标属于首版范围，不后置。

## 15. 主要风险与规避

## 15.1 群聊规模失控

风险：

- 群聊人数一多，媒体拓扑和带宽压力急剧上升。

规避：

- 首版设置明确的群通话人数上限
- 协议和状态机提前按可扩展方案设计

## 15.2 信令竞态

风险：

- 取消、接听、超时、忙线同时发生时，客户端很容易出现状态分裂。

规避：

- 服务端维护权威状态
- 所有事件幂等化
- 客户端提供状态重同步能力

## 15.3 多设备鬼状态

风险：

- 一个设备接听，另一个设备还在响铃或残留在通话界面。

规避：

- 设备级和用户级状态分开建模
- 某设备接通后立即广播同账号其他设备的终态

## 15.4 线上环境接不通

风险：

- 本地测试正常，真实公网用户接通率很差。

规避：

- 首版即接入 TURN
- 在开发阶段就模拟高延迟、丢包和弱网环境

## 15.5 需求边界蔓延

风险：

- 群聊一旦做起来，很容易继续追加会议类功能，导致首版迟迟无法闭环。

规避：

- 明确首版只做基础实时通话闭环
- 将主持、屏幕共享、举手、录制等能力明确后置

## 16. 当前结论

- 方案 v1 已冻结以下方向：
  - 单聊 `P2P`
  - 群聊 `SFU`
  - 自建 `coturn`
  - 服务端权威状态
  - 单用户单设备接通
- 当前已经可以进入“按步骤实施”的阶段。
- 下一步应优先把 signaling 状态机、数据表结构与服务端职责拆分落成代码任务。

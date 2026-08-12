# 架构文档索引

本目录收录 mushroom-app 的模块架构与设计文档。除 `*-legacy-*.md` 为历史决策档案外，所有文档遵循统一 12 节大纲（业务流程 / 策略 / 平台分层 / 核心代码 / API / WS / DB / 约束 / 缺口 / Changelog）。

文档语言：中文（UTF-8 无 BOM，LF）。

## 通信与实时

| 文档                                             | 一句话说明                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| [websocket.md](./websocket.md)                   | WS 长连接：38 个 classify、心跳/超时、Redis 跨节点扇出、presence TTL  |
| [messaging.md](./messaging.md)                   | 消息流水线：outbox、增量同步、system message、已读、撤回、转发        |
| [conversation-group.md](./conversation-group.md) | 会话与群组：17 端点、三级角色、群设置、转让/解散、用户级状态分表      |
| [reactions.md](./reactions.md)                   | 消息表情回应：单 user 单 emoji、会话级游标、墓碑软删、outbox 全员派发 |
| [realtime-call.md](./realtime-call.md)           | 实时通话：1v1 P2P + coturn HMAC、群组 LiveKit SFU、ringing/超时       |
| [presence.md](./presence.md)                     | 在线状态：device 维护 / user 聚合、Redis TTL 70s、按需订阅 + 隐私桶化 |
| [push-notification.md](./push-notification.md)   | 推送：FCM/APNs、群内 mention only、mute 决策、设备路由                |

## 账号与社交

| 文档                                                       | 一句话说明                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| [auth.md](./auth.md)                                       | 鉴权：JWT + opaque refresh、30s grace replay、强制下线 reason、14 项缺口 |
| [account-privacy.md](./account-privacy.md)                 | 账号隐私：block、who-can-add-me、phone/email 可见性、presence 暴露       |
| [contacts.md](./contacts.md)                               | 联系人：单向 owner 视角、软删、手机号匹配、全量 + 本地 diff 同步         |
| [multi-account-isolation.md](./multi-account-isolation.md) | 多账号隔离：per-uid 缓存、IPC 桥、SQLite/MMKV/IndexedDB 分库             |

## 媒体

| 文档                                 | 一句话说明                                                |
| ------------------------------------ | --------------------------------------------------------- |
| [media-upload.md](./media-upload.md) | 分片上传：chunk size、断点续传、`/api/config/limits` 派发 |
| [media-cache.md](./media-cache.md)   | 客户端媒体缓存：LRU 配额、加密、缩略图链路                |

## 基础设施

| 文档                                   | 一句话说明                                                          |
| -------------------------------------- | ------------------------------------------------------------------- |
| [db-migrations.md](./db-migrations.md) | 三端数据库迁移：Postgres + SQLite×2、版本表、20+ 表清单、14 项缺口  |
| [config.md](./config.md)               | 配置管理：四端 .env 分治、`/api/config/limits` 懒加载、灰度开关稀缺 |
| [logging.md](./logging.md)             | 日志：LOG_LEVEL / 文件轮转 / 端侧采样                               |

## 构建与发布

| 文档                                     | 一句话说明                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| [electron-build.md](./electron-build.md) | 桌面端：electron-vite + builder、renderer = web 同源、多实例、未签名   |
| [mobile-build.md](./mobile-build.md)     | 移动端：RN 0.85 bare、Hermes + 新架构、三推并存、无 OTA / 无 mobile CI |

## 专项实现档案（横切模块）

| 文档                                                   | 一句话说明                                                                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [group-read-and-typing.md](./group-read-and-typing.md) | 群聊已读回执 + typing 群扇出：协议、数据模型、三端聚合规则、回归清单（架构层事实已回写 websocket / messaging / account-privacy / conversation-group） |

## 历史档案（legacy）

| 文档                                                               | 说明                                                      |
| ------------------------------------------------------------------ | --------------------------------------------------------- |
| [realtime-call-legacy-plan.md](./realtime-call-legacy-plan.md)     | 通话早期规划（已迁入 `realtime-call.md`，保留以追溯决策） |
| [realtime-call-legacy-design.md](./realtime-call-legacy-design.md) | 通话早期设计稿（同上）                                    |

---

## 写作规范

- 使用 `~/.config/opencode/skills/architecture-doc/references/outline.md` 的 12 节大纲。
- 代码引用统一 `file_path:line` 形式；不复制大段代码。
- 必含 mermaid 组件图（至少 1 张）+ §11「现状缺口与 Roadmap」+ §12 Changelog。
- 互相覆盖的小节用相对链接互链而非复述。

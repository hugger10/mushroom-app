# 移动端通知铃声系统

> 适用范围：mushroom-app 移动端（`apps/mobile`）「消息通知铃声」的选择、试听、前台展示与后台/锁屏态生效。
>
> 关联文档：推送全链路 `docs/architecture/push-notification.md`；设计决策过程 `docs/plan/sound.md`。
> 参考实现：`element-hq/element-x-ios`、`element-hq/element-x-android`。

---

## 1. 模块概述

### 1.1 目标

- 在移动端通知设置页提供「消息铃声」选择：**系统默认 / 静音 / App 内置（Mushroom、Fade）/ iOS 系统铃声 / Android 系统选择器自定义**。
- 铃声偏好**仅本地存储**（MMKV `deviceStorage`），不参与服务端同步；服务器只为 iOS 加 `mutable-content` 标记以触发 NSE，不存铃声字段。
- iOS 后台/锁屏态通过 **Notification Service Extension（NSE）+ App Group** 纯本地生效。

### 1.2 非目标

- 来电铃声选择（保持 callkeep + `incoming_ring` 链路，后续单独处理）。
- 自定义铃声文件导入（v1 不做，避免音频转码与跨端格式差异成本）。
- 桌面端（web/electron）适配。
- 铃声偏好服务端同步。

---

## 2. 数据模型

### 2.1 偏好字段（`src/platform/notification-preferences.ts`）

| 字段                 | 类型             | 说明                                                                                                      |
| -------------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `messageSound`       | `string \| null` | `null`=系统默认；`"silent"`；`"message"`/`"fade"` 内置；`"system:<iOS名>"`；`"content://..."` Android URI |
| `messageSoundLabel?` | `string`         | 仅 Android 自定义铃声：系统选择器返回的标题，`normalize` 时非 `content://` 一律清除                       |

- 默认值 `null`（保持现行为：系统默认）。
- `fromServerNotificationSettings` 恢复时**保留本地铃声字段**（`messageSound` 不回填为 null）。
- 归一化/序列化辅助集中在 `src/platform/alert-tones/types.ts`（纯函数，可单测）。

### 2.2 核心派生（`alert-tones/types.ts`）

- `getMessagesChannelId(sound)`：`mushroom-messages-{shortHash(sound ?? "default")}`，hash 用零依赖 FNV-1a 32 位 → 8 位 hex。
- `messageSoundToIosSound(sound)`：`null → "default"`；`"silent" → null`（省略 ios.sound）；内置/系统音 → `currentAlert.wav` / `currentAlert.caf`。
- `messageSoundToAndroidSound(sound)`：`null → "default"`；`"silent" → 省略`；内置 → raw 名；`content://` 直传。

---

## 3. 平台差异矩阵

| 环节         | iOS                                                | Android                                    |
| ------------ | -------------------------------------------------- | ------------------------------------------ |
| 系统铃声来源 | 原生硬编码 17 个 + 存在性检测（模拟器为空）        | 系统 `RingtonePicker`（不枚举）            |
| 系统铃声生效 | 拷贝到沙盒固定文件 `Library/Sounds/currentAlert.*` | 存 `content://` URI，版本化渠道引用        |
| 后台/锁屏态  | NSE（`mutable-content`）+ App Group 读状态文件     | 渠道天然生效                               |
| 内置铃声     | main bundle `Mesh/Sounds/message.wav` + `fade.wav` | `res/raw/message.wav` + `element_fade.wav` |
| 切换生效方式 | 覆盖固定文件 + NSE 读固定名                        | 版本化重建渠道（声音变化即新渠道 id）      |

---

## 4. 核心模块

### 4.1 `apps/mobile/src/platform/alert-tones/`

| 文件                     | 职责                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `types.ts`               | `MessageSound` 模型、normalize、iOS/Android 声音派生、渠道 id 派生（纯函数）              |
| `builtin-tones.ts`       | 内置铃声注册表（iOS 文件名 / Android raw 名）                                             |
| `tone-bridge.ios.ts`     | 调 `AlertToneManager` 原生模块；试听播放沙盒固定文件                                      |
| `tone-bridge.android.ts` | 调 `MushroomRingtone` 系统选择器；内置音试听                                              |
| `tone-manager.ts`        | 统一入口：`resolveToneOptions` / `selectTone` / `previewTone` / `runIosToneFallbackCheck` |

### 4.2 iOS 原生

| 文件                                     | 职责                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `ios/Mesh/AlertToneManager.swift` + `.m` | `getSystemTones` / `setTone`（拷贝固定文件 + 写 NSE 状态）/ `checkToneFile` |
| `ios/Mesh/Sounds/{message,fade}.wav`     | 内置铃声（main bundle）                                                     |
| `ios/NotificationServiceExtension/`      | NSE target：读 App Group `NotificationToneState.json` → 设 `content.sound`  |
| `Mesh.entitlements` / `NSE.entitlements` | App Group `group.com.outland.mushroom`                                      |

### 4.3 Android 原生

| 文件                                                            | 职责                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `android/.../ringtone/MushroomRingtoneModule.kt` + `Package.kt` | 拉起系统 `RingtonePicker`，返回 `{ selection, uri, title }`（`selection` 区分 silent / system_default / custom / cancel） |
| `res/raw/{message,element_fade}.wav`                            | 内置铃声 raw 资源                                                                                                         |
| `MainApplication.kt`                                            | 注册 `MushroomRingtonePackage()`                                                                                          |

### 4.4 通知接入（`platform/notifications/`）

- `channels.ts`：`ensureNotificationChannels` 读偏好派生版本化渠道；启动清理其他铃声的旧版本化渠道（`mushroom-messages-*`）；`resetNotificationChannels` 供切换后重建。
- `chat.ts`：iOS `sound` 按 `messageSoundToIosSound` 动态取值；Android 前台通知不设 `android.sound`（由渠道决定）；`call.invite` 分支保持 `incoming_ring.wav` 不动。
- `lifecycle.ts`：启动时 `runIosToneFallbackCheck()`（卸载重装后固定文件丢失 → 回退系统默认）。

---

## 5. 服务器改动

| 文件                                             | 改动                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `server/src/service/push/fcm_push_provider.ts`   | iOS `chat.message` 的 aps 加 `"mutable-content": 1`（call.invite 不动） |
| `server/src/service/push/jpush_push_provider.ts` | iOS notification.ios 加 `mutable_content: true`                         |

不存任何铃声字段、无新增 API。

---

## 6. 关键约束与风险

- **NSE 是独立进程**：不跑 JS；主 App 与 NSE 通过 App Group 共享 `NotificationToneState.json`，音频文件放主 App 沙盒 `Library/Sounds/`，NSE 按固定名 `UNNotificationSound(named:)` 引用（element-x 生产已验证）。
- **App Group 需要 Provisioning Profile 能力**：个人开发者账号需手动在 Apple 开发者后台开启 App Group 并重新生成 Profile。
- **`content://` URI 在 iOS 无意义**：tone-manager 回落系统默认。
- **Android 渠道不可改 sound**：只能版本化重建渠道，切换铃声即时调用 `ensureNotificationChannels`。
- **内置铃声为占位生成**：`message.wav` / `fade.wav` 由脚本生成（简单合成音），开发者可替换为正式音频，无版权顾虑。

---

## 7. 测试

- `apps/mobile/test/alert-tones.test.mjs`：normalize / round-trip / iOS sound 派生 / Android 渠道 id 派生。
- `server/test/fcm-push-provider.test.mjs`、`server/test/jpush-push-provider.test.mjs`：`mutable-content` / `mutable_content` 断言。
- 双端真机手测：前台试听切换、后台/锁屏推送实际铃声、静音、系统默认、Android 系统选择器。

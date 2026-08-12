# 移动端通知铃声系统设计（sound.md）

> 本文档完整记录与 AI 的调研、沟通、决策过程，以及最终确认的方案设计。
> 参考实现：`element-hq/element-x-ios`、`element-hq/element-x-android`，并核实了本项目依赖
> `@notifee/react-native` 的 Android/iOS 原生声音解析逻辑（见 §2.4）。

---

## 1. 目标与范围

| 目标             | 说明                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| 消息通知铃声选择 | 在移动端通知设置页新增「消息铃声」选项，可试听并切换                         |
| 铃声来源         | 系统默认 / 静音 / App 内置铃声 / 系统铃声（平台相关）                        |
| 平台范围         | iOS + Android 双端                                                           |
| iOS 后台态       | 通过 Notification Service Extension（NSE）+ App Group 实现，纯本地（§5.2-A） |
| 偏好存储         | 仅本地 MMKV（`deviceStorage`），不参与服务端同步                             |
| 范围外           | 来电铃声、自定义铃声文件导入、桌面端（web/electron）适配                     |

---

## 2. 调研记录

### 2.1 element-x-ios 的铃声机制

仓库：`https://github.com/element-hq/element-x-ios`

**铃声文件分布（三类来源）：**

1. **App 自带铃声（仓库内仅 2 个）** —— 位于 `ElementX/Resources/Sounds/`：
   - `message.caf` —— Element 默认消息铃声（`NotificationSound.ElementDefault`）
   - `sound_01.caf` —— "Fade" 铃声（`NotificationSound.ElementFade`）

2. **系统内置铃声（不在仓库，来自 iOS 系统目录 `/System/Library/Audio/UISounds/`）** ——
   清单硬编码在 `ElementX/Sources/Services/AlertTones/NotificationToneManager.swift` 的
   `defaultSystemAlerts` 中，运行时用 `checkResourceIsReachable()` 检测文件存在性，不存在则过滤：
   - 传统铃声：`sms-received1.caf`(TriTone) ~ `sms-received6.caf`(Electronic)、`alarm.caf`(Alert)、`Swish.caf`、`tweet_sent.caf`
   - iOS 新铃声（`New/` 子目录，共 17 个）：
     `Bloom.caf`、`Calypso.caf`、`Anticipate.caf`、`Choo_Choo.caf`、`Descent.caf`、`Fanfare.caf`、`Ladder.caf`、`Minuet.caf`、`News_Flash.caf`、`Noir.caf`、`Sherwood_Forest.caf`、`Spell.caf`、`Suspense.caf`、`Telegraph.caf`、`Tiptoes.caf`、`Typewriters.caf`、`Update.caf`

3. **用户自定义铃声** —— 存储在 App 沙盒 `Library/Sounds/AvailableSounds/`，由
   `NotificationToneManager` 统一转为 `.caf` 格式管理。

**核心机制（关键设计）：**

- 数据模型 `NotificationTone`：`label`（显示名）+ `storageLocationRoot`（`system` / `appBundle` / `appLibrary`）+ `relativePath`。
- **选中机制**：无论选择系统 / 内置 / 自定义铃声，都**拷贝到 App 沙盒固定文件名
  `Library/Sounds/currentAlert.caf`**（`NotificationToneManager.selectedToneFilename`），
  通知展示统一引用该固定文件。这样：
  - iOS 的 `UNNotificationSound(named:)` 只能播放 App 沙盒内文件，通过拷贝规避了
    不能直接引用 `/System/Library/Audio/UISounds/` 的限制；
  - 切换铃声时只需覆盖固定文件，通知展示代码零改动。
- **后台/锁屏态铃声（NSE）**：主 App 之外还带一个 **Notification Service Extension**
  （`NSE/` 目录，独立 appex target）。服务器对 iOS 消息推送只发 `mutable-content: 1`，
  **不携带任何铃声字段**；iOS 收到带 `mutable-content` 的推送后，即使 App 被杀也会拉起
  NSE（约 30s 窗口），NSE 读取本地共享的铃声选择并设置 `content.sound`：
  - `NotificationContentBuilder.swift:52` —— `content.sound = item.isNoisy ? .init(named: notificationSoundName) : nil`；
  - `CommonSettings+NotificationName.swift` —— 未选自定义 → `"message.caf"`；选了 →
    `NotificationToneManager.selectedToneFilename`（即 `currentAlert.caf`）；
  - 主 App 与 NSE 通过 **App Group**（`com.apple.security.application-groups`，
    见 `ElementX.entitlements` / `NSE.entitlements`）共享设置与状态文件。
  - 服务器侧只需在 payload 加 `mutable-content: 1`，**无需知道具体铃声、无需存储偏好**。

### 2.2 element-x-android 的铃声机制

仓库：`https://github.com/element-hq/element-x-android`

**与 iOS 完全不同：Android 端不预置系统铃声清单，直接复用系统铃声选择器。**

**数据模型**（`libraries/preferences/api/.../store/NotificationSound.kt`）：

```kotlin
sealed interface NotificationSound {
    data object SystemDefault  // 系统默认
    data object ElementDefault // 内置 message 音（R.raw.message，仅消息渠道有意义）
    data object ElementFade    // 内置 fade 音（R.raw.element_fade，仅消息渠道有意义）
    data object Silent         // 静音
    data class Custom(uri)     // 系统选择器返回的 content:// URI
}
```

**App 内置铃声仅 2 个**（对应 iOS 的两个）：`R.raw.message`、`R.raw.element_fade`。

**系统铃声选择**（`features/preferences/impl/.../NotificationSoundPicker.kt`）：
通过 `Intent(RingtoneManager.ACTION_RINGTONE_PICKER)` 拉起系统铃声选择器：

```kotlin
Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
    putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_NOTIFICATION) // 或 TYPE_RINGTONE
    putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
    putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, true)
    putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI, defaultUri)
    // EXTRA_RINGTONE_EXISTING_URI 预选当前铃声
}
```

选择结果映射：

- 返回 `null` URI → `Silent`
- 返回 URI == `defaultUri` → `SystemDefault`
- 其他 URI → `Custom(uri)`

**持久化与渠道重建**：

- 铃声以字符串存 DataStore（`null` / `"silent"` / `"element_default"` / `"element_fade"` / `uri`）。
- 消息与来电两个通道各存一份（`messageSound` / `callRingtone`），切换时**版本号递增**，
  用带版本号的渠道 id（如 `mushroom-messages-v{N}`）重建通知渠道 —— 因为 Android 渠道创建后
  `sound` 属性不可修改。

### 2.3 iOS vs Android 差异对照表

| 环节            | iOS（element-x-ios）                            | Android（element-x-android）               |
| --------------- | ----------------------------------------------- | ------------------------------------------ |
| 系统铃声来源    | 硬编码清单 + 运行时存在性检测                   | 系统 `RingtonePicker`（不枚举）            |
| 系统铃声生效    | 拷贝到沙盒固定文件 `currentAlert.caf`           | 存 `content://` URI，渠道引用              |
| 后台/锁屏态     | NSE（`mutable-content: 1`）+ App Group 共享状态 | 渠道即天然生效（JS 后台 handler 重建渠道） |
| 内置铃声        | `message.caf` + `sound_01.caf`（bundle）        | `R.raw.message` + `R.raw.element_fade`     |
| 静音 / 系统默认 | 支持                                            | 支持                                       |
| 自定义导入      | 支持（文件导入转 CAF）                          | 仅系统选择器（不做文件导入）               |
| 切换生效方式    | 覆盖沙盒固定文件 + NSE 读固定名                 | 版本化重建通知渠道                         |

### 2.4 本项目依赖 notifee 的声音解析核实

本项目移动端通知展示全部走 `@notifee/react-native`，需确认它在两端的 `sound` 能力。

**Android**（反编译 `android/libs/.../core-*.aar` 中 `app.notifee.core.a` 与
`n.o.t.i.f.e.e.r.c(String)`，及官方文档 Behaviour → Device Sound）：

| 传给 `createChannel({ sound })` 的值                        | notifee 解析行为                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `"default"`                                                 | `RingtoneManager.getDefaultUri(TYPE_NOTIFICATION)`（跟随系统默认） |
| 含 `://` 的字符串（如 `content://media/...`）               | 直接 `Uri.parse(...)`，**原生支持系统铃声 URI**                    |
| raw 资源名（如 `"message"`、`"incoming_ring"`，可带扩展名） | 解析为 `android.resource://<pkg>/raw/<名>`                         |
| 其他无法解析的值（`null`/空串/未知名）                      | `setSound(null, null)` = **静音**                                  |

结论：**Android 端所有铃声来源（系统默认 / 静音 / 内置 raw / 系统选择器 URI）都能由
notifee 的 JS `createChannel` 完成**，无需自写原生建渠道逻辑（§5.2-B 据此裁剪）。

**iOS**（`ios/NotifeeCore/NotifeeCore.m:367-419`）：

- 仅当 `ios.sound` 被提供时才设置 `content.sound`；
- `"default"` → `UNNotificationSound.defaultSound`；其他 → `UNNotificationSound soundNamed:`（从
  App 容器 `Library/Sounds/` 解析文件，`NotifeeCore.m:414`）；
- **省略 `ios.sound` → `content.sound = nil` = 静音**（无需静音音频文件）。

---

## 3. 沟通与决策记录（按时间顺序）

### 3.1 起点：定位 element-x-ios 的通知铃声文件

**提问**：手机安装了 element-x-ios App，有很多通知铃声，项目里哪里能看到这些文件？

**结论**：

- 仓库内自带铃声只有 2 个：`ElementX/Resources/Sounds/message.caf` 与 `sound_01.caf`。
- 铃声列表中的大部分（Bloom、Calypso 等 17 个）来自 **iOS 系统自带**，位于
  `/System/Library/Audio/UISounds/New/`，由 `NotificationToneManager.swift` 硬编码引用；
  在手机「设置 → 声音与触感 → 短信铃声」里同样能看到这些选项。
- 用户自定义铃声存放在 App 沙盒 `Library/Sounds/AvailableSounds/`。

### 3.2 确认系统铃声归属

**提问**：`Bloom.caf、Calypso.caf、Anticipate.caf、Choo_Choo.caf、Descent.caf、Fanfare.caf、Ladder.caf、Minuet.caf、News_Flash.caf、Noir.caf、Sherwood_Forest.caf、Spell.caf、Suspense.caf、Telegraph.caf、Tiptoes.caf、Typewriters.caf、Update.caf` 这些是手机自带的吗？

**结论**：是的，全部是 iPhone/iOS 系统自带铃声，位于 `/System/Library/Audio/UISounds/New/`，
由苹果随 iOS 提供，**不是** Element X App 附带。Element X 只是按文件名引用，运行时检测文件存在才展示。

### 3.3 移动端方案设计 + 第一轮决策

**提问**：如果我的移动端也要做成这种方式，如何设计？

**初步方案要点**：`NotificationTone` 模型、选中铃声统一拷贝到沙盒固定文件、`src/platform/alert-tones/` 模块划分、iOS/Android 平台差异处理。

**用户确认的第一轮决策（Q1~Q4）：**

| 决策项            | 结论                                                    |
| ----------------- | ------------------------------------------------------- |
| Q1 平台范围       | **iOS + Android 双端**                                  |
| Q2 系统铃声列表   | **要，做原生枚举**（iOS/Android 各加轻量原生模块）      |
| Q3 自定义铃声导入 | **支持导入**（用现有 `@react-native-documents/picker`） |
| Q4 偏好同步       | **仅本地存储**（对齐 Element X，不占用服务端字段）      |

### 3.4 调研 element-x-android，方案修正

**提问**：`element-hq/element-x-android` 是 Android 端 App，它有哪些铃声？

**结论**（详见 §2.2）：

- 内置铃声 2 个：`R.raw.message`、`R.raw.element_fade`。
- **不预置系统铃声清单**，而是调系统 `RingtonePicker`（`ACTION_RINGTONE_PICKER`），
  用户看到的就是手机系统全部通知声音，App 不枚举。
- 铃声模型为 sealed interface：`SystemDefault / ElementDefault / ElementFade / Silent / Custom(uri)`。
- 切换铃声通过**版本号递增重建通知渠道**生效。

**方案修正（v2）**：Android 侧从「原生枚举系统铃声」改为「封装系统 `RingtonePicker`」——
Android 系统本身就提供选择器 UI，比自建枚举更省事、体验更统一（对齐 element-x-android）。

### 3.5 最终范围确认（Q5）

**提问**：本次铃声系统的范围包含来电铃声吗？

**结论**：**仅消息铃声**。来电铃声保持现有 callkeep + `incoming_ring.wav` 链路不动，后续单独处理。

### 3.6 第二轮 grilling（Q1~Q9，本轮确认）

| 决策项                 | 结论                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| 内置铃声               | **保留**，由开发者提供 `message` / `fade` 两个音频文件（个人验证，无版权顾虑）                        |
| Android 原生模块范围   | **只留 Picker**（返回 `{ uri, title }`）；渠道重建砍掉，改由 notifee JS 完成（见 §2.4 核实）          |
| iOS 试听机制           | **拷贝到沙盒固定文件后用现有播放器播**；点行即选中并播放（对齐 element-x）                            |
| iOS 后台/锁屏态铃声    | **NSE 方案**（element-x 同款）：纯本地，服务器只加 `mutable-content: 1`，不存铃声字段                 |
| 偏好模型               | **单一字符串** `messageSound`（`null`/`"silent"`/`"message"`/`"fade"`/`system:<名>`/`content://...`） |
| Android 设置行标签     | 原生查 `RingtoneManager.getRingtone().getTitle()` 存标题，回退「自定义铃声」                          |
| UI 交互                | 铃声行放「提醒」区、消息开关下、关闭消息时禁用；sheet 选项 + Android 选择器入口流程见 §5.3            |
| Android 选择器结果映射 | 静音→`silent`；系统默认→`null`（跟随系统）；具体→URI+标题                                             |
| NSE 共享状态形态       | 独立 `NotificationToneState.json`（App Group 容器），**不动现有 `deviceStorage`**                     |

---

## 4. 最终确认的决策汇总

| 决策项                 | 结论                        | 说明                                                                                                        |
| ---------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 平台范围               | iOS + Android 双端          | 两端共享一套偏好模型                                                                                        |
| 系统铃声（iOS）        | 硬编码清单 + 原生存在性检测 | 对齐 element-x-ios（17 个 `New/` 铃声）；模拟器上为空，需真机验证                                           |
| 系统铃声（Android）    | 封装系统 `RingtonePicker`   | 对齐 element-x-android，不枚举；返回 URI 时一并查询标题                                                     |
| 内置铃声               | 2 个（`message` + `fade`）  | 开发者提供音频文件；iOS 放 main bundle（`Mesh/Sounds/`）；Android 放 `res/raw/`（`message`/`element_fade`） |
| 静音                   | 支持                        | iOS=省略 `ios.sound`；Android=渠道 `sound` 解析为空（`setSound(null)`）                                     |
| 自定义文件导入         | **v1 不做**                 | 仅内置 + 系统铃声来源，避免音频转码与跨端格式差异成本                                                       |
| 偏好存储               | 仅本地 MMKV                 | `messageSound: string \| null` + `messageSoundLabel?: string`；不写入服务端 `UserNotificationSettings`      |
| iOS 后台/锁屏态铃声    | **NSE + App Group**         | 服务器只加 `mutable-content: 1`（FCM）与 `mutable_content`（JPush）；NSE 读共享状态设 `content.sound`       |
| 来电铃声               | 范围外                      | 保持现有 callkeep + `incoming_ring` 链路                                                                    |
| 试听                   | 复用现有播放器              | iOS=拷贝固定文件后播沙盒文件；Android=内置走 `android.resource://`、系统选择器自带试听                      |
| 桌面端（web/electron） | 范围外                      | 本期不做                                                                                                    |

---

## 5. 设计方案

### 5.1 统一数据模型与偏好

**偏好字段**（扩展 `src/platform/notification-preferences.ts`）：

```ts
type MobileNotificationPreferences = {
  // ...现有字段
  /**
   * 消息铃声偏好。缺省/null = 系统默认。
   * 取值：null | "silent" | "message" | "fade" | "system:<iOS名>" | "content://...(Android URI)"
   * 序列化与 Android NotificationSound 心智一致，内存=磁盘同构。
   */
  messageSound: string | null;
  /** 仅 Android 自定义铃声使用：系统选择器返回的标题；iOS/内置由 id 推导显示名。 */
  messageSoundLabel?: string;
};
```

- `normalizeNotificationPreferences` / `saveNotificationPreferences` 中：当 `messageSound`
  不是 `content://` URI 时，强制清除 `messageSoundLabel`（设为 `undefined`），避免残留过期标题。

- 默认值：`messageSound: null`（保持现行为：系统默认）。
- `normalizeNotificationPreferences` / `readNotificationPreferences` /
  `saveNotificationPreferences` / `updateNotificationPreferences` 全部加该字段
  （`messageSound` 归一化为 `string | null`；`messageSoundLabel` 仅当 `messageSound` 为
  `content://` URI 时保留）。
- `fromServerNotificationSettings` / `toServerNotificationSettingsPatch` **剥离铃声字段**，
  不与服务端同步。

- **沙盒文件丢失回退**：`readNotificationPreferences` / `normalizeNotificationPreferences` 中，
  若 `messageSound` 引用特定资源（内置/系统音/自定义 URI），需校验对应文件是否存在：
  iOS 可通过原生 `checkToneFile(name)` 检测沙盒 `Library/Sounds/` 中文件；
  Android 内置 raw 资源随 App 保留不会丢失，`content://` URI 由 Android 系统维护。
  文件不存在时（如卸载重装后沙盒被清除），回退 `messageSound = null`（系统默认）。

**铃声 id → 显示名 / 资源映射**（`src/platform/alert-tones/builtin-tones.ts`）：

```ts
const BUILTIN_TONES = {
  message: { ios: "message.wav", android: "message" }, // iOS bundle 文件名 / Android raw 名
  fade: { ios: "fade.wav", android: "element_fade" }
} as const;
// iOS 系统清单（17 个）在原生层维护 id 列表，JS 侧按 `system:<名>` 推导显示名（i18n）
```

### 5.2 平台实现

#### A. iOS（原生 Swift 模块 + 沙盒拷贝 + NSE）

**① 铃声管理原生模块**（桥接写法仿 `ios/Mesh/VoipPushManager.m` 的 `RCT_EXTERN_MODULE`）：

- `ios/Mesh/AlertToneManager.swift`
- `ios/Mesh/AlertToneManager.m`

接口设计：

```
getSystemTones(callback)  → 硬编码 17 个系统铃声清单（Bloom/Calypso/.../Update），
                            逐项检测 /System/Library/Audio/UISounds/New/ 存在性，
                            返回可用列表（模拟器上为空）
setTone(source, filename) → 把选中文件拷贝到沙盒 Library/Sounds/currentAlert.<ext>
                            （固定文件名机制，对齐 element-x-ios currentAlert.caf；
                             系统目录文件在原生层用 FileManager.copyItem，避开 RN 沙盒限制）
```

- 内置铃声资源：新增 `ios/Mesh/Sounds/message.wav`、`ios/Mesh/Sounds/fade.wav`
  （与现有 `Mesh/CallSounds/` 并列，按 CallSounds 模式手工加入 Xcode target 打进 main bundle）。
- **试听**：点选即触发 `setTone`，然后用现有播放器（`mobileVoiceRecorder` =
  `AudioRecorderPlayer`，AVAudioPlayer）播放 `file://Library/Sounds/currentAlert.<ext>`。

**② Notification Service Extension（NSE，后台/锁屏态生效）**：

- 新增 Xcode target `NotificationServiceExtension`（appex，host = Mesh），手改
  `Mesh.xcodeproj/project.pbxproj`。
- **App Group**：主 App（`Mesh.entitlements`）与 NSE 都加
  `com.apple.security.application-groups = [group.com.outland.mushroom]`；
  需在个人开发者账号的 Provisioning Profile 启用该能力。
- **共享状态文件**：App Group 容器 `Library/NotificationToneState.json`：

  ```json
  { "sound": "currentAlert.wav" | "default" | "silent" }
  ```

  - **写入在原生层完成**：`setTone` 方法内通过 `FileManager.containerURL(forSecurityApplicationGroupIdentifier:)`
    获取 App Group 共享路径并写入 `NotificationToneState.json`。注意 `react-native-fs` 只能访问 App 自身沙盒，
    **无法**访问 App Group 容器，因此 JS 侧不可直接写入。
  - JS 选中铃声或 App 启动时调 `setTone`，原生层同时完成文件拷贝与状态文件写入（不动 `deviceStorage`）。
  - 铃声音频文件本身仍放主 App 沙盒 `Library/Sounds/currentAlert.<ext>`，NSE 按固定名引用。

- **NSE 逻辑**（`NotificationServiceExtension.swift`，纯 Swift 独立进程，不跑 JS）：
  读共享状态文件 → 设置 `content.sound`（`default` → `UNNotificationSound.defaultSound`；
  `silent` → 不设（nil）；`currentAlert.wav` → `UNNotificationSound(named:)`），
  其余 title/body 透传服务器已带的 alert。
- **真机验证项**：确认 NSE 产物中 `UNNotificationSound(named:)` 按主 App 容器
  `Library/Sounds/` 解析音频文件（element-x 生产已验证该链路）。

**③ 前台展示接入**：`src/platform/notifications/chat.ts` 的 iOS `sound` 改为按偏好动态取值：

| messageSound                               | ios.sound              |
| ------------------------------------------ | ---------------------- |
| `null`（系统默认）                         | `"default"`            |
| `"silent"`                                 | 省略（静音）           |
| `"message"`/`"fade"`/`system:*`/自定义拷贝 | `"currentAlert.<ext>"` |
| 上述非 null/silent 但沙盒文件不存在        | 回退为 `"default"`     |

`call.invite` 分支保持 `"incoming_ring.wav"` 不动。

#### B. Android（原生 Kotlin 模块封装系统选择器）

新增原生模块（仿 `com/outland/mushroom/voice/MushroomVoiceRecorderModule.kt`）：

- `android/.../com/outland/mushroom/ringtone/MushroomRingtoneModule.kt`
- `android/.../com/outland/mushroom/ringtone/MushroomRingtonePackage.kt`

接口设计（**只做 Picker，渠道重建走 notifee JS，见 §2.4**）：

```
launchMessageSoundPicker(existingUri) → Promise<{ selection, uri, title }>
   启动 ACTION_RINGTONE_PICKER(TYPE_NOTIFICATION, SHOW_DEFAULT, SHOW_SILENT,
                               DEFAULT_URI, EXISTING_URI)
   结果映射（对齐 element-x-android §2.2，`selection` 区分静音/系统默认）：
     用户取消              → { selection: "cancel" }                // 保持原选择
     null URI              → { selection: "silent", uri: null }     // 静音
     URI == defaultUri     → { selection: "system_default", uri: null } // 系统默认（跟随系统）
     其他                  → { selection: "custom", uri, title: RingtoneManager.getRingtone(ctx, uri)?.title }
```

- 注册：在 `MainApplication.kt` 的 `PackageList(this).packages.apply { add(...) }` 中新增
  `MushroomRingtonePackage()`。
- 内置铃声资源：新增 `android/app/src/main/res/raw/message.wav`、
  `res/raw/element_fade.wav`（raw 资源名使用小写下划线命名，与现有来电 wav 并列）。
- **渠道版本化重建**（在 JS `channels.ts` 完成，不新增原生方法）：
  - 渠道 id 从常量改为按铃声派生的动态 id：`mushroom-messages-v2-{hash(messageSound)}`
    （hash 用零依赖的 FNV-1a 32 位取前 8 位 hex：`shortHash(messageSound ?? "default")`，
    RN JS 无内置 md5，渠道 id 只要求稳定且声音变化即变，无密码学需求），声音变化即产生新渠道；
  - `ensureNotificationChannels` 启动时：删除旧版本渠道
    （`mushroom-messages`、`mushroom-messages-v2`、以及除当前外的所有
    `mushroom-messages-v2-*`），再按当前偏好 `createChannel`；
  - `createChannel` 的 `sound` 取值映射（notifee，见 §2.4）：
    `null → 省略`（静音）、`"default"`、`"message"`/`"fade" → raw 名`、`content://...` 直传。
  - `CALLS_CHANNEL_ID` 保持 `mushroom-calls-v2` + `sound: "incoming_ring"` 不动。

#### C. 前端平台桥

新增 `src/platform/alert-tones/` 目录：

```
alert-tones/
├── types.ts                 # 铃声 id/显示名映射、messageSound 序列化辅助
├── tone-manager.ts          # 统一入口：resolveTones / selectTone / previewTone / syncIosNseState
├── tone-bridge.ios.ts       # 调 AlertToneManager 原生模块（原生层负责 NSE 状态文件写入）
├── tone-bridge.android.ts   # 调 MushroomRingtoneModule 系统选择器
└── builtin-tones.ts         # 内置铃声注册表（iOS 文件名 / Android raw 名）
```

- `selectTone`：iOS 调 `setTone(source, filename)` 拷贝固定文件 + 原生层写 `NotificationToneState.json`
  并持久化 `messageSound`；Android 把选择器返回的 `uri/title` 持久化后，**立即调用
  `ensureNotificationChannels`** 重建渠道（channelsReady 守卫需重置），确保同一运行期内前台通知即刻生效。
- `previewTone`：iOS = 拷贝后播沙盒文件；Android 内置 = `android.resource://` URI 走现有播放器，
  系统铃声由系统选择器自带试听。

### 5.3 UI 改造

修改 `src/features/account/screens/NotificationSettingsScreen.tsx`：

- 「提醒」区新增 **消息铃声** `ValueRow`，置于「消息通知」开关下方；
  `messagesEnabled === false` 时禁用（对齐「提及」依赖「群聊」的现有模式）。
- 设置行 value：系统默认→「系统默认」；静音→「静音」；内置→名称；iOS 系统音→名称；
  Android 自定义→原生返回的标题（回退「自定义铃声」）。
- BottomSheet（复用 `BottomSheetOptionList`）选项：
  - 固定项：系统默认 / 静音 / 内置「Mushroom」/ 内置「Fade」；
  - iOS：追加 17 个系统铃声清单；
  - Android：追加一行 **「选择系统铃声…」** → 关闭 sheet、拉起系统 `RingtonePicker`
    （选择器内自带逐个试听），返回后写偏好并刷新。
- 选中行为：iOS 点行 = 选中 + 拷贝 + 立即试听；Android 内置音点选即选中（可选试听一次）。
- i18n 文案新增 `me.notificationsPage.sound.*`（参照现有通知设置页文案结构）。

### 5.4 通知链路接入

| 文件                                     | 改动                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/platform/notifications/types.ts`    | `MESSAGES_CHANNEL_ID` 常量改为 `getMessagesChannelId(messageSound)` 动态派生               |
| `src/platform/notifications/channels.ts` | 读偏好重建版本化渠道 + 启动清理旧版本渠道；`incoming_ring` 仅保留作 CALLS 渠道回退         |
| `src/platform/notifications/chat.ts`     | **iOS** `sound` 改读 `messageSound`（§5.2-A③）；**Android** 前台通知不设 `android.sound`， |

交由渠道 `sound` 配置决定（渠道已在 `ensureNotificationChannels` 中按偏好重建）；
`call.invite` 分支保持 `incoming_ring.wav` 不动 |
| `src/platform/notifications/calls.ts` / `system-call.ts` | **不改动**（来电保持现有链路） |

### 5.5 服务器改动（仅 iOS NSE 所需，不存铃声字段）

| 文件                                             | 改动                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `server/src/service/push/fcm_push_provider.ts`   | `buildMessage` 中 iOS `chat.message` 的 aps 加 `"mutable-content": 1`（`call.invite` 分支不动） |
| `server/src/service/push/jpush_push_provider.ts` | iOS `notification.ios` 块加 `mutable_content: true`                                             |

- 静音逻辑（`silent` 时省略 `sound` 字段）保持，NSE 需读本地 `silent` 态以免把静音又加回声音。
- 不需要新增任何服务端偏好字段或 API。

### 5.6 现有通知链路现状（改造前基准）

- `src/platform/notification-center.ts` —— barrel 导出，历史路径保留。
- `src/platform/notifications/channels.ts` —— Android 渠道：`MESSAGES_CHANNEL_ID`
  （`sound: "default"`）、`CALLS_CHANNEL_ID`（`sound: "incoming_ring"`）；创建前先删除旧渠道。
- `src/platform/notifications/chat.ts:114` —— iOS：`sound: call.invite ? "incoming_ring.wav" : "default"`。
- 来电铃声资产：iOS `ios/Mesh/CallSounds/*.wav`（7 个）、Android `res/raw/*.wav`（7 个）、
  RN 端 `src/assets/call-sounds/*.wav`（`call-sound-player.ts` require 引用）。

---

## 6. 明确不做（范围外）

| 项                     | 说明                                                       |
| ---------------------- | ---------------------------------------------------------- |
| 来电铃声选择           | 保持 callkeep + `incoming_ring.wav` 现状，后续单独处理     |
| 自定义铃声文件导入     | v1 不做（对齐 element-x-android；避免音频转码成本）        |
| 铃声偏好服务端同步     | 仅本地 MMKV（服务器只加 `mutable-content` 标记，不存偏好） |
| 桌面端（web/electron） | 本期不涉及                                                 |
| 数据迁移               | 不写迁移代码，需要时手动清理/重建                          |

---

## 7. 实施步骤

0. **音频资源就位**：开发者提供 `message` / `fade` 两个音频文件 →
   iOS `ios/Mesh/Sounds/message.wav` + `fade.wav`（加入 pbxproj）；Android
   `res/raw/message.wav` + `element_fade.wav`。
1. **模型与偏好**：新增 `alert-tones/types.ts` + `builtin-tones.ts`；扩展
   `notification-preferences.ts`（`messageSound` / `messageSoundLabel`）；jest 单元测试覆盖
   normalize / round-trip / iOS sound 派生 / Android 渠道 id 派生。
2. **iOS 原生（铃声模块 + NSE）**：`AlertToneManager.swift/.m` + 内置铃声资源；
   NSE target + App Group + `NotificationToneState.json` 读写 + 服务器 `mutable-content`；
   iOS 真机手测（前台试听切换 + 后台/锁屏推送实际铃声 + 静音 + 系统默认）。
3. **Android 原生**：`MushroomRingtoneModule/Package`（仅 Picker，返回 uri+title）+
   `res/raw` 内置铃声；注册到 `MainApplication.kt`；Android 模拟器/真机手测。
4. **前端桥 + UI**：`alert-tones/` 平台桥；`NotificationSettingsScreen.tsx` 铃声行 +
   BottomSheet + 试听 + Android 选择器入口；i18n 文案。
5. **通知接入**：改 `types.ts` / `channels.ts` / `chat.ts`；接真实推送验证铃声生效
   （Android 渠道重建、iOS 前台 notifee + 后台 NSE）。
6. **服务器**：`fcm_push_provider.ts` + `jpush_push_provider.ts` 加 `mutable-content`；
   补 `buildMessage` / `buildRequestBody` 单测。
7. **文档**：本计划落地后新增 `docs/architecture/alert-tones.md`
   （iOS/Android 差异矩阵、渠道重建机制、NSE 与 App Group、偏好格式），并更新
   `docs/architecture/push-notification.md` 模块图。
8. **回归**：`pnpm run lint`、`pnpm type-check:all`、
   `pnpm --filter @mushroom/mobile test`、`pnpm --filter @mushroom/server test`、
   双端手测矩阵。

---

## 8. 参考代码路径（调研来源）

### element-x-ios

- `ElementX/Resources/Sounds/message.caf`、`sound_01.caf`
- `ElementX/Sources/Services/AlertTones/NotificationToneManager.swift`
- `ElementX/Sources/Services/AlertTones/NotificationTone.swift`
- `ElementX/Sources/Services/Notification/Manager/NotificationManager.swift`（pusher `mutable-content` 注册）
- `NSE/Sources/NotificationServiceExtension.swift`、`NSE/Sources/NotificationContentBuilder.swift`
- `NSE/Sources/CommonSettings+NotificationName.swift`（`notificationSoundName`）
- `NSE/SupportingFiles/NSE.entitlements`、`ElementX/SupportingFiles/ElementX.entitlements`（App Group）

### element-x-android

- `libraries/preferences/api/src/main/kotlin/io/element/android/libraries/preferences/api/store/NotificationSound.kt`
- `features/preferences/impl/.../notifications/NotificationSoundPicker.kt`
- `libraries/push/impl/.../notifications/channels/NotificationChannels.kt`
- 内置铃声资源：`app/src/main/res/raw/message.*`、`res/raw/element_fade.*`

### notifee（本项目依赖，声音解析核实）

- Android 核心 aar：`node_modules/@notifee/react-native/android/libs/app/notifee/core/.../core-*.aar`
  （`app/notifee/core/a.class`、`n.o.t.i.f.e.e.r.c(String)` 的 sound → Uri 解析）
- iOS：`node_modules/@notifee/react-native/ios/NotifeeCore/NotifeeCore.m:367-419`
- 官方文档 Behaviour → Sound / Device Sound

### mushroom-app 现有代码（改动目标）

- `apps/mobile/src/platform/notification-preferences.ts`
- `apps/mobile/src/platform/notifications/types.ts`
- `apps/mobile/src/platform/notifications/channels.ts`
- `apps/mobile/src/platform/notifications/chat.ts`
- `apps/mobile/src/features/account/screens/NotificationSettingsScreen.tsx`
- `apps/mobile/src/platform/call-sound-player.ts` / `voice-recorder.ts`（试听复用）
- `apps/mobile/ios/Mesh/`（iOS 原生目录，工程名 `Mesh`，xcodeproj `Mesh.xcodeproj`）
- `apps/mobile/ios/Mesh/Mesh.entitlements`（需加 App Group）
- `apps/mobile/android/app/src/main/java/com/outland/mushroom/`（Android 原生包，注册于 `MainApplication.kt`）
- `server/src/service/push/fcm_push_provider.ts`、`server/src/service/push/jpush_push_provider.ts`

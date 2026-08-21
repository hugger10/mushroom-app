# Mobile Push Runtime Assets Checklist

更新时间：`2026-08-05`

## 目的

- 记录 React Native 移动端要真正跑通推送、后台通知、系统来电、真机调试所需的外部物料。
- 避免只完成代码接入，却遗漏 Firebase / 华为 / 小米 / APNs / 本地 SDK 文件。

## 当前项目标识

- Android `applicationId`：`com.outland.mushroom`
- Android `namespace`：`com.outland.mushroom`
- iOS `PRODUCT_BUNDLE_IDENTIFIER`：`com.outland.mushroom`

这些值必须与 Firebase / AppGallery / 小米推送平台上注册的应用标识一致，否则下载下来的配置文件不能正常工作。

## Firebase 配置文件

### 结论

- `apps/mobile/android/app/google-services.json`
- `apps/mobile/ios/Mesh/GoogleService-Info.plist`

这两个文件都不能靠模板手写。

原因：

- 它们是 Firebase 控制台根据你的 Firebase 项目和你注册的 App 生成的项目配置文件。
- 文件内容包含项目级和 App 级唯一标识。
- 官方文档说明这些文件可以重复下载，且内容是项目唯一、非通用的配置，不是让你复制模板后手填的一般配置文件。

参考：

- Firebase Android setup:
  [Add Firebase to your Android project](https://firebase.google.com/docs/android/setup)
- Firebase Apple setup:
  [Add Firebase to your Apple project](https://firebase.google.com/docs/ios/setup)
- React Native Firebase:
  [React Native Firebase setup](https://rnfirebase.io/)

### 1. Android: `google-services.json`

下载位置：

1. 打开 Firebase Console。
2. 进入你的项目。
3. 添加或选择 Android App。
4. 包名填写 `com.outland.mushroom`。
5. 下载 `google-services.json`。

放置路径：

- `apps/mobile/android/app/google-services.json`

当前仓库状态：

- **该文件当前已放在本地磁盘**（2026-08 核对：存在于 `apps/mobile/android/app/google-services.json`，已 gitignore，不入库）。
- Android Gradle 现已支持“有该文件时自动启用 Google Services plugin”。
- 如果文件不存在，工程仍可编译，但 FCM 不会真正完成原生 Firebase 配置。

说明：

- 不建议自己造模板文件。
- 就算字段名看起来像普通 JSON，只要 `project_number`、`mobilesdk_app_id`、`package_name`、`api_key`、`project_id` 不匹配，你的 Android Firebase 初始化就是无效的。

> **开发期提示**：自 2026-05-25 起，应用内前台 heads-up 通知由 WebSocket 实时消息直接驱动（详见 `docs/architecture/push-notification.md` §7.2.1），**不依赖** `google-services.json`。也就是说：在 Android emulator 上没有该文件也能验证「应用打开但不在目标会话」的通知弹出。`google-services.json` 仍是后台 / 锁屏推送（FCM data → Notifee）的必要条件。

### 2. iOS: `GoogleService-Info.plist`

下载位置：

1. 打开 Firebase Console。
2. 进入同一个 Firebase 项目。
3. 添加或选择 Apple App。
4. Bundle ID 填写 `com.outland.mushroom`。
5. 下载 `GoogleService-Info.plist`。

放置路径：

- `apps/mobile/ios/Mesh/GoogleService-Info.plist`

当前仓库状态：

- iOS 侧代码已经改成“有该文件时自动执行 Firebase 初始化，没有就跳过并打印日志”。
- 没有该文件时，iOS 的 Firebase Messaging 不会真正可用。

说明：

- 同样不能使用伪造模板。
- 这个文件需要是 Firebase 为 `com.outland.mushroom` 这一个 iOS App 生成的真实文件。

## Huawei Push 物料

### 必需文件

- `apps/mobile/android/app/agconnect-services.json`

下载位置：

1. 登录 AppGallery Connect。
2. 创建项目并添加 Android App。
3. 包名填写 `com.outland.mushroom`。
4. 在项目配置页下载 `agconnect-services.json`。

放置路径：

- `apps/mobile/android/app/agconnect-services.json`

参考：

- [Huawei Push Kit codelab](https://developer.huawei.com/consumer/en/codelab/HMSPushKit/)

### 服务端环境变量

需要在服务端 `.env` 中配置：

- `PUSH_HUAWEI_APP_ID`
- `PUSH_HUAWEI_CLIENT_ID`
- `PUSH_HUAWEI_CLIENT_SECRET`
- `PUSH_HUAWEI_OAUTH_URL`
- `PUSH_HUAWEI_API_URL`

### 当前代码状态

- **该文件当前已放在本地磁盘**（2026-08 核对：存在于 `apps/mobile/android/app/agconnect-services.json`，已 gitignore，不入库）。
- React Native 依赖已接入 `@hmscore/react-native-hms-push`
- Android Gradle 已接入华为仓库与 `agconnect` plugin
- 没有 `agconnect-services.json` 时，华为原生配置不完整

## Xiaomi Push 物料

### 1. Android Client SDK

当前情况：

- 你已经说明“小米 client-sdk 已经添加”。
- 仓库代码的预期位置是 `apps/mobile/android/app/libs/`。

客户端要求：

- 小米控制台申请 `AppId` / `AppKey` / `AppSecret`
- 将官方 Android Client SDK 的 `AAR/JAR` 放入 `apps/mobile/android/app/libs/`

参考：

- [Xiaomi Android Client SDK Guide](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1544)

### 2. 服务端 Java SDK

需要额外准备：

- 小米 Java Http2 Server SDK 下载包
- 解压后的 `jar` 目录
- 编译 `server/tools/xiaomi/XiaomiPushCli.java` 后的 classes 目录（用
  `pnpm --filter @mushroom/server tool:xiaomi:build` 一键编译）

推荐路径：

- `PUSH_XIAOMI_SDK_DIR=/你的本地目录/MiPush_SDK_Server_Http2`
- `PUSH_XIAOMI_HELPER_CLASSPATH=server/tools/xiaomi/classes`

参考：

- [Xiaomi Server SDK (Java)](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1558)

### 3. 服务端环境变量

需要在服务端 `.env` 中配置：

- `PUSH_XIAOMI_APP_ID`
- `PUSH_XIAOMI_APP_KEY`
- `PUSH_XIAOMI_APP_SECRET`
- `PUSH_XIAOMI_PACKAGE_NAME=com.outland.mushroom`
- `PUSH_XIAOMI_REGION`
- `PUSH_XIAOMI_JAVA_BIN`
- `PUSH_XIAOMI_SDK_DIR`
- `PUSH_XIAOMI_HELPER_CLASSPATH`

### 4. 当前代码状态

- 移动端已支持小米设备识别、注册、读取 `regId`、读取 region
- 服务端已支持路由到 Xiaomi provider
- 代码已把设备 region 纳入注册元数据，供服务端区域路由使用

## FCM 服务端环境变量

需要在服务端 `.env` 中配置：

- `PUSH_FCM_PROJECT_ID`
- `PUSH_FCM_CLIENT_EMAIL`
- `PUSH_FCM_PRIVATE_KEY`

说明：

- 这不是移动端 `google-services.json` 的替代品。
- `google-services.json` 负责移动端原生 Firebase app 配置。
- 上述 `PUSH_FCM_*` 负责服务端调用 FCM HTTP v1 发送推送。

## JPush（极光）可选聚合通道

仓库同时接入 JPush 作为可选厂商聚合通道（国内可达）。设备注册时客户端优先走
JPush（已配置且注册成功），否则按 xiaomi → huawei → fcm 择优（见
`apps/mobile/src/platform/push/registration.ts`）。未配置不影响主链路。

需要配置：

- `JPUSH_APP_KEY`
- `JPUSH_MASTER_SECRET`
- `JPUSH_APNS_PRODUCTION`（iOS：true 生产 / false 沙盒，默认跟随 `isProduction`）

说明：

- 客户端构建时注入 `JPUSH_APPKEY`（见 `apps/mobile/android/app/build.gradle` 的
  `manifestPlaceholders`），设备注册后 `push_provider="jpush"`。
- appKey / masterSecret 从极光控制台创建应用获取。

## iOS 额外必备项

即使已经放入 `GoogleService-Info.plist`，iOS 真机推送仍然至少需要：

- Apple Developer 账号（**付费**，VoIP / PushKit 不支持模拟器）
- APNs Authentication Key（`.p8`）或证书
- Xcode 签名配置（Team / Provisioning Profile）
- 开启 Push Notifications capability
- 开启 Background Modes
  - `Remote notifications`
  - **`Voice over IP`（VoIP）** —— 杀进程 / 后台来电唤醒的硬前提

### 仓库已自动完成的部分（2026-06-01）

以下原来需要在 Xcode 手点的工程配置，现已写入版本库，`pod install` 后即生效：

- `apps/mobile/ios/Mesh/Mesh.entitlements`：声明
  `aps-environment = development`（归档 Distribution 时 Xcode 自动升为
  `production`）。这是 iOS 下发 VoIP push 凭证（PKPushRegistry）和 APNs 接受
  `apns-push-type: voip` 的前提。
- `project.pbxproj`：
  - Debug / Release 均注入
    `CODE_SIGN_ENTITLEMENTS = Mesh/Mesh.entitlements;`
  - `TargetAttributes` 注入 `SystemCapabilities.com.apple.Push = { enabled = 1; }`
    （Xcode 识别 Push Notifications capability）。
  - `Mesh.entitlements` 已加入工程文件引用与分组。
- `Info.plist`：`UIBackgroundModes` 已含 `audio` / `remote-notification` /
  `voip`。
- 原生 PushKit 桥接（`VoipPushManager.swift/.m` + bridging header +
  `AppDelegate.register()`）已接入并加入编译。

### 仍需你手动完成的部分

> ⚠️ **务必在 Xcode 复核签名**：pbxproj 已声明 Push capability 与
> entitlements，但 **签名证书 / Provisioning Profile 必须包含 Push
> Notifications + VoIP 能力**，否则真机 build 会因 entitlement 不匹配失败。
> 打开 `Mesh.xcworkspace` → Target → Signing & Capabilities，确认
> 看到 **Push Notifications** 与 **Background Modes（含 Voice over IP）** 两项，
> 并选择正确的 Team。

1. 放置 `GoogleService-Info.plist`（见上文，敏感文件不入库）。
2. 在 Apple Developer 后台为 `com.outland.mushroom` 创建 **APNs Auth Key（.p8）**，
   记下 `Key ID` 与 `Team ID`。一个 `.p8` 同时用于普通推送与 VoIP 推送。
3. 在服务端 `server/.env` 配置 APNs VoIP provider（见下节）。
4. 真机（付费账号）安装调试。

### 服务端 APNs VoIP 环境变量

VoIP 来电由服务端 `ApnsVoipPushProvider`（HTTP/2 + `.p8` ES256 JWT，
`apns-push-type: voip`，仅 `call.invite` / `call.missed`）下发。需要在
`server/.env` 配置（示例见 `server/.env.example`）：

- `PUSH_APNS_KEY_ID`：`.p8` 的 Key ID
- `PUSH_APNS_TEAM_ID`：Apple 开发者 Team ID
- `PUSH_APNS_PRIVATE_KEY`：`.p8` 文件内容（PEM，含 `-----BEGIN PRIVATE KEY-----`）
- `PUSH_APNS_BUNDLE_ID`：`com.outland.mushroom`（APNs topic 用 `<bundleId>.voip`）
- `PUSH_APNS_PRODUCTION`：`false`=sandbox（开发证书 / Xcode 直装真机），
  `true`=生产（TestFlight / App Store）。必须与设备安装包的签名环境一致，否则
  APNs 返回 `BadDeviceToken`。

说明：

- 仓库里已经声明了通知权限文案、`remote-notification` / `voip` background
  mode、entitlements 与 Push capability。
- 但 APNs `.p8`、签名、Provisioning Profile 都不是靠仓库代码自动生成的。

## 真机前建议的最小准备顺序

### Android

1. 准备 `google-services.json`
2. 准备 `agconnect-services.json`
3. 确认小米 Client SDK 已放入 `apps/mobile/android/app/libs/`
4. 填完服务端 `.env` 中的 `PUSH_FCM_*`
5. 填完服务端 `.env` 中的 `PUSH_HUAWEI_*`
6. 填完服务端 `.env` 中的 `PUSH_XIAOMI_*`
7. 运行 `pnpm --filter @mushroom/server tool:xiaomi:build` 编译 Xiaomi helper
8. 启动服务端并关闭 `PUSH_DRY_RUN`

### iOS

1. 准备 `GoogleService-Info.plist`
2. 在 Apple Developer 后台创建 APNs Auth Key（`.p8`），记下 Key ID / Team ID
3. 配置签名与 Provisioning Profile（**Push Notifications + VoIP** 能力）
4. 在 Xcode Signing & Capabilities 复核 **Push Notifications** 与 **Background
   Modes（Voice over IP）** 已出现（pbxproj 已声明，仅需确认签名匹配）
5. 填完服务端 `.env` 中的 `PUSH_APNS_*` 并关闭 `PUSH_DRY_RUN`
6. 用真机（付费账号）安装调试

## 真机到手后的最短验证清单

### Android

- 前台收到聊天消息推送
- 后台收到聊天消息推送
- 冷启动通知点击恢复到会话
- 前台来电展示
- 后台来电展示
- 锁屏来电展示
- 接听 / 拒绝 / 超时 / 挂断收口

### iOS

- 前台收到消息推送
- 后台收到消息推送
- 冷启动通知点击恢复
- CallKit 来电展示（前台）
- **VoIP 来电展示（后台 / 锁屏 / 杀进程）** —— PushKit → CallKit
- 点击系统来电界面接听后自动拉起 App 并接通（CallOverlay ongoing）
- 接听 / 拒绝 / 挂断收口

## 当前建议状态清单

- [x] `apps/mobile/android/app/google-services.json`（本地已放置，不入库）
- [ ] `apps/mobile/ios/Mesh/GoogleService-Info.plist`
- [x] `apps/mobile/android/app/agconnect-services.json`（本地已放置，不入库）
- [x] `apps/mobile/android/app/libs/` 中的小米 Client SDK
- [ ] 服务端 `PUSH_FCM_*`
- [ ] 服务端 `PUSH_HUAWEI_*`
- [ ] 服务端 `PUSH_XIAOMI_*`
- [ ] `server/tools/xiaomi/classes`
- [ ] 小米 Java Server SDK 本地目录
- [ ] iOS APNs Key（`.p8`）/ 证书
- [ ] iOS 真机签名环境（Push Notifications + VoIP 能力）
- [ ] 服务端 `PUSH_APNS_*`（KEY_ID / TEAM_ID / PRIVATE_KEY / BUNDLE_ID / PRODUCTION）
- [x] iOS `Mesh.entitlements`（aps-environment，已入库）
- [x] iOS Push capability + VoIP background mode（已写入 pbxproj / Info.plist）

## 补充说明

- `google-services.json` 与 `agconnect-services.json` 已在本地就位（gitignore，不入库）。
- 如果后续你只想先跑 Android 常规机型，最低可先准备：
  - 服务端 `PUSH_FCM_*`
- 如果要跑华为真机，还要加：
  - 服务端 `PUSH_HUAWEI_*`
- 如果要跑小米真机，还要加：
  - 服务端 `PUSH_XIAOMI_*`
  - 小米 Java Server SDK
- 若要启用 JPush（极光）聚合通道，再加：
  - 服务端 `JPUSH_APP_KEY` / `JPUSH_MASTER_SECRET`
  - 客户端构建注入 `JPUSH_APPKEY`

# 多账号隔离方案（移动端 / 桌面端）

## 一、总览

**场景定位**：app 类比「web 网站」的账号模型 —— 同一时刻**有且仅有一个**账号处于登录态。同一台设备可由多人共用，每个人都有自己的账号，轮流登录使用。

**核心诉求**（移动端、桌面端一致）：

- 同一台设备，用户 A 登录使用一段时间后退出，交给用户 B 继续使用。
- A 与 B 的会话、消息、媒体、联系人、配置等数据**物理隔离、互不可见、互不污染**。
- A 退出后再次登录，直接挂载本地已有的 db + 缓存，**秒进、无需重新全量同步**。
- B 第一次登录看到的是干净空间；B 退出后 C 登录同理。
- 退出/登录过程不残留内存状态、推送绑定、挂起通知、媒体缓存等。

**退出语义**（两端一致）：

- 默认「退出 = 仅登出（清 token + 断长连接 + 解除推送投递）」，本地 `users/<uid>/` 目录原样保留，等账号本人下次登录时复用。
- 退出对话框提供可选项「☐ 同时清除本地聊天记录」，勾选后才删除 `users/<uid>/` 整个目录（桌面端同时清理对应 partition）。

**非目标（明确不做）**：

- ❌ 多账号同时在线 / 后台保活 / 多长连接。
- ❌ 账号切换器（不输密码秒切、账号列表 UI）。退出 → 重新输入账号密码登录，是唯一切换方式。
- ❌ 老版本数据迁移（详见各端 §6.10）。
- ❌ 本地 db 加密 / token 系统级 Keystore（单独立项，详见 Roadmap）。
- ❌ 端到端加密密钥隔离（未来加 E2EE 时再做）。

**服务端（两端共享，无需改动）**：

`UserService.logoutCurrentDevice` 已完成「撤销 session + `user_devices.status` 置为 2 + 强断 WebSocket」三件事；`push_router` 在投递时硬过滤 `status === 1`，设备登出后服务端自动不再投推送。客户端只要在 logout 流程中**确保 `logoutCurrent` 被调到**即可，不需要新增任何服务端接口。核心代码位置：

- `server/src/service/user_service.ts`（`logoutCurrentDevice`）
- `server/src/service/push/push_router.ts`（`collectTargets` 中的 status 过滤）

---

## 二、移动端方案

### 2.1 设计原则

1. **单活跃账号模型**：进程中任意时刻只存在 0 或 1 个活跃 uid。所有「账号级」资源（db / KV / 媒体 / socket / api token / pending 队列）都跟随该 uid 的生命周期被「整体重建」或「整体销毁」。
2. **物理隔离优先**：每账号独立 SQLite 文件 + 独立 MMKV 实例 + 独立媒体目录。SQL 不动、MMKV key 名不动，仅在「打开存储」一层注入 uid。
3. **设备级 vs 账号级二分**：
   - 设备级（device-id、主题、语言、字体大小、通知偏好、自动下载策略）→ 全局 MMKV，跨账号继承。
   - 账号级（auth、sync、pending 通知/通话动作、db、媒体、草稿、最近表情）→ 按 uid 隔离。
4. **内存污染零容忍**：
   - 用 React 根 `<App key={uid ?? 'anon'}>` 强制 remount，所有 Context / Hook 状态归零。
   - controller 的账号级单例（AuthStore / CheckpointStore / SqliteDataRepository / ApiClient / RealtimeClient / 各 Worker）**全部走「销毁 + 重建」**，不走「换 token 复用实例」，杜绝监听器残留、旧账号事件误投递、闭包 token 错位等隐患。
   - 切换前先 cancel 所有 in-flight 任务（上传、下载、轮询定时器）。
5. **uid 取 `auth.user.id` 转字符串**，不 hash（沙箱内不必混淆，便于调试/迁移）。
6. **媒体目录区分「纯缓存」与「outbox 源文件」**：纯缓存放 `CachesDir`（系统紧张可清）；outbox 源文件放 `AppSupportDir / files`（系统不清，上传成功后由 app 删）。

### 2.2 物理存储路径

App 包名：`com.outland.mushroom`。

#### iOS（App Sandbox）

iOS 沙箱根目录由系统按 `<App Sandbox>/...` 分配，外部 app 与系统文件管理器**无法访问**。

| 类别          | 归属   | 物理路径                                                                            |
| ------------- | ------ | ----------------------------------------------------------------------------------- |
| SQLite        | 账号级 | `<Sandbox>/Documents/users/<uid>/db/im.db`                                          |
| 媒体纯缓存    | 账号级 | `<Sandbox>/Library/Caches/users/<uid>/media/<yyyy_mm>/<category>/<sha256>.<ext>`    |
| outbox 源文件 | 账号级 | `<Sandbox>/Library/Application Support/users/<uid>/outbox/<yyyy_mm>/<sha256>.<ext>` |
| 设备级 MMKV   | 设备级 | `<Sandbox>/Documents/mmkv/mushroom-mobile`                                          |
| 账号级 MMKV   | 账号级 | `<Sandbox>/Documents/mmkv/mushroom-mobile.user.<uid>`                               |

> `Library/Caches` 在系统空间紧张时可能被清理；`Library/Application Support` 不会被系统自动清理，适合放 outbox 源文件。

#### Android

包数据目录由系统按 `/data/data/com.outland.mushroom/...` 分配，非 root 设备不可见。

| 类别          | 归属   | 物理路径                                                                                      |
| ------------- | ------ | --------------------------------------------------------------------------------------------- |
| SQLite        | 账号级 | `/data/data/com.outland.mushroom/files/users/<uid>/db/im.db`                                  |
| 媒体纯缓存    | 账号级 | `/data/data/com.outland.mushroom/cache/users/<uid>/media/<yyyy_mm>/<category>/<sha256>.<ext>` |
| outbox 源文件 | 账号级 | `/data/data/com.outland.mushroom/files/users/<uid>/outbox/<yyyy_mm>/<sha256>.<ext>`           |
| 设备级 MMKV   | 设备级 | `/data/data/com.outland.mushroom/files/mmkv/mushroom-mobile`                                  |
| 账号级 MMKV   | 账号级 | `/data/data/com.outland.mushroom/files/mmkv/mushroom-mobile.user.<uid>`                       |

> Android 的目录划分按系统约定：`cache/` 在系统空间紧张时可能被清理；`files/` 不会被系统自动清理。

#### MMKV 实例与 Key 划分

- **设备级**实例 `mushroom-mobile`（全局，跨账号继承）：
  - `mushroom.mobile.device-id`
  - `mushroom.mobile.active-user-id`（冷启动恢复用）
  - `mushroom.mobile.theme` / `language` / `font-scale`
  - `mushroom.mobile.notification-preferences`
  - `mushroom.mobile.mediaAutoDownload`
  - `mushroom.mobile.onboarding-flags`（引导/评分提示）
- **账号级**实例 `mushroom-mobile.user.<uid>`（每个 uid 一个实例）：
  - `auth`（accessToken / refreshToken / user）
  - `sync-checkpoints`
  - `pending-notification-open`
  - `pending-system-call-action`
  - `input-drafts`
  - `recent-emojis`
  - `conversation-mute-overrides`

#### 设备级 / 账号级归属表（完整）

| 类别   | 资源                                                   | 归属                  | 说明                                   |
| ------ | ------------------------------------------------------ | --------------------- | -------------------------------------- |
| 标识   | device-id                                              | 设备级                | 服务端用 `(userId, deviceId)` 绑定推送 |
| 标识   | active-user-id                                         | 设备级                | 冷启动恢复                             |
| 外观   | theme / language / font-scale                          | 设备级                | 多人共用倾向一致                       |
| 通知   | notification-preferences（全局开关、勿扰默认值）       | 设备级                | 默认值                                 |
| 通知   | conversation-mute-overrides                            | 账号级                | 每人会话不同                           |
| 媒体   | mediaAutoDownload（wifi/流量策略默认）                 | 设备级                | 流量是设备资源                         |
| 媒体   | per-conversation auto-download 覆盖                    | 账号级                | 跟随会话                               |
| 引导   | onboarding-flags / 评分提示                            | 设备级                | 已看过就别再弹                         |
| 鉴权   | auth                                                   | 账号级                | 隔离核心                               |
| 同步   | sync-checkpoints                                       | 账号级                | 增量同步游标                           |
| 挂起   | pending-notification-open / pending-system-call-action | 账号级                | 推送点击 / 通话挂起                    |
| 输入   | input-drafts / recent-emojis                           | 账号级                | 个人习惯，隐私敏感                     |
| 联系人 | addressBookMatches / address_book_match_cache          | 账号级                | 隐私敏感，必清                         |
| 业务   | im.db 全部表                                           | 账号级                | 物理隔离                               |
| 媒体   | media-cache 目录                                       | 账号级                | `Caches/users/<uid>/media/`            |
| 媒体   | outbox 源文件目录                                      | 账号级                | `AppSupport/users/<uid>/outbox/`       |
| 推送   | pushToken / pushProvider                               | 设备级值 + 账号级绑定 | token 来自系统，绑定关系按 uid 解      |

### 2.3 生命周期

#### 登录

登录页处于 anon 状态（尚未 bindUser）。`controller.login(form)` 流程：

1. 用临时 anon ApiClient 调 `/auth/login`（只服务于本次登录，登录后立即丢弃）。
2. 拿到 `auth.user.id` 作为 uid。
3. `accountNamespace.setActiveUserId(uid)` + 写设备级 MMKV `active-user-id`。
4. `controller.bindUser(uid)`：构造账号级 MMKV / SQLite connection / SqliteDataRepository / MediaCache 根 / Outbox 根 / 正式 ApiClient / RealtimeClient。
5. 启动同步、注册 push token、`realtimeClient.connect()`。
6. **bindUser 全程 await 完成后**才把 React 根切到主界面，首屏组件可放心读 repository。
7. React 根 `<App key={uid}>` 触发 UI tree 重建。

#### 退出登录

退出对话框新增复选框：

> ☐ 同时清除本地聊天记录（默认不勾）
> 取消勾选时，下次以同一账号登录可直接看到本地历史。

`controller.logout({ wipeLocalData })` 流程：

【总会执行】

1. 取消所有 in-flight 任务：outbox worker stop & await、media downloader cancel、所有轮询/重试定时器。
2. 后端 `mobileServerApi.logoutCurrent()`（容错失败，本地登出不阻塞）。
3. `realtimeClient.disconnect() + dispose()`、`apiClient.dispose()`。
4. `controller.unbindUser({ wipeLocalData })`：close SQLite connection → 清账号 MMKV → 内存清理（pushToken / addressBookMatches / activeConversationId / metrics / pendingReadTimers / FastImage 内存缓存）。
5. 删除设备级 MMKV 的 `active-user-id`，重置为登出态。

【wipeLocalData=true 才执行】6. 删除 `users/<uid>/db/im.db`、`Caches/users/<uid>/media`、`AppSupport(或 files)/users/<uid>/outbox`。

7. React 根 `<App key='anon'>` 触发回到登录页。

> outbox 中尚未上传成功的源文件，在「未勾选清除」的退出后**保留**，账号本人下次登录由 outbox worker 续传。

#### 冷启动

读设备级 MMKV `active-user-id`：

- 有值：`bindUser(uid)` → 读 authStore；auth 有效 → 主界面；auth 失效 → 走 401 路径 = `logout({ wipeLocalData: false })`。
- 无值：登录页。

**bindUser 失败兜底**（数据损坏 / 磁盘满 / 沙箱权限异常）：不静默清数据，保留 active-user-id；回退到登录页并展示提示条「检测到本地数据异常 [重试] [清除并重新登录]」。决定权交给用户。

#### 强制 401

`handleUnauthorizedSession` 调用 `controller.logout({ wipeLocalData: false })`，保留本地数据，便于用户重新登录即可看到历史。

### 2.4 核心代码位置（不展开实现）

| 关注点                                                                  | 代码文件                                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| uid 状态 + hook（新增）                                                 | `apps/mobile/src/services/account-namespace.ts`                      |
| 设备级 / 账号级 MMKV 拆分                                               | `apps/mobile/src/data/storage.ts`                                    |
| SQLite 按 uid 开/关库                                                   | `apps/mobile/src/data/sqlite-connection.ts`                          |
| 数据仓库（SQL 不动，仅接收 connection）                                 | `apps/mobile/src/data/sqlite-data-repository.ts`                     |
| 通讯录匹配缓存                                                          | `apps/mobile/src/data/address-book-match-cache.ts`                   |
| 媒体缓存与 outbox 根目录                                                | `apps/mobile/src/platform/media-cache.ts`                            |
| 存储统计扫描范围                                                        | `apps/mobile/src/features/storage/useStorageUsage.ts`                |
| bindUser / unbindUser；401 走 logout；ApiClient / RealtimeClient 工厂化 | `apps/mobile/src/services/app-runtime.ts`                            |
| 退出对话框（带复选框）                                                  | `apps/mobile/src/screens/MeScreen.tsx`                               |
| 透传 wipeLocalData                                                      | `apps/mobile/src/app/view-props/home-screen-props.ts`                |
| `resetToLoggedOutState` 增补 addressBookMatches                         | `apps/mobile/src/actions/account/account-session-actions.ts`         |
| pending 通知 / 通话挂起走账号 MMKV                                      | `apps/mobile/src/platform/notification-center.ts` / `system-call.ts` |
| 共享：AuthStore / CheckpointStore 接收 KV 句柄                          | `packages/app-core/src/storage.ts`                                   |
| 共享：controller bindUser / unbindUser / logout(options)                | `packages/app-core/src/controller.ts`                                |

### 2.5 旧版本数据处理（不迁移）

客户端数据全部视为缓存。老用户冷启动后 `accountNamespace.get()` 为 null（旧 auth key 不再读），落到登录页。重新登录后，新 SQLite 在 `users/<uid>/db/im.db` 全新创建，从服务端全量同步。旧路径文件（`Documents/mushroom-mobile.db`、`Caches/mushroom-media-cache/`）与旧 device MMKV key 保留在磁盘上不主动清理，OS 在卸载或低存储告警时自然回收。

### 2.6 预期效果

| 行为                               | 预期                                                              |
| ---------------------------------- | ----------------------------------------------------------------- |
| A 登录 → 退出（不勾清除） → B 登录 | B 看不到 A 任何会话/消息/媒体；A 的 db 与媒体仍在 `users/<A>/` 下 |
| B 退出 → A 再登录                  | A 秒进，本地历史完整                                              |
| A 退出（勾选清除）                 | `users/<A>/` 整个目录消失；下次 A 登录 = 全量同步                 |
| A 收推送 → 立即退出 → B 启动       | B 不会被路由到 A 的会话（pending 在 A 的账号 MMKV 中已被清）      |
| 强制 401 登出                      | 默认保留本地数据，重新登录后秒进                                  |
| 杀进程冷启动                       | 按 active-user-id 自动恢复上次账号                                |
| 主题 / 语言切换                    | 跨账号继承                                                        |
| 反复 A↔B 切 10 次                 | 不串号、磁盘只保留各账号自己的目录                                |

---

## 三、桌面端方案（Electron）

### 3.1 与移动端的差异点

- **Dev 环境允许多实例运行**。通过 `--instance=xxx` / `MUSHROOM_APP_INSTANCE` 把 `userData` 切到 `<userData>/instances/<instanceId>` 子目录（已实现，见 `apps/electron/src/main/runtime-paths.ts`、`apps/electron/src/main/index.ts`），每个实例之间完全物理隔离。开发同学想同时挂多个账号 → 启动多个不同 `--instance` 的窗口，**不要在同一实例内反复 A/B 切换登录**。
- **生产环境强制单实例**。`app.isPackaged` 时 `getInstanceId()` 永远返回 `"default"`，并通过 `requestSingleInstanceLock()` 保证同一台机器同一时刻只有一个 mushroom 进程。
- **生产换账号 = 切换到另一个物理目录**：A 退出 → B 登录，B 的 db / 媒体 / 偏好 / token / 渲染层 partition 全部落到 `users/<uidB>/` 子树。
- **多了渲染层 partition 这一维度**：登录/登出时必须按 `persist:user-<uid>` partition 销毁并重建 BrowserWindow，使 localStorage / IndexedDB / Cookies / ServiceWorker / CacheStorage 跟随物理切换。

### 3.2 设计原则

1. **单活跃账号模型**：每个进程实例任意时刻只存在 0 或 1 个活跃 uid，账号级资源随该 uid 生命周期整体重建或销毁。
2. **三层归属：设备/实例级 → 账号级 → 渲染层 partition**：
   - 设备/实例级：`device-id`、`last-login-user`、主题、语言、字体缩放、`token-<uid>` map（按 uid 分 key，存在实例级 store 中）。
   - 账号级：DB、媒体、outbox、用户偏好、pending 推送队列。
   - 渲染层 partition：localStorage / IndexedDB / Cookies / ServiceWorker / CacheStorage，按账号 partition 物理隔离。
3. **物理隔离优先**：每账号独立 db 文件 + 独立媒体目录 + 独立 partition。SQL 完全不动，仅在「打开存储」一层注入 uid。
4. **内存污染零容忍**：登录/登出时销毁当前 BrowserWindow，按新的 partition 重建；主进程账号级单例（db connection、media-cache controller、outbox worker）全部走「销毁 + 重建」；切换前先 cancel 所有 in-flight 任务。
5. **uid 取 `auth.user.id` 转字符串**，不 hash。
6. **生产单实例 / dev 多实例分治**：dev 多账号并存 = 多 `--instance` 多窗口（每个实例内仍是单活跃账号）；生产任何时刻最多一个进程、最多一个活跃账号。

### 3.3 物理存储路径

Electron 应用名（productName）：`Mushroom`。`<userData>` 由 Electron 按 OS 约定分配：

| 操作系统 | `<userData>` 默认目录                                                   |
| -------- | ----------------------------------------------------------------------- |
| macOS    | `~/Library/Application Support/Mushroom/`                               |
| Windows  | `%APPDATA%\Mushroom\`（即 `C:\Users\<User>\AppData\Roaming\Mushroom\`） |
| Linux    | `~/.config/Mushroom/`                                                   |

> Dev 非 default 实例下，所有路径统一前缀替换为 `<userData>/instances/<instanceId>/`，再叠加下文结构；生产固定为 `<userData>/`。

#### 实例根目录布局

```
<userData>/                                ← 实例根（dev 多实例下：<defaultUserData>/instances/<instanceId>/）
  config.json                              ← 设备/实例级 electron-store
    - last-login-user                      ← 冷启动恢复 uid
    - token-<uid>                          ← safeStorage 加密
    - refresh-token-<uid>                  ← safeStorage 加密
    - preferred-theme
    - preferred-language
  device-id                                ← 设备级，跟随实例
  users/<uid>/                             ← 账号级子树
    db/im.db                               ← 取代旧 <userData>/<uid>-data.db
    media/<yyyy_mm>/<category>/<file>      ← 取代旧 media-cache/<username>/...
    outbox/<yyyy_mm>/<file>                ← 上传源文件，永不被系统清
    preferences/...                        ← 取代旧 preferences/<username>/...
  Partitions/persist:user-<uid>/           ← Electron 自动落点（实际目录名因 URL-encode 为 persist%3Auser-<uid>）
  Partitions/persist:anon/                 ← 登录页/匿名态使用
  logs/                                    ← Electron 派生（实例级共享，不按 uid 拆）
  Cache/  sessionData/  ...                ← Electron 派生（实例级共享）
```

> 桌面端文件系统对当前 OS 用户透明可见 —— 多账号隔离的目标是「同一 OS 用户、同一 app 实例内 B 看不到 A 数据」，不是「OS 层强加密」。db 明文加密留待 SQLCipher（Roadmap）。

#### 设备/实例级 / 账号级归属表

| 类别     | 资源                                                   | 归属                                     | 物理落点                                      |
| -------- | ------------------------------------------------------ | ---------------------------------------- | --------------------------------------------- |
| 标识     | `device-id` 文件                                       | 设备/实例级                              | `<userData>/device-id`                        |
| 标识     | `last-login-user`                                      | 设备/实例级                              | `electron-store` config.json                  |
| 外观     | `preferred-theme` / `preferred-language`               | 设备/实例级                              | 同上                                          |
| 鉴权     | `token-<uid>` / `refresh-token-<uid>`                  | 账号级（按 uid 分 key 存于实例级 store） | 同上，safeStorage 加密                        |
| 业务     | `im.db` 全部表                                         | 账号级                                   | `<userData>/users/<uid>/db/im.db`             |
| 媒体     | media cache                                            | 账号级                                   | `<userData>/users/<uid>/media/`               |
| 媒体     | outbox 源文件                                          | 账号级                                   | `<userData>/users/<uid>/outbox/`              |
| 偏好     | media-auto-download / 其他用户偏好                     | 账号级                                   | `<userData>/users/<uid>/preferences/`         |
| 渲染层   | localStorage / IndexedDB / Cookies / SW / CacheStorage | 账号级                                   | `<userData>/Partitions/persist%3Auser-<uid>/` |
| 渲染层   | 匿名登录页临时状态                                     | 设备/实例级                              | `<userData>/Partitions/persist%3Aanon/`       |
| 日志     | Electron / 业务日志                                    | 设备/实例级                              | `<userData>/logs/`                            |
| 系统缓存 | Cache / sessionData / GPUCache 等                      | 设备/实例级                              | Electron 默认目录                             |

### 3.4 生命周期

#### 登录

登录页 renderer 跑在 `persist:anon` partition，主进程 db 句柄为 null。

1. renderer 调 `/auth/login` 拿到 `auth.user.id = uid`，持久化 access/refresh token。
2. renderer IPC `user:login-success({ uid, accessToken, refreshToken })`。
3. 主进程：旧 db 句柄存在则 `db.close()` → 创建 `users/<uid>/db/im.db` 并跑 migrations → 创建 media / outbox / preferences 目录 → 写 `last-login-user` → 重建账号级单例（media-cache controller / outbox worker / storage-stats 扫描根 / user-preferences 根）。
4. 销毁 anon 登录窗口，按 `webPreferences.partition = 'persist:user-<uid>'` 创建新主窗口；renderer 走自己 partition 的全新 IndexedDB / localStorage。

> Electron 不支持运行时切换 partition，**必须销毁/重建 BrowserWindow**。

#### 退出登录

退出对话框新增复选框：

> ☐ 同时清除本地聊天记录（默认不勾）
> 取消勾选时，下次以同一账号登录可直接看到本地历史。

renderer：`await logoutCurrent()`（容错） → `closeWSClient()` / `stopProactiveTokenRefresh()` → IPC `user:logout({ wipeLocalData })`。

主进程 `user:logout` handler：

【总会执行】

1. 取消所有 in-flight 任务：media-cache 下载队列、outbox worker、storage-stats / migration / 重试定时器。
2. `closeCurrentDatabase()`。
3. 从 `last-login-user` 取 uid，`store.delete('token-<uid>')` / `store.delete('refresh-token-<uid>')`。
4. **若 wipeLocalData=true**：调用 `session.fromPartition('persist:user-<uid>').clearStorageData()` 兜底清空 partition；wipeLocalData=false 时**不清** partition，下次同 uid 重登可直接命中 IndexedDB / Cookie / localStorage 缓存（见 Changelog 2026-05-21）。
5. `store.delete('last-login-user')`。

【wipeLocalData=true 才执行】6. `fs.rm(<userData>/users/<uid>, { recursive: true, force: true })`。7. `fs.rm(<userData>/Partitions/persist%3Auser-<uid>, { recursive: true, force: true })`。

8. 销毁旧窗口，按 `persist:anon` partition 创建登录窗口。

> outbox 中尚未上传成功的源文件，在「未勾选清除」的退出后**保留**，账号本人下次登录由 outbox worker 续传。

#### 冷启动

```
app.whenReady():
  applyInstanceUserDataPath()              ← 实例级 userData 切换
  const uid = store.get('last-login-user')
  ├─ 有值 uid:
  │    - tryInitLastLoginUserDb() 打开 users/<uid>/db/im.db
  │    - 成功 → createWindow({ partition: persist:user-<uid> }) 进主界面
  │    - 失败 → 兜底
  └─ 无值: createWindow({ partition: persist:anon }) 进入登录页
```

**init db 失败兜底**：不静默清数据，保留 `last-login-user`；创建 anon 登录窗口，在窗口顶部展示提示条「检测到本地数据异常 [重试] [清除并重新登录]」。决定权交给用户。

#### 强制 401

renderer 收到 401 → 调 `user:logout({ wipeLocalData: false })`，与移动端一致：保留本地数据，便于用户重新登录即可看到历史。

### 3.5 核心代码位置（不展开实现）

| 关注点                                                                                                                 | 代码文件                                                                     |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 实例 userData 切换 + 单实例锁                                                                                          | `apps/electron/src/main/runtime-paths.ts`、`apps/electron/src/main/index.ts` |
| 账号级路径 helper（`getAccountRoot/Db/Media/Outbox/PreferencesRoot`、partition 常量）                                  | `apps/electron/src/main/runtime-paths.ts`                                    |
| SQLite open/close（`initDatabaseForUser` / `closeCurrentDatabase` / `dropDatabaseForUser` / `tryInitLastLoginUserDb`） | `apps/electron/src/main/database.ts`                                         |
| 媒体缓存根 / outbox 根（按 uid）                                                                                       | `apps/electron/src/main/media-cache-core.ts`                                 |
| 媒体缓存协议白名单 + 退出时 cancelAll                                                                                  | `apps/electron/src/main/media-cache.ts`                                      |
| 用户偏好路径（按 uid）                                                                                                 | `apps/electron/src/main/user-preferences.ts`                                 |
| 存储统计扫描范围 / 白名单                                                                                              | `apps/electron/src/main/storage-stats.ts`                                    |
| 窗口管理（`createWindow({ partition })`、`user:login-success` / `user:logout` IPC、冷启动按 partition 拉起）           | `apps/electron/src/main/index.ts`                                            |
| preload 暴露 `user.logout`                                                                                             | `apps/electron/src/preload/index.ts`                                         |
| 渲染层退出 Modal（含复选框）+ 401 走 IPC                                                                               | `apps/web/src/App.tsx`                                                       |
| 类型补齐                                                                                                               | `apps/web/src/types/global.d.ts`                                             |
| 401 拦截分支（electron 环境调 IPC）                                                                                    | `apps/web/src/http/...`                                                      |

### 3.6 旧版本数据处理（不迁移）

与移动端一致。老用户冷启动后若读 `last-login-user`，`tryInitLastLoginUserDb` 会尝试 `users/<uid>/db/im.db`：文件不存在 → 由 `better-sqlite3` 新建空库 + migration → 进入主界面但本地无历史 → 自动走全量同步从服务端拉回。旧路径文件（`<userData>/<uid>-data.db`、`<userData>/media-cache/<username>/...`、`<userData>/preferences/<safeUsername>/...`）保留在磁盘上不主动清理。`electron-store` 中老的 `token-<uid>` / `refresh-token-<uid>` key 名与新方案一致，无需迁移。

### 3.7 预期效果

| 行为                               | 预期                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| A 登录 → 退出（不勾清除） → B 登录 | B 进入全新空间（新 partition、新 db），看不到 A 数据；A 的 db 与媒体仍在 `users/<A>/` 下     |
| B 退出 → A 再登录                  | A 秒进，本地历史完整                                                                         |
| A 退出（勾选清除）                 | `users/<A>/` 整个目录消失，`Partitions/persist:user-<A>/` 也被清；下次 A 登录 = 全量同步     |
| A 在线 → 强制 401                  | 默认保留本地数据，重新登录后秒进                                                             |
| 杀进程冷启动                       | 按 `last-login-user` 自动恢复，partition 跟随重建                                            |
| Dev 想同时挂多个账号               | 开新窗口加 `--instance=alice` / `--instance=bob`，各自独立 userData 子目录，原实例不需要退出 |
| Dev 同实例内 A→B 反复切            | 走与生产相同的「单活跃账号 + 退出重登」语义，不保证多账号并存                                |
| 主题 / 语言切换                    | 跨账号继承（设备/实例级偏好）                                                                |
| 反复 A↔B 切 10 次                 | 不串号、磁盘只保留各账号自己的目录（除非主动 wipe 才会删）                                   |

---

## 四、Changelog

- **2026-05-21**：媒体缓存表 `media_cache` 由 `username` 切换为 `user_id`（桌面端 migration v2，老数据 drop 重建）；`media-cache:*` IPC 全部移除 username 入参，由主进程从 `getCurrentUid()` 取活跃 uid；renderer 类型字段 `MediaCacheRecord.username` → `userId`。
- **2026-05-21**：桌面端 `user:logout` 未勾选「清理本地数据」时不再调用 `clearPartitionStorage`，保留 renderer IndexedDB / Cookie / localStorage，下次同 uid 重登可继续命中浏览器缓存。
- **2026-05-21**：桌面端退出当前设备只保留 `confirmLogout` 一次确认弹窗，`ProfileSettingsModal` 设备列表的当前设备项移除二次 Popconfirm。
- **2026-05-21**：桌面端登录链路修复 —— `notifyLoginSuccess` 改为对象签名携带 `accessToken / refreshToken`，主进程在销毁旧窗口前 init DB + 写 `token-<uid>` / `refresh-token-<uid>` + `setMainHttpClientToken`，避免 BrowserWindow 重建后 renderer 无法继续 await。

---

## 五、Roadmap（两端共用，不在本期）

- **本地 db 加密**：引入 SQLCipher 或按 uid 派生密钥，防止 root/越狱 / 其他 OS 用户/磁盘取证直接明文取数。
- **Token 进一步隔离**：
  - 移动端 token 移到 iOS Keychain / Android Keystore，账号 MMKV 仅存非敏感字段。
  - 桌面端 token 从 `electron-store` 搬到 `users/<uid>/auth.json`，wipeLocalData 时 `fs.rm` 一次性清除。
- **「已退出账号管理」UI**：设置中列出本机 `users/<uid>/` 全部目录，允许逐一清除（应对设备转手/共用场景）。
- **登录页账号记忆**：仅记忆账号名（不记忆密码、不记忆 token），方便多人共用时快速填入。
- **多账号自检脚本**：dev 构建下提供「设置 → 开发者 → 多账号自检」入口，自动跑 A→B→A 隔离断言。
- **端到端加密密钥隔离**：E2EE 上线时密钥按 uid 隔离存储。

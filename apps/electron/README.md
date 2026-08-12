# @mushroom/electron

Mushroom 桌面端（Electron 主进程 + 渲染进程壳）。渲染进程加载 `@mushroom/web` 的构建产物，主进程负责本地数据库、媒体缓存、桌面通知、token 安全存储等能力。

## 本地开发

```bash
# 在仓库根目录执行
pnpm install
cp apps/electron/.env.example apps/electron/.env   # 按需调整
pnpm dev:electron
```

## 配置

桌面端使用 `apps/electron/.env`（**不**复用根 `.env`，避免服务端 secrets 被打进桌面端 bundle）。主进程在 `app.whenReady` 时调用 `loadEnv()` 解析此文件，已有的 `process.env` 不会被覆盖。

### 日志相关

| 变量                 | 默认值                            | 说明                                                     |
| -------------------- | --------------------------------- | -------------------------------------------------------- |
| `LOG_LEVEL`          | `info`（打包）/ `debug`（未打包） | 日志级别，可选 `debug` / `info` / `warn` / `error`       |
| `LOG_MAX_FILE_MB`    | `50`                              | 单个日志文件最大体积（MB），超过后 electron-log 自动轮转 |
| `LOG_RETENTION_DAYS` | `14`                              | 日志保留天数，启动时清理 `userData/logs/` 下更早的日     |

日志文件位置：`app.getPath("userData")/logs/YYYY-MM-DD.log`。渲染进程通过 `window.electronAPI.logWrite` 桥接到主进程，最终落在同一份文件中。详见 [`docs/logging.md`](../../docs/logging.md)。

## 构建

```bash
pnpm build:electron
```

产物输出到 `apps/electron/dist-electron`。

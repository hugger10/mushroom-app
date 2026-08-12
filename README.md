# Mushroom App

Mushroom 是一款跨平台即时通讯（IM）应用，支持 Web、桌面（Electron）和移动端（React Native / Android & iOS）。项目采用 pnpm workspace 进行 monorepo 管理，前后端共享类型与业务逻辑。

## 项目结构

```
mushroom-app/
├── apps/
│   ├── web/            # Web 端，基于 Vite + React
│   ├── electron/       # 桌面端，Electron 壳 + 本地数据库
│   └── mobile/         # 移动端，React Native (Android & iOS)
├── server/             # 服务端，Express + WebSocket + 后台任务
├── packages/
│   ├── shared/         # 跨端共享：API 定义、WebSocket 协议、类型与工具
│   └── app-core/       # 跨端共享业务逻辑层
├── scripts/            # 开发、构建、质量检查等辅助脚本
└── docs/               # 项目文档与技术方案
```

## 核心能力

- **即时消息**：基于 WebSocket 的实时消息收发、消息确认与同步
- **用户体系**：注册、登录、JWT 鉴权
- **会话管理**：单聊 / 群聊会话列表与消息历史
- **好友关系**：好友添加、列表、分组
- **文件存储**：基于 MinIO / S3 兼容服务的文件上传与访问
- **桌面增强**：Electron 本地数据库缓存、设备指纹、离线支持
- **移动端**：React Native 原生双端，共用协议与业务逻辑
- **实时通话**：音视频通话方案（规划 / 实现中）

## 环境要求

- Node.js >= 18
- pnpm >= 8
- PostgreSQL >= 14
- Redis >= 6
- MinIO 或兼容 S3 服务

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 复制环境变量模板并按需修改
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp apps/electron/.env.example apps/electron/.env

# 3. 数据库迁移
pnpm db:migrate

# 4. 启动服务端
pnpm dev:server

# 5. 启动客户端（任选其一）
pnpm dev:web
pnpm dev:electron
pnpm dev:mobile
```

## 常用命令

| 命令              | 说明                                                |
| ----------------- | --------------------------------------------------- |
| `pnpm dev`        | 启动全栈开发环境                                    |
| `pnpm build`      | 构建所有目标                                        |
| `pnpm lint`       | ESLint + TypeScript 类型检查 + Prettier + Stylelint |
| `pnpm type-check` | 仅 TypeScript 类型检查                              |
| `pnpm db:migrate` | 运行数据库迁移                                      |
| `pnpm db:seed`    | 填充种子数据                                        |
| `pnpm clean`      | 清理所有构建产物与 node_modules                     |

## 配置说明

- **服务端**：根目录 `.env`，包含数据库、Redis、MinIO、JWT 等配置
- **Web / Electron 渲染进程**：`apps/web/.env.local`，配置 API 地址与 WebSocket 地址
- **Electron 主进程**：`apps/electron/.env`（独立于根 `.env`，避免服务端 secrets 泄漏到桌面端打包），含日志配置 `LOG_LEVEL` / `LOG_MAX_FILE_MB` / `LOG_RETENTION_DAYS`，详见 [`apps/electron/README.md`](./apps/electron/README.md)
- **移动端**：`apps/mobile/.env`（独立于根 `.env`，避免泄漏到 native bundle），含日志配置 `LOG_LEVEL` / `LOG_TO_FILE` / `LOG_MAX_FILE_MB` / `LOG_RETENTION_DAYS`

详见 `.env.example` 中的注释说明。

## 文档

- [技术方案]：docs目录里

## 技术栈概览

- **前端**：React、TypeScript、Vite、Tailwind CSS
- **桌面**：Electron、本地 SQLite
- **移动**：React Native
- **服务端**：Node.js、Express、WebSocket、PostgreSQL、Redis、MinIO
- **工程化**：pnpm workspace、ESLint、Prettier、Stylelint、Changeset

## License

MIT

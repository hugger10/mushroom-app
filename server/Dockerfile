FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app

# ======== Build stage ========
FROM base AS builder

# Dependency manifests (leverage Docker layer cache)
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY server/package.json server/tsconfig.json server/.npmrc ./server/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --filter @mushroom/server... --frozen-lockfile --ignore-scripts

# Source code
COPY packages/shared/ ./packages/shared/
COPY server/ ./server/

# Build workspace dependency first, then server
RUN pnpm --filter @mushroom/shared build
RUN pnpm --filter @mushroom/server build

# ======== Runtime stage ========
FROM base AS runner
ENV NODE_ENV=production

# Workspace metadata needed by pnpm deploy
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY server/package.json server/.npmrc ./server/
COPY packages/shared/package.json ./packages/shared/

# Pre-built artifacts from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/server/dist ./server/dist

# Resolve production dependencies into a standalone directory
RUN pnpm deploy --filter @mushroom/server --prod /deploy --ignore-scripts

WORKDIR /deploy
EXPOSE 9100
CMD ["node", "dist/server/src/index.js"]

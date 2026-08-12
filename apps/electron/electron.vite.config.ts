import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // Each client app owns its own .env files; load from this package directory.
  const env = loadEnv(mode, __dirname, "");
  Object.assign(process.env, env);
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:9100";

  const sharedAliases = {
    "@mushroom/shared": path.resolve(__dirname, "../../packages/shared/src"),
    "@mushroom/app-core": path.resolve(__dirname, "../../packages/app-core/src")
  };

  // Renderer reuses apps/web as its source root, which relies on the `@` →
  // `apps/web/src` alias. Mirror it here so renderer-only imports like
  // `@/utils/log` resolve when bundling under electron-vite.
  const rendererAliases = {
    ...sharedAliases,
    "@": path.resolve(__dirname, "../../apps/web/src")
  };

  return {
    main: {
      resolve: {
        alias: sharedAliases
      },
      build: {
        outDir: "dist-electron/main",
        rollupOptions: {
          input: {
            index: "src/main/index.ts",
            "media-cache-core": "src/main/media-cache-core.ts"
          }
        }
      },
      plugins: [externalizeDepsPlugin({ exclude: ["@mushroom/app-core"] })]
    },
    preload: {
      resolve: {
        alias: sharedAliases
      },
      build: {
        outDir: "dist-electron/preload"
      },
      plugins: [externalizeDepsPlugin({ exclude: ["@mushroom/app-core"] })]
    },
    renderer: {
      root: "../../apps/web",
      resolve: {
        alias: rendererAliases
      },
      build: {
        outDir: "dist-electron/renderer",
        rollupOptions: {
          input: "../../apps/web/index.html"
        }
      },
      plugins: [react()],
      envDir: __dirname,
      server: {
        host: "0.0.0.0",
        proxy: {
          "/api": {
            target: proxyTarget,
            changeOrigin: true,
            rewrite: requestPath => requestPath.replace(/^\/api/, "")
          },
          "/ws": {
            target: proxyTarget,
            changeOrigin: true,
            ws: true
          }
        }
      }
    }
  };
});

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // Each client app owns its own .env files; load from this package directory.
  const env = loadEnv(mode, __dirname, "");
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:9100";

  return {
    plugins: [react()],
    base: "./",
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@mushroom/shared": path.resolve(__dirname, "../../packages/shared/src")
      }
    },
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
  };
});

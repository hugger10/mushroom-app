import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const envFileNames = [".env.local", ".env"];

let loaded = false;

/**
 * Locate the server package root by walking up from __dirname until we find
 * a package.json whose name is "@mushroom/server". Falls back to two levels
 * up from the compiled location (dist/server/src/utils -> dist/server) or
 * three levels up from source (server/src/utils -> server).
 */
function resolveServerRoot(): string {
  let current = __dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    const pkgPath = path.join(current, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg?.name === "@mushroom/server") {
          return current;
        }
      } catch {
        // ignore malformed package.json and keep walking
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  // Fallback: assume source layout server/src/utils/load-env.ts
  return path.resolve(__dirname, "../..");
}

export function loadEnv() {
  if (loaded) {
    return;
  }
  loaded = true;

  // Prefer the current working directory (typical: `pnpm --filter @mushroom/server dev`
  // runs with cwd = server/), then fall back to the resolved server package root.
  const candidateDirs = Array.from(
    new Set([process.cwd(), resolveServerRoot()])
  );

  for (const dir of candidateDirs) {
    for (const fileName of envFileNames) {
      const envPath = path.resolve(dir, fileName);
      if (!fs.existsSync(envPath)) {
        continue;
      }
      dotenv.config({ path: envPath, override: false });
    }
  }
}

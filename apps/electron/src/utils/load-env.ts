import fs from "node:fs";
import path from "node:path";

const ENV_FILES = [".env.local", ".env"];

let loaded = false;

function parseLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

function loadFile(filePath: string): void {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const parsed = parseLine(rawLine);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Resolve the electron package root (the directory containing
 * apps/electron/package.json) by walking up from a seed directory.
 */
function findElectronRoot(seed: string): string | null {
  let current = path.resolve(seed);
  for (let depth = 0; depth < 8; depth += 1) {
    const pkgPath = path.join(current, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg?.name === "@mushroom/electron") {
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
  return null;
}

/**
 * Load `.env` / `.env.local` files for the Electron main process from the
 * apps/electron/ package directory. Safe to call multiple times; only the
 * first call has effect. Existing process.env entries are NOT overridden.
 */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const candidates = new Set<string>();
  for (const seed of [process.cwd(), __dirname]) {
    const root = findElectronRoot(seed);
    if (root) candidates.add(root);
  }
  if (candidates.size === 0) {
    // Fallback: source layout apps/electron/src/utils/load-env.ts
    candidates.add(path.resolve(__dirname, "../.."));
  }
  for (const dir of candidates) {
    for (const fileName of ENV_FILES) {
      loadFile(path.resolve(dir, fileName));
    }
  }
}

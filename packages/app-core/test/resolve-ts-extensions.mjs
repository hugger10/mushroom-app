// Resolution hook: when a parent .ts file imports a specifier with no
// extension, try the same path with `.ts`, then `/index.ts`. Delegates
// everything else to Node's default resolver. Type-stripping is handled
// by Node's built-in TypeScript support (--experimental-strip-types,
// default-on in 22.x).

import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TS_EXTENSIONS = [".ts", ".tsx"];
const INDEX_FILES = ["/index.ts", "/index.tsx"];

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  // Only attempt rewrites for relative or absolute specifiers (not bare).
  const isRelative = specifier.startsWith(".") || specifier.startsWith("/");
  if (isRelative && context.parentURL) {
    const url = new URL(specifier, context.parentURL);
    const filePath = fileURLToPath(url);

    // If exact file exists, let default handle. Treat existing directories as
    // "needs resolution" so that `./foo` can resolve to either `./foo.ts` or
    // `./foo/index.ts` (e.g. when both `foo.ts` and `foo/` coexist).
    if (!isFile(filePath)) {
      for (const ext of TS_EXTENSIONS) {
        if (existsSync(filePath + ext)) {
          return nextResolve(specifier + ext, context);
        }
      }
      for (const idx of INDEX_FILES) {
        if (existsSync(filePath + idx)) {
          return nextResolve(specifier + idx, context);
        }
      }
    }
  }

  return nextResolve(specifier, context);
}

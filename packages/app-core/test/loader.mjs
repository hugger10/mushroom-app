// Tiny node resolve hook that lets test files import TypeScript modules
// using extension-less specifiers (Node 22 strips types but does not
// auto-append `.ts`). Activated via `node --import ./test/loader.mjs`
// when running `node --test`. Intentionally minimal: no transpilation,
// just extension resolution — Node's built-in strip-types handles the
// rest.

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(
  new URL("./resolve-ts-extensions.mjs", pathToFileURL(import.meta.filename))
);

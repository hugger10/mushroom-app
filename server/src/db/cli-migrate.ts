import { loadEnv } from "../utils/load-env";
loadEnv();

import pg from "./pg";
import { runServerMigrations } from "./migrate";

async function main() {
  await runServerMigrations();
  console.log("Server migrations completed.");
  await pg.$pool.end();
}

void main().catch(async error => {
  console.error("Server migrations failed.", error);
  await pg.$pool.end().catch(() => undefined);
  process.exit(1);
});

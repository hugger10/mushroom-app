import { loadEnv } from "../utils/load-env";
loadEnv();

import pg from "./pg";
import { runServerMigrations } from "./migrate";

async function resetPublicSchema() {
  await pg.tx(async t => {
    await t.none("DROP SCHEMA IF EXISTS public CASCADE");
    await t.none("CREATE SCHEMA public");
    await t.none("GRANT ALL ON SCHEMA public TO PUBLIC");
  });
}

async function main() {
  if (
    process.env.NODE_ENV === "production" &&
    !process.argv.includes("--force-prod")
  ) {
    console.error(
      "Refusing to reset database in production. Pass --force-prod to override."
    );
    process.exit(1);
  }

  await resetPublicSchema();
  await runServerMigrations();

  console.log("Server database reset completed.");
  await pg.$pool.end();
}

void main().catch(async error => {
  console.error("Server database reset failed.", error);
  await pg.$pool.end().catch(() => undefined);
  process.exit(1);
});

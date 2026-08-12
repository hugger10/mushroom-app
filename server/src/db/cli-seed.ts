import { loadEnv } from "../utils/load-env";
loadEnv();

import bcrypt from "bcryptjs";
import pg from "./pg";
import { runServerMigrations } from "./migrate";

type SeedUser = {
  username: string;
  nickname: string;
  password: string;
};

const seedUsers: SeedUser[] = [
  { username: "alice", nickname: "Alice", password: "123456" },
  { username: "bob", nickname: "Bob", password: "123456" },
  { username: "carol", nickname: "Carol", password: "123456" }
];

async function upsertUser(user: SeedUser) {
  const passwordHash = await bcrypt.hash(user.password, 10);
  return pg.one<{
    id: number;
    username: string;
  }>(
    `
    INSERT INTO users (
      username,
      password,
      nickname,
      created_at,
      updated_at,
      status,
      is_deleted
    )
    VALUES ($1, $2, $3, NOW(), NOW(), 0, FALSE)
    ON CONFLICT (username) DO UPDATE
    SET
      password = EXCLUDED.password,
      nickname = EXCLUDED.nickname,
      updated_at = NOW(),
      is_deleted = FALSE
    RETURNING id, username
    `,
    [user.username, passwordHash, user.nickname]
  );
}

async function syncSerialSequence(tableName: string, columnName: string) {
  await pg.one(
    `
    SELECT setval(
      pg_get_serial_sequence($1, $2),
      COALESCE((SELECT MAX(id) FROM ${tableName}), 0) + 1,
      false
    )
    `,
    [tableName, columnName]
  );
}

async function main() {
  await runServerMigrations();
  await syncSerialSequence("users", "id");

  const createdUsers = [];
  for (const user of seedUsers) {
    createdUsers.push(await upsertUser(user));
  }

  console.log("Seed completed.");
  console.table(
    seedUsers.map(user => ({
      username: user.username,
      password: user.password
    }))
  );

  await pg.$pool.end();
}

void main().catch(async error => {
  console.error("Server seed failed.", error);
  await pg.$pool.end().catch(() => undefined);
  process.exit(1);
});

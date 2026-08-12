/**
 * 用户 ensure 工具：缺失则自动 upsert，密码使用 bcrypt 哈希后写入。
 * 行为对齐 server/src/db/cli-seed.ts。
 */
import bcrypt from "bcryptjs";
import { pg } from "./env";

export interface SeededUser {
  id: number;
  username: string;
  nickname: string;
}

export const DEFAULT_PASSWORD = "123456";

export async function ensureUser(
  username: string,
  password: string = DEFAULT_PASSWORD,
  nickname?: string
): Promise<SeededUser> {
  const existing = await pg.oneOrNone<{
    id: number;
    username: string;
    nickname: string;
    is_deleted: boolean;
  }>(
    "SELECT id, username, nickname, is_deleted FROM users WHERE username = $1",
    [username]
  );
  if (existing && !existing.is_deleted) {
    return {
      id: Number(existing.id),
      username: existing.username,
      nickname: existing.nickname || username
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const row = await pg.one<{ id: number; username: string; nickname: string }>(
    `
    INSERT INTO users (
      username, password, nickname,
      created_at, updated_at, status, is_deleted
    )
    VALUES ($1, $2, $3, NOW(), NOW(), 0, FALSE)
    ON CONFLICT (username) DO UPDATE
    SET password = EXCLUDED.password,
        nickname = EXCLUDED.nickname,
        is_deleted = FALSE,
        updated_at = NOW()
    RETURNING id, username, nickname
    `,
    [username, passwordHash, nickname ?? username]
  );
  return {
    id: Number(row.id),
    username: row.username,
    nickname: row.nickname || username
  };
}

export async function ensureUsers(
  usernames: string[],
  password = DEFAULT_PASSWORD
): Promise<SeededUser[]> {
  const result: SeededUser[] = [];
  for (const u of usernames) {
    result.push(await ensureUser(u, password));
  }
  return result;
}

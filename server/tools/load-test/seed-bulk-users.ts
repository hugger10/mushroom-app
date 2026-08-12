/**
 * 批量造测试数据：
 *   1. 创建 USER_COUNT 个用户（用户名英文 lt_xxxxxx，昵称 2-10 字随机中英）
 *   2. 在用户间建立联系人关系（一部分单向、一部分双向，按 inDegree 均衡分布）
 *   3. 为每个用户保证 DIRECTS_PER_USER 个私聊 + GROUPS_PER_USER 个群聊
 *   4. 给每个会话灌入 MESSAGES_PER_CONV 条文字消息（1-100 字符随机内容）
 *
 * 默认无需传参即可运行：
 *   pnpm --filter @mushroom/server loadtest:bulk -- --yes
 *
 * 可通过环境变量覆盖：USER_COUNT / DIRECTS_PER_USER / GROUPS_PER_USER /
 *   MESSAGES_PER_CONV / GROUP_SIZE_MIN / GROUP_SIZE_MAX 等。
 */
import "./_lib/env";
import bcrypt from "bcryptjs";
import { ensureNotProduction, dbInfo, pg, pgp } from "./_lib/env";
import { parseArgs, confirmOrExit } from "./_lib/cli";
import { ProgressLogger } from "./_lib/progress";
import {
  ensureDirectConversation,
  ensureGroupConversation
} from "./_lib/conversations";
import { buildSendingPlan } from "./_lib/sequencer";
import { bulkInsertTextMessages } from "./_lib/db_writer";
import { generateRandomNickname, generateRandomText } from "./_lib/random_text";
import type { SeededUser } from "./_lib/users";

// ---------- 可调常量（环境变量可覆盖） ----------
function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function envFloat(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function envStr(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

const USER_COUNT = envInt("USER_COUNT", 100);
const USERNAME_PREFIX = envStr("USERNAME_PREFIX", "lt_");
const PASSWORD = envStr("PASSWORD", "123456");

const CONTACT_USER_RATIO = envFloat("CONTACT_USER_RATIO", 0.7);
const CONTACTS_PER_USER_MIN = envInt("CONTACTS_PER_USER_MIN", 3);
const CONTACTS_PER_USER_MAX = envInt("CONTACTS_PER_USER_MAX", 12);
const MUTUAL_CONTACT_RATIO = envFloat("MUTUAL_CONTACT_RATIO", 0.5);

const DIRECTS_PER_USER = envInt("DIRECTS_PER_USER", 20);
const GROUPS_PER_USER = envInt("GROUPS_PER_USER", 20);
const GROUP_SIZE_MIN = envInt("GROUP_SIZE_MIN", 2);
const GROUP_SIZE_MAX = envInt("GROUP_SIZE_MAX", 50);

const MESSAGES_PER_CONV = envInt("MESSAGES_PER_CONV", 500);
const MESSAGE_CHAR_MIN = envInt("MESSAGE_CHAR_MIN", 1);
const MESSAGE_CHAR_MAX = envInt("MESSAGE_CHAR_MAX", 100);

const DB_BATCH_SIZE = envInt("DB_BATCH_SIZE", 500);
const TIME_WINDOW_DAYS = envInt("TIME_WINDOW_DAYS", 7);

// ---------- 工具 ----------
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickIndicesByMinCount(
  counts: number[],
  k: number,
  exclude: Set<number> = new Set()
): number[] {
  // 按 counts 升序选 k 个 index，跳过 exclude
  const indices = counts
    .map((c, i) => ({ c, i }))
    .filter(x => !exclude.has(x.i));
  // 同 count 内随机化避免每次都选同样的人
  indices.sort((a, b) => a.c - b.c || (Math.random() < 0.5 ? -1 : 1));
  return indices.slice(0, k).map(x => x.i);
}

const RANDOM_SIGNATURES = [
  "今天也要加油",
  "Stay hungry, stay foolish",
  "随便看看",
  "在路上",
  "Hello world",
  "做自己想做的事",
  "保持热爱",
  "晚安"
];

// ---------- A. 创建用户 ----------
async function createUsers(): Promise<SeededUser[]> {
  console.log(`[bulk] step A: 创建 ${USER_COUNT} 个用户`);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const rows: Array<{
    username: string;
    password: string;
    email: string;
    nickname: string;
    gender: number;
    birthday: string | null;
    signature: string;
  }> = [];

  for (let i = 1; i <= USER_COUNT; i += 1) {
    const username = `${USERNAME_PREFIX}${String(i).padStart(6, "0")}`;
    const nickname = generateRandomNickname();
    const gender = randInt(0, 2);
    const year = randInt(1970, 2005);
    const month = randInt(1, 12);
    const day = randInt(1, 28);
    const birthday = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const signature =
      RANDOM_SIGNATURES[Math.floor(Math.random() * RANDOM_SIGNATURES.length)];
    rows.push({
      username,
      password: passwordHash,
      email: `${username}@loadtest.local`,
      nickname,
      gender,
      birthday,
      signature
    });
  }

  const cs = new pgp.helpers.ColumnSet(
    [
      "username",
      "password",
      "email",
      "nickname",
      "gender",
      "birthday",
      "signature"
    ],
    { table: "users" }
  );
  const insertSql =
    pgp.helpers.insert(rows, cs) + " ON CONFLICT (username) DO NOTHING";
  await pg.none(insertSql);

  // 拉回真实 id
  const usernames = rows.map(r => r.username);
  const dbRows = await pg.manyOrNone<{
    id: string;
    username: string;
    nickname: string;
  }>(
    `SELECT id::text AS id, username, nickname FROM users WHERE username = ANY($1)`,
    [usernames]
  );
  const map = new Map<string, SeededUser>();
  for (const r of dbRows) {
    map.set(r.username, {
      id: Number(r.id),
      username: r.username,
      nickname: r.nickname || r.username
    });
  }
  // 若用户原本已存在但昵称为空，做一次回写（不强制）
  const ordered = usernames
    .map(u => map.get(u))
    .filter((x): x is SeededUser => Boolean(x));
  console.log(`[bulk] users ready: ${ordered.length}`);
  return ordered;
}

// ---------- B. 联系人 ----------
async function seedContacts(users: SeededUser[]): Promise<number> {
  console.log(`[bulk] step B: 写入联系人关系`);
  const n = users.length;
  const activeCount = Math.max(1, Math.round(n * CONTACT_USER_RATIO));
  // 随机挑选 activeCount 个 owner
  const allIdx = users.map((_, i) => i);
  for (let i = allIdx.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [allIdx[i], allIdx[j]] = [allIdx[j], allIdx[i]];
  }
  const activeOwners = allIdx.slice(0, activeCount);

  const inDegree = new Array(n).fill(0);
  const edges = new Set<string>(); // "a->b"
  const edgeRows: Array<{
    owner_user_id: number;
    contact_user_id: number;
    status: string;
  }> = [];

  function addEdge(a: number, b: number) {
    const k = `${a}->${b}`;
    if (edges.has(k) || a === b) return;
    edges.add(k);
    inDegree[b] += 1;
    edgeRows.push({
      owner_user_id: users[a].id,
      contact_user_id: users[b].id,
      status: "normal"
    });
  }

  for (const ownerIdx of activeOwners) {
    const target = randInt(CONTACTS_PER_USER_MIN, CONTACTS_PER_USER_MAX);
    const exclude = new Set<number>([ownerIdx]);
    // 已加过的也排除
    for (const k of edges) {
      const [a, b] = k.split("->").map(Number);
      if (a === ownerIdx) exclude.add(b);
    }
    const picks = pickIndicesByMinCount(inDegree, target, exclude);
    for (const peerIdx of picks) {
      addEdge(ownerIdx, peerIdx);
      if (Math.random() < MUTUAL_CONTACT_RATIO) {
        addEdge(peerIdx, ownerIdx);
      }
    }
  }

  if (edgeRows.length === 0) return 0;

  const cs = new pgp.helpers.ColumnSet(
    ["owner_user_id", "contact_user_id", "status"],
    { table: "user_contacts" }
  );
  // 分批插入避免 SQL 过长
  const batch = 500;
  for (let i = 0; i < edgeRows.length; i += batch) {
    const slice = edgeRows.slice(i, i + batch);
    const sql =
      pgp.helpers.insert(slice, cs) +
      " ON CONFLICT (owner_user_id, contact_user_id) DO NOTHING";
    await pg.none(sql);
  }

  console.log(
    `[bulk] contacts inserted: ${edgeRows.length} edges (active owners=${activeOwners.length})`
  );
  return edgeRows.length;
}

// ---------- C. 私聊 ----------
interface DirectConvInfo {
  id: string;
  type: 1;
  memberIds: [number, number];
  memberNicknameMap: Map<number, string>;
}

async function seedDirects(users: SeededUser[]): Promise<DirectConvInfo[]> {
  console.log(`[bulk] step C: 创建私聊会话 (每人 >= ${DIRECTS_PER_USER})`);
  const n = users.length;
  const counts = new Array(n).fill(0);
  const made = new Set<string>(); // "i,j"  i<j
  const result: DirectConvInfo[] = [];

  function pairKey(a: number, b: number) {
    return a < b ? `${a},${b}` : `${b},${a}`;
  }

  // 反复扫直到所有人都满足
  let safety = 0;
  while (counts.some(c => c < DIRECTS_PER_USER)) {
    safety += 1;
    if (safety > n * DIRECTS_PER_USER * 4) {
      console.warn("[bulk] seedDirects safety break");
      break;
    }
    // 找还差最多的人
    let i = 0;
    let minC = counts[0];
    for (let k = 1; k < n; k += 1) {
      if (counts[k] < minC) {
        minC = counts[k];
        i = k;
      }
    }
    if (counts[i] >= DIRECTS_PER_USER) break;
    // 从 counts 升序中找未配对的 j
    const exclude = new Set<number>([i]);
    for (let k = 0; k < n; k += 1) {
      if (made.has(pairKey(i, k))) exclude.add(k);
    }
    const candidates = pickIndicesByMinCount(counts, 1, exclude);
    if (candidates.length === 0) break;
    const j = candidates[0];
    const conv = await ensureDirectConversation(users[i], users[j]);
    made.add(pairKey(i, j));
    counts[i] += 1;
    counts[j] += 1;
    result.push({
      id: conv.id,
      type: 1,
      memberIds: [users[i].id, users[j].id],
      memberNicknameMap: new Map([
        [users[i].id, users[i].nickname],
        [users[j].id, users[j].nickname]
      ])
    });
  }

  console.log(
    `[bulk] direct conversations created: ${result.length} (min=${Math.min(...counts)} max=${Math.max(...counts)})`
  );
  return result;
}

// ---------- D. 群聊 ----------
interface GroupConvInfo {
  id: string;
  type: 2;
  memberIds: number[];
  memberNicknameMap: Map<number, string>;
}

async function seedGroups(users: SeededUser[]): Promise<GroupConvInfo[]> {
  console.log(`[bulk] step D: 创建群聊会话 (每人 >= ${GROUPS_PER_USER})`);
  const n = users.length;
  const counts = new Array(n).fill(0);
  const result: GroupConvInfo[] = [];

  let groupIdx = 0;
  let safety = 0;
  while (counts.some(c => c < GROUPS_PER_USER)) {
    safety += 1;
    if (safety > n * GROUPS_PER_USER * 4) {
      console.warn("[bulk] seedGroups safety break");
      break;
    }
    const size = randInt(GROUP_SIZE_MIN, Math.min(GROUP_SIZE_MAX, n));
    const memberIdxs = pickIndicesByMinCount(counts, size);
    if (memberIdxs.length < 2) break;
    const ownerIdx = memberIdxs[0];
    const owner = users[ownerIdx];
    const others = memberIdxs.slice(1).map(i => users[i]);

    groupIdx += 1;
    const name = `lt-grp-${String(groupIdx).padStart(5, "0")}`;
    const conv = await ensureGroupConversation({
      owner,
      members: others,
      name
    });

    const memberIds = memberIdxs.map(i => users[i].id);
    const nickMap = new Map<number, string>(
      memberIdxs.map(i => [users[i].id, users[i].nickname])
    );
    result.push({
      id: conv.id,
      type: 2,
      memberIds,
      memberNicknameMap: nickMap
    });
    for (const idx of memberIdxs) counts[idx] += 1;
  }

  console.log(
    `[bulk] group conversations created: ${result.length} (min=${Math.min(...counts)} max=${Math.max(...counts)})`
  );
  return result;
}

// ---------- E. 灌消息 ----------
async function seedMessages(
  conversations: Array<DirectConvInfo | GroupConvInfo>
): Promise<number> {
  const total = conversations.length;
  console.log(
    `[bulk] step E: 给 ${total} 个会话各灌 ${MESSAGES_PER_CONV} 条消息（共约 ${total * MESSAGES_PER_CONV} 条）`
  );
  const startMs = Date.now() - TIME_WINDOW_DAYS * 86400_000;

  const logger = new ProgressLogger(
    "seed-bulk-messages",
    total * MESSAGES_PER_CONV,
    Math.max(DB_BATCH_SIZE, MESSAGES_PER_CONV)
  );
  logger.begin();

  let totalInserted = 0;
  for (const conv of conversations) {
    const plan = buildSendingPlan({
      memberIds: conv.memberIds,
      count: MESSAGES_PER_CONV,
      startMs
    });
    const result = await bulkInsertTextMessages({
      conversationId: conv.id,
      conversationType: conv.type,
      memberUserIds: conv.memberIds,
      memberNicknameMap: conv.memberNicknameMap,
      plan,
      batchSize: DB_BATCH_SIZE,
      withOutbox: false,
      textGenerator: ({ mentionCandidates }) =>
        generateRandomText({
          min: MESSAGE_CHAR_MIN,
          max: MESSAGE_CHAR_MAX,
          mentionCandidates
        }),
      onBatchDone: n => logger.tick(n)
    });
    totalInserted += result.inserted;
  }
  logger.finish({ conversations: total, messages_total: totalInserted });
  return totalInserted;
}

// ---------- main ----------
async function main() {
  ensureNotProduction();
  const { options } = parseArgs();

  console.log("[bulk] config", {
    db: dbInfo(),
    USER_COUNT,
    USERNAME_PREFIX,
    CONTACT_USER_RATIO,
    CONTACTS_PER_USER_MIN,
    CONTACTS_PER_USER_MAX,
    MUTUAL_CONTACT_RATIO,
    DIRECTS_PER_USER,
    GROUPS_PER_USER,
    GROUP_SIZE_MIN,
    GROUP_SIZE_MAX,
    MESSAGES_PER_CONV,
    MESSAGE_CHAR_MIN,
    MESSAGE_CHAR_MAX,
    DB_BATCH_SIZE,
    TIME_WINDOW_DAYS
  });
  await confirmOrExit(
    options,
    `将创建约 ${USER_COUNT} 个用户、${(USER_COUNT * DIRECTS_PER_USER) / 2} 个私聊、若干群聊，并灌入约 ${MESSAGES_PER_CONV} 条/会话 的文字消息`
  );

  const t0 = Date.now();
  const users = await createUsers();
  const contactsCount = await seedContacts(users);
  const directs = await seedDirects(users);
  const groups = await seedGroups(users);
  const messages = await seedMessages([...directs, ...groups]);
  const elapsedMs = Date.now() - t0;

  console.log(
    JSON.stringify(
      {
        scenario: "seed-bulk-users",
        users: users.length,
        contact_edges: contactsCount,
        direct_conversations: directs.length,
        group_conversations: groups.length,
        messages_total: messages,
        elapsed_ms: elapsedMs
      },
      null,
      2
    )
  );
}

main()
  .catch(err => {
    console.error("[bulk] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.$pool.end().catch(() => undefined);
  });

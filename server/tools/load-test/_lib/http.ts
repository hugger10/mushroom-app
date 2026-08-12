/**
 * HTTP 客户端封装：注册 / 登录 / 创建会话。
 * 仅用于 load-test 脚本。
 */
import { baseUrl } from "./env";

export interface LoginSession {
  userId: number;
  username: string;
  nickname: string;
  token: string;
  refreshToken: string;
  deviceId: string;
}

interface LoginResponseBody {
  code: number;
  message?: string;
  data?: {
    access_token: string;
    refresh_token: string;
  };
}

interface ApiResponse<T> {
  code: number;
  message?: string;
  data?: T;
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.headers)
    Object.assign(headers, init.headers as Record<string, string>);

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers
  });
  let body: ApiResponse<T> | null = null;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    /* ignore */
  }
  if (!res.ok || !body || body.code !== 0) {
    throw new Error(
      `${init.method || "GET"} ${path} 失败: status=${res.status} code=${body?.code} message=${body?.message}`
    );
  }
  return body.data as T;
}

export async function tryRegister(
  username: string,
  password: string,
  nickname?: string
): Promise<void> {
  // 已存在时静默忽略
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password, nickname: nickname ?? username })
  });
  // 不强校验：用户已存在时 server 会返回业务错误
  res.body?.cancel?.();
}

export async function loginAs(
  username: string,
  password: string,
  nickname?: string
): Promise<LoginSession> {
  const deviceId = `loadtest-${username}-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const data = await request<NonNullable<LoginResponseBody["data"]>>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        device: { device_id: deviceId, device_type: 1, device_name: "loadtest" }
      })
    }
  );
  // 解析 access_token 内的 userId 不必要，Profile 接口可拿到
  const profile = await request<{
    id: number;
    username: string;
    nickname: string;
  }>("/auth/profile", { token: data.access_token });

  void nickname;
  return {
    userId: Number(profile.id),
    username: profile.username,
    nickname: profile.nickname || username,
    token: data.access_token,
    refreshToken: data.refresh_token,
    deviceId
  };
}

export async function ensureLoggedIn(
  username: string,
  password: string
): Promise<LoginSession> {
  try {
    return await loginAs(username, password);
  } catch {
    // 登录失败：尝试注册一次后重试
    await tryRegister(username, password);
    return loginAs(username, password);
  }
}

export async function createDirectConversationViaApi(
  session: LoginSession,
  targetUserId: number
): Promise<{ id: string }> {
  const data = await request<{ server_conversation_id: string; id?: string }>(
    "/conversation/direct",
    {
      method: "POST",
      token: session.token,
      body: JSON.stringify({ target_user_id: targetUserId })
    }
  );
  return { id: String(data.server_conversation_id ?? data.id) };
}

export async function createGroupConversationViaApi(
  ownerSession: LoginSession,
  memberUserIds: number[],
  name: string
): Promise<{ id: string }> {
  const data = await request<{ server_conversation_id: string; id?: string }>(
    "/conversation/create",
    {
      method: "POST",
      token: ownerSession.token,
      body: JSON.stringify({
        conv: { name, owner_nickname: ownerSession.nickname },
        members: memberUserIds
          .filter(id => id !== ownerSession.userId)
          .map(id => ({ user_id: id }))
      })
    }
  );
  return { id: String(data.server_conversation_id ?? data.id) };
}

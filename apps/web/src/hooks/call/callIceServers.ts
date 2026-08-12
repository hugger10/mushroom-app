import log from "@/utils/log";
import { fetchCallIceConfig } from "../../http/api";
import { resolveConfiguredIceServers } from "../useChatHelpers";

const callLog = log.scope("call");

type IceServerCache = {
  expiresAt: number;
  servers: RTCIceServer[];
};

// 模块级单例缓存：整个 app 共享一份 ICE 配置，避免多个 hook
// 实例重复请求；TTL 由服务端返回。
let cache: IceServerCache | null = null;

export async function resolveIceServers(): Promise<RTCIceServer[]> {
  if (cache && cache.expiresAt > Date.now() + 5000) {
    return cache.servers;
  }

  try {
    const response = await fetchCallIceConfig();
    const servers = response.ice_servers.reduce<RTCIceServer[]>(
      (result, server) => {
        const urls = Array.isArray(server.urls)
          ? server.urls.filter(Boolean)
          : [];
        if (urls.length === 0) {
          return result;
        }

        const nextServer: RTCIceServer = { urls };
        if (server.username) {
          nextServer.username = server.username;
        }
        if (server.credential) {
          nextServer.credential = server.credential;
        }
        result.push(nextServer);
        return result;
      },
      []
    );

    if (servers.length > 0) {
      cache = {
        expiresAt: Date.now() + response.ttl_seconds * 1000,
        servers
      };
      return servers;
    }
  } catch (error) {
    callLog.warn("fetch ICE servers failed", {
      err: error instanceof Error ? error.message : String(error)
    });
  }

  const fallback = resolveConfiguredIceServers();
  cache = {
    expiresAt: Date.now() + 5 * 60 * 1000,
    servers: fallback
  };
  return fallback;
}

// 仅供测试使用；生产代码不应调用。
export function __resetIceServerCacheForTests() {
  cache = null;
}

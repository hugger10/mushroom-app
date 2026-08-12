import {
  createJsonBackedAuthSessionStore,
  createJsonBackedMobileDataRepository,
  createJsonBackedSyncCheckpointStore,
  MobileAppController
} from "@mushroom/app-core";
import { ApiError } from "@mushroom/shared";
import { createMockConversation } from "./helpers/mobile-test-helpers";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: async (key: string) => {
      store.delete(key);
    }
  };
}

describe("MobileAppController auth recovery", () => {
  test("clears local session and data when bootstrap sync is unauthorized", async () => {
    const authStore = createJsonBackedAuthSessionStore({
      storage: createMemoryStorage(),
      initialSnapshot: {
        accessToken: "stale-token",
        refreshToken: null,
        user: {
          userId: 1,
          username: "alice",
          nickname: "Alice",
          access_token: "stale-token"
        }
      }
    });
    const checkpoints = createJsonBackedSyncCheckpointStore({
      storage: createMemoryStorage()
    });
    const conversation = createMockConversation();
    const repository = createJsonBackedMobileDataRepository({
      storage: createMemoryStorage(),
      initialSnapshot: {
        conversations: [conversation],
        messagesByConversation: {
          [conversation.client_conversation_id]: []
        }
      }
    });
    const api = {
      profile: jest.fn().mockResolvedValue({
        data: {
          id: 1,
          username: "alice",
          nickname: "Alice",
          avatar_url: null,
          signature: "",
          gender: 0
        }
      }),
      getContacts: jest
        .fn()
        .mockRejectedValue(new ApiError("not found token", { status: 401 })),
      getBlocks: jest.fn().mockResolvedValue({
        data: {
          blocks: []
        }
      })
    };
    const controller = new MobileAppController({
      api: api as never,
      authStore,
      checkpoints,
      repository,
      deviceInfo: {
        deviceId: "device-1",
        deviceType: 3,
        deviceName: "Test Device"
      }
    });

    const snapshot = await controller.bootstrap();

    expect(snapshot.auth.accessToken).toBeNull();
    expect(snapshot.auth.user).toBeNull();
    // 设计变更：被动 401（handleUnauthorizedSession → clearLocalSession({wipeLocalData:false})）
    // 仅清除凭据，保留 repository / sync checkpoint，使下一次同 uid 登录可同步渲染上次快照。
    // 参考 controller.ts: clearLocalSession 内的注释。
    expect(snapshot.data.conversations).toEqual([conversation]);
    await expect(authStore.read()).resolves.toMatchObject({
      accessToken: null,
      user: null
    });
    await expect(repository.snapshot()).resolves.toMatchObject({
      conversations: [conversation]
    });
  });
});

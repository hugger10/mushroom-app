import {
  createJsonBackedAuthSessionStore,
  createJsonBackedMobileDataRepository,
  createJsonBackedSyncCheckpointStore,
  MobileAppController
} from "@mushroom/app-core";

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

describe("MobileAppController block changes", () => {
  test("reconciles contacts when a blocked saved contact is unblocked", async () => {
    const authStore = createJsonBackedAuthSessionStore({
      storage: createMemoryStorage(),
      initialSnapshot: {
        accessToken: "access-token",
        refreshToken: null,
        user: {
          userId: 2,
          username: "zhangsan",
          nickname: "zhangsan",
          access_token: "access-token"
        }
      }
    });
    const checkpoints = createJsonBackedSyncCheckpointStore({
      storage: createMemoryStorage(),
      initialSnapshot: {
        contacts: new Date().toISOString()
      }
    });
    const repository = createJsonBackedMobileDataRepository({
      storage: createMemoryStorage(),
      initialSnapshot: {
        contacts: [
          {
            user_id: 3,
            username: "bob",
            nickname: "Bob",
            gender: 0,
            is_blocked: true,
            blocked_at: "2026-05-16T00:00:00.000Z",
            updated_at: "2026-05-16T00:00:00.000Z"
          }
        ]
      }
    });
    const api = {
      getContacts: jest.fn().mockResolvedValue({
        data: {
          contacts: [
            {
              user_id: 3,
              contact_user_id: 3,
              username: "bob",
              nickname: "Bob",
              remark_name: null,
              remark_note: null,
              source: "username",
              status: "normal",
              avatar_url: null,
              gender: 0,
              signature: null,
              updated_at: "2026-05-16T01:00:00.000Z"
            }
          ]
        }
      }),
      getBlocks: jest.fn().mockResolvedValue({
        data: {
          blocks: []
        }
      }),
      syncConversations: jest.fn().mockResolvedValue({
        data: {
          conversations: [],
          nextSyncCursor: null
        }
      }),
      syncMessageStates: jest.fn().mockResolvedValue({
        data: {
          states: [],
          hasMore: false,
          nextSyncCursor: null
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

    const snapshot = await controller.handleRealtimeEvent({
      messageClassify: "block_changed",
      action: "unblocked",
      block: {
        blocked_id: 3
      }
    } as never);

    expect(api.getContacts).toHaveBeenCalledTimes(1);
    expect(snapshot.data.contacts).toHaveLength(1);
    expect(snapshot.data.contacts[0]).toMatchObject({
      user_id: 3,
      username: "bob",
      is_blocked: false,
      source: "username"
    });
  });
});

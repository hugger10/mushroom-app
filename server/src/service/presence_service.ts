import UserDeviceRepository from "../repository/user_device_repository";
import UserRepository from "../repository/user_repository";
import { wsServer } from "../websocket";
import { loadPresenceVisibilityContext } from "./presence_visibility";

function resolveLastActiveAt(
  userLastLoginAt?: Date | null | string,
  deviceLastActiveAt?: Date | null | string
) {
  const userDate = userLastLoginAt ? new Date(userLastLoginAt) : null;
  const deviceDate = deviceLastActiveAt ? new Date(deviceLastActiveAt) : null;

  if (userDate && deviceDate) {
    return userDate > deviceDate ? userDate : deviceDate;
  }

  return deviceDate ?? userDate ?? undefined;
}

class PresenceService {
  /**
   * 当前登录用户的在线状态摘要（自查口径，不做模糊化、不做可见性过滤）。
   */
  async getPresenceSummary(userId: number) {
    const [user, presence, lastActiveEntries] = await Promise.all([
      UserRepository.findById(userId),
      wsServer.getPresenceSummary(userId),
      UserDeviceRepository.listLatestActivityByUsers([userId])
    ]);
    const lastActiveAt = resolveLastActiveAt(
      user?.last_login_at,
      lastActiveEntries[0]?.last_active_at
    );

    return {
      ...presence,
      last_active_at: lastActiveAt?.toISOString()
    };
  }

  /**
   * 批量查询其他用户的 presence；通过 presence_visibility 上下文过滤 + 模糊化。
   */
  async getUsersPresence(viewerUserId: number, userIds: number[]) {
    const uniqueUserIds = Array.from(
      new Set(userIds.filter(userId => Number.isFinite(Number(userId))))
    ).map(userId => Number(userId));

    if (uniqueUserIds.length === 0) {
      return [];
    }

    const [users, presences, lastActiveEntries, visibilityCtx] =
      await Promise.all([
        // P2-Task1: 单次 ANY($1::bigint[]) 替代 N 次 findById 循环
        UserRepository.findByIds(uniqueUserIds),
        Promise.all(
          uniqueUserIds.map(userId => wsServer.getPresenceSummary(userId))
        ),
        UserDeviceRepository.listLatestActivityByUsers(uniqueUserIds),
        loadPresenceVisibilityContext(viewerUserId, uniqueUserIds)
      ]);
    const userMap = new Map(users.map(user => [Number(user.id), user]));
    const lastActiveMap = new Map(
      lastActiveEntries.map(item => [Number(item.user_id), item.last_active_at])
    );

    return uniqueUserIds.map((userId, index) => {
      const rawLastActiveAt = resolveLastActiveAt(
        userMap.get(userId)?.last_login_at,
        lastActiveMap.get(userId)
      )?.toISOString();
      const filtered = visibilityCtx.evaluate(userId, {
        is_online: presences[index].is_online,
        active_device_count: presences[index].active_device_count,
        last_active_at: rawLastActiveAt
      });
      return {
        user_id: userId,
        is_online: filtered.is_online,
        active_device_count: filtered.active_device_count,
        last_active_at: filtered.last_active_at,
        // 透传服务端观测时刻；客户端按 observed_at 单调性丢弃乱序覆盖。
        observed_at: presences[index].observed_at
      };
    });
  }
}

export default new PresenceService();

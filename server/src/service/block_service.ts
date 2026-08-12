import type { UserBlock } from "@mushroom/shared";
import { BusinessError } from "../handler/business_error";
import BlockRepository from "../repository/block_repository";
import UserRepository from "../repository/user_repository";
import { wsServer } from "../websocket";

class BlockService {
  async hasBlocked(blockerId: number, blockedId: number): Promise<boolean> {
    return BlockRepository.exists(blockerId, blockedId);
  }

  async getBlocks(userId: number): Promise<UserBlock[]> {
    const rows = await BlockRepository.listByBlocker(userId);
    return rows.map(row => ({
      blocked_id: row.blocked_id,
      username: row.username ?? "",
      nickname: row.nickname ?? row.username ?? "",
      avatar_url: row.avatar_url,
      gender: Number(row.gender ?? 0),
      signature: row.signature,
      created_at: row.created_at.toISOString()
    }));
  }

  async blockUser(userId: number, targetUserId: number): Promise<void> {
    if (userId === targetUserId) {
      throw new BusinessError("Cannot block yourself");
    }

    const target = await UserRepository.findById(targetUserId);
    if (!target) {
      throw new BusinessError("User not found");
    }

    await BlockRepository.insert(userId, targetUserId);

    wsServer.dispatchToUser(userId, {
      messageClassify: "block_changed",
      action: "blocked",
      block: {
        blocked_id: targetUserId,
        username: target.username ?? "",
        nickname: target.nickname ?? target.username ?? "",
        avatar_url: target.avatar_url,
        gender: Number(target.gender ?? 0),
        signature: target.signature,
        created_at: new Date().toISOString()
      }
    });
  }

  async unblockUser(userId: number, targetUserId: number): Promise<void> {
    const result = await BlockRepository.delete(userId, targetUserId);
    if (result.rowCount === 0) {
      throw new BusinessError("User is not blocked");
    }

    wsServer.dispatchToUser(userId, {
      messageClassify: "block_changed",
      action: "unblocked",
      block: { blocked_id: targetUserId }
    });
  }
}

export default new BlockService();

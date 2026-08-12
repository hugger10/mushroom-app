import type { UpdateContactRequest } from "@mushroom/shared";
import type { ControllerContext } from "../context";

/**
 * ContactService 负责联系人 / 拉黑列表的本地写 + 后台 sync 触发。
 */
export class ContactService {
  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  async blockUser(targetUserId: number) {
    await this.ctx.api.blockUser({ target_user_id: targetUserId });
    await this.ctx.services.sync.syncNow({ force: true });
    return this.ctx.publishSnapshot();
  }

  async unblockUser(targetUserId: number) {
    await this.ctx.api.unblockUser({ target_user_id: targetUserId });
    await this.ctx.services.sync.syncNow({ force: true });
    return this.ctx.publishSnapshot();
  }

  async updateContact(targetUserId: number, patch: UpdateContactRequest) {
    await this.ctx.api.updateContact(targetUserId, patch);
    await this.ctx.services.sync.syncNow();
    return this.ctx.publishSnapshot();
  }

  async deleteContact(targetUserId: number) {
    await this.ctx.api.deleteContactById(targetUserId);
    await this.ctx.getRepository().removeContacts([targetUserId]);
    await this.ctx.services.sync.syncNow();
    return this.ctx.publishSnapshot();
  }
}

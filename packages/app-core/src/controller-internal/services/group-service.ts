import type { UpdateConversationSettingsRequest } from "@mushroom/shared";
import type { ControllerContext } from "../context";

/**
 * GroupService 负责群成员/资料/公告/设置等管理操作。
 * 所有操作完成后触发后台 syncNow 以拉取服务端权威态。
 */
export class GroupService {
  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  async addGroupMembers(clientConversationId: string, contactIds: number[]) {
    const conversation =
      await this.ctx.services.conversation.requireConversation(
        clientConversationId
      );
    const contacts = await this.ctx.getRepository().listContacts();
    const selectedContacts = contacts.filter(item =>
      contactIds.includes(Number(item.user_id))
    );
    if (selectedContacts.length === 0) {
      throw new Error("No members selected.");
    }

    await this.ctx.api.addConversationMembers({
      conversationId: conversation.server_conversation_id,
      members: selectedContacts.map(contact => ({
        user_id: contact.user_id,
        nickname: contact.nickname,
        role: 0
      }))
    });
    await this.ctx.services.sync.syncNow();
    return this.ctx.publishSnapshot();
  }

  async removeGroupMember(clientConversationId: string, userId: number) {
    const conversation =
      await this.ctx.services.conversation.requireConversation(
        clientConversationId
      );
    await this.ctx.api.removeConversationMember({
      conversationId: conversation.server_conversation_id,
      userId
    });
    await this.ctx.services.sync.syncNow();
    return this.ctx.publishSnapshot();
  }

  async updateGroupMemberRole(
    clientConversationId: string,
    userId: number,
    role: number
  ) {
    const conversation =
      await this.ctx.services.conversation.requireConversation(
        clientConversationId
      );
    await this.ctx.api.updateConversationMemberRole({
      conversationId: conversation.server_conversation_id,
      userId,
      role
    });
    await this.ctx.services.sync.syncNow();
    return this.ctx.publishSnapshot();
  }

  async updateGroupMemberMute(
    clientConversationId: string,
    userId: number,
    muteMinutes?: number | null
  ) {
    const conversation =
      await this.ctx.services.conversation.requireConversation(
        clientConversationId
      );
    await this.ctx.api.updateConversationMemberMute({
      conversationId: conversation.server_conversation_id,
      userId,
      mute_minutes: muteMinutes ?? null
    });
    await this.ctx.services.sync.syncNow();
    return this.ctx.publishSnapshot();
  }

  async transferGroupOwner(clientConversationId: string, userId: number) {
    const conversation =
      await this.ctx.services.conversation.requireConversation(
        clientConversationId
      );
    await this.ctx.api.transferConversationOwner({
      conversationId: conversation.server_conversation_id,
      userId
    });
    await this.ctx.services.sync.syncNow();
    return this.ctx.publishSnapshot();
  }

  async updateGroupProfile(
    clientConversationId: string,
    patch: {
      name: string;
      description?: string;
      avatar_url?: string;
    }
  ) {
    const conversation =
      await this.ctx.services.conversation.requireConversation(
        clientConversationId
      );
    await this.ctx.api.updateConversationProfile({
      conversationId: conversation.server_conversation_id,
      name: patch.name,
      description: patch.description,
      avatar_url: patch.avatar_url
    });
    await this.ctx.services.sync.syncNow();
    return this.ctx.publishSnapshot();
  }

  async updateGroupAnnouncement(
    clientConversationId: string,
    announcement?: string
  ) {
    const conversation =
      await this.ctx.services.conversation.requireConversation(
        clientConversationId
      );
    await this.ctx.api.updateConversationAnnouncement({
      conversationId: conversation.server_conversation_id,
      announcement
    });
    await this.ctx.services.sync.syncNow();
    return this.ctx.publishSnapshot();
  }

  async updateGroupSettings(
    clientConversationId: string,
    patch: Omit<UpdateConversationSettingsRequest, "conversationId">
  ) {
    const conversation =
      await this.ctx.services.conversation.requireConversation(
        clientConversationId
      );
    await this.ctx.api.updateConversationSettings({
      conversationId: conversation.server_conversation_id,
      ...patch
    });
    await this.ctx.services.sync.syncNow();
    return this.ctx.publishSnapshot();
  }
}

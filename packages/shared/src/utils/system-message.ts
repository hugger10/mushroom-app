import type {
  SystemMessageActor,
  SystemMessageContent,
  SystemMessageKind
} from "../types/models";

/**
 * 翻译函数签名，兼容 `i18next.t` 与 react-i18next 的 `t`。
 * 当未传入时，`getSystemMessageText` 会回退到内置中文/英文硬编码文案，
 * 用于服务端落库 `text` 字段，保证旧客户端/纯后端日志可读。
 */
export type SystemMessageTranslate = (
  key: string,
  options?: Record<string, unknown>
) => string;

const defaultSystemTexts: Record<SystemMessageKind, string> = {
  conversation_created: "你被邀请加入群聊",
  message_recalled: "消息已撤回",
  group_member_joined: "新成员加入群聊",
  group_member_left: "成员离开群聊",
  group_member_removed: "成员已被移出群聊",
  group_role_updated: "成员角色已更新",
  group_owner_transferred: "群主已转让",
  group_announcement_updated: "群公告已更新",
  group_mute_all_updated: "全员禁言状态已更新",
  group_member_muted: "成员已被禁言",
  group_member_unmuted: "成员已被解除禁言",
  group_name_updated: "群名称已更新",
  group_settings_updated: "群设置已更新"
};

function fallbackActorName(actor?: SystemMessageActor) {
  if (!actor) return "成员";
  return actor.nickname || `用户 ${actor.user_id}`;
}

function getActorName(
  actor?: SystemMessageActor,
  translate?: SystemMessageTranslate,
  fallbackKey: string = "systemMessage.defaultActor"
) {
  if (!actor) {
    return translate ? translate(fallbackKey) : fallbackActorName(actor);
  }
  if (actor.nickname) return actor.nickname;
  if (translate) {
    // 复用 contacts.profileUnknownUser 的 "用户 {{id}}" 文案
    return translate("contacts.profileUnknownUser", { id: actor.user_id });
  }
  return `用户 ${actor.user_id}`;
}

export function getSystemMessageText(
  content: SystemMessageContent,
  translate?: SystemMessageTranslate
): string {
  // 未提供翻译函数 —— 保留旧行为（中文/英文硬编码），主要用于服务端 fallback。
  if (!translate) {
    switch (content.kind) {
      case "conversation_created":
        return content.actor
          ? `${fallbackActorName(content.actor)} 邀请你加入群聊`
          : content.text || defaultSystemTexts[content.kind];
      case "group_member_joined":
        return `${fallbackActorName(content.actor)} 加入了群聊`;
      case "group_member_left":
        return `${fallbackActorName(content.actor)} 离开了群聊`;
      case "group_member_removed":
        return `${fallbackActorName(content.target)} 被${fallbackActorName(content.actor)}移出群聊`;
      case "group_role_updated":
        return `${fallbackActorName(content.target)} 的角色已更新为 ${content.role || "成员"}`;
      case "group_owner_transferred":
        return `${fallbackActorName(content.actor)} 将群主转让给了 ${fallbackActorName(content.target)}`;
      case "group_announcement_updated":
        return `${fallbackActorName(content.actor)} 更新了群公告`;
      case "group_mute_all_updated":
        return `${fallbackActorName(content.actor)}${content.enabled ? "开启" : "关闭"}了全员禁言`;
      case "group_member_muted":
        return `${fallbackActorName(content.actor)} 已禁言 ${fallbackActorName(content.target)}`;
      case "group_member_unmuted":
        return `${fallbackActorName(content.actor)} 已解除 ${fallbackActorName(content.target)} 的禁言`;
      case "group_name_updated":
        return `${fallbackActorName(content.actor)} 将群名称修改为“${content.newName}”`;
      case "group_settings_updated":
        return content.text || defaultSystemTexts[content.kind];
      default:
        return content.text || defaultSystemTexts[content.kind];
    }
  }

  const actorName = getActorName(content.actor, translate);
  const targetName = getActorName(
    content.target,
    translate,
    "systemMessage.defaultTarget"
  );
  const roleName =
    (typeof content.role === "string" && content.role.trim()) ||
    translate("systemMessage.defaultRole");

  switch (content.kind) {
    case "conversation_created":
      return content.actor
        ? translate("systemMessage.conversationCreated", { actor: actorName })
        : translate("systemMessage.conversationCreatedFallback");
    case "message_recalled":
      return translate("systemMessage.messageRecalled");
    case "group_member_joined":
      return translate("systemMessage.groupMemberJoined", { actor: actorName });
    case "group_member_left":
      return translate("systemMessage.groupMemberLeft", { actor: actorName });
    case "group_member_removed":
      return translate("systemMessage.groupMemberRemoved", {
        actor: actorName,
        target: targetName
      });
    case "group_role_updated":
      return translate("systemMessage.groupRoleUpdated", {
        target: targetName,
        role: roleName
      });
    case "group_owner_transferred":
      return translate("systemMessage.groupOwnerTransferred", {
        actor: actorName,
        target: targetName
      });
    case "group_announcement_updated":
      return translate("systemMessage.groupAnnouncementUpdated", {
        actor: actorName
      });
    case "group_mute_all_updated":
      return translate(
        content.enabled
          ? "systemMessage.groupMuteAllEnabled"
          : "systemMessage.groupMuteAllDisabled",
        { actor: actorName }
      );
    case "group_member_muted":
      return translate("systemMessage.groupMemberMuted", {
        actor: actorName,
        target: targetName
      });
    case "group_member_unmuted":
      return translate("systemMessage.groupMemberUnmuted", {
        actor: actorName,
        target: targetName
      });
    case "group_name_updated":
      return translate("systemMessage.groupNameUpdated", {
        actor: actorName,
        newName: content.newName
      });
    case "group_settings_updated":
      return content.text || translate("systemMessage.groupSettingsUpdated");
    default:
      return content.text || defaultSystemTexts[content.kind];
  }
}

export function createSystemMessageContent(
  kind: SystemMessageKind,
  overrides?: Partial<SystemMessageContent>
): SystemMessageContent {
  const base: SystemMessageContent = {
    type: 0,
    kind,
    text: defaultSystemTexts[kind]
  };

  return {
    ...base,
    ...overrides,
    text:
      overrides?.text ??
      getSystemMessageText({
        ...base,
        ...overrides
      })
  };
}

export function isSystemMessageContent(
  value: unknown
): value is SystemMessageContent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return candidate.type === 0 && typeof candidate.text === "string";
}

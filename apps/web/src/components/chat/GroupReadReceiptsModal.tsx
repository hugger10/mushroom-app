import { List, Modal, Tabs } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ConversationMember, Message } from "@mushroom/shared";
import type { Conversation } from "../../types/chat";
import type { LoginUser } from "../../types/user";
import { UserAvatar } from "../avatars/UserAvatar";
import { getUserDisplayName, type ContactsLookup } from "../../utils/display";

/**
 * GroupReadReceiptsModal —— 群消息已读详情面板（Web/Desktop）。
 *
 * 数据来源：`groupReadState` 是 main 进程内存维护的
 * `(reader_user_id → last_read_seq)` 高水位 map。打开时取快照即可；
 * 增量推送会通过父组件重渲染下发。隐私场景由 server 在 fanout 时过滤。
 *
 * 显示名优先级统一走 `getUserDisplayName`：
 *   备注名(remark_name) → 昵称(nickname) → 用户名(username)
 *   → 群成员快照昵称 → "用户 {id}"。
 */
export interface GroupReadReceiptsModalProps {
  open: boolean;
  message: Message | null;
  conversation: Conversation | null;
  groupReadState: Record<number, number> | null;
  loginUser: LoginUser | null | undefined;
  contacts?: ContactsLookup;
  onClose: () => void;
}

function resolveMemberAvatar(
  member: ConversationMember,
  loginUser: LoginUser | null | undefined
): string | null {
  if (loginUser && Number(loginUser.userId) === Number(member.user_id)) {
    return loginUser.avatar ?? null;
  }
  return member.avatar_url ?? member.avatar ?? null;
}

export function GroupReadReceiptsModal({
  open,
  message,
  conversation,
  groupReadState,
  loginUser,
  contacts,
  onClose
}: GroupReadReceiptsModalProps) {
  const { t } = useTranslation();
  const [activeKey, setActiveKey] = useState<"read" | "unread">("read");

  const { readMembers, unreadMembers } = useMemo(() => {
    const empty = {
      readMembers: [] as ConversationMember[],
      unreadMembers: [] as ConversationMember[]
    };
    if (!message || !conversation) return empty;
    const seq = Number(message.sequence || 0);
    if (seq <= 0) return empty;
    const senderId = Number(message.sender_id || 0);
    const members = (conversation.members ?? []).filter(
      m => Number(m.user_id) !== senderId
    );
    const map = groupReadState ?? {};
    const read: ConversationMember[] = [];
    const unread: ConversationMember[] = [];
    for (const m of members) {
      const lastRead = Number(map[Number(m.user_id)] ?? 0);
      if (lastRead >= seq) read.push(m);
      else unread.push(m);
    }
    return { readMembers: read, unreadMembers: unread };
  }, [message, conversation, groupReadState]);

  const activeList = activeKey === "read" ? readMembers : unreadMembers;
  // activeList 仅用于声明依赖，实际渲染通过 Tabs.children 完成。
  void activeList;

  const renderMember = (member: ConversationMember) => {
    const userId = Number(member.user_id);
    const name = getUserDisplayName({
      userId,
      loginUser,
      conversation,
      contacts,
      fallbackNickname: member.nickname,
      defaultLabel: t("display.unknownUser", { id: userId })
    });
    const avatar = resolveMemberAvatar(member, loginUser);
    return (
      <List.Item key={String(member.user_id)}>
        <List.Item.Meta
          avatar={<UserAvatar name={name} src={avatar} size={40} />}
          title={name}
        />
      </List.Item>
    );
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      title={t("chat.readReceipts", "消息已读")}
      width={420}
    >
      <Tabs
        activeKey={activeKey}
        onChange={k => setActiveKey(k as "read" | "unread")}
        items={[
          {
            key: "read",
            label: t("chat.readN", "已读 {{n}}", { n: readMembers.length }),
            children: (
              <List
                dataSource={readMembers}
                renderItem={renderMember}
                locale={{
                  emptyText: t("chat.noReadMembers", "暂无成员已读")
                }}
                style={{ maxHeight: 360, overflow: "auto" }}
              />
            )
          },
          {
            key: "unread",
            label: t("chat.unreadN", "未读 {{n}}", { n: unreadMembers.length }),
            children: (
              <List
                dataSource={unreadMembers}
                renderItem={renderMember}
                locale={{
                  emptyText: t("chat.allRead", "全部成员已读")
                }}
                style={{ maxHeight: 360, overflow: "auto" }}
              />
            )
          }
        ]}
      />
    </Modal>
  );
}

export default GroupReadReceiptsModal;

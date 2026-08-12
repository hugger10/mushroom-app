import { Avatar, List, Modal } from "antd";
import { useTranslation } from "react-i18next";
import type { Conversation } from "../../types/chat";
import type { LoginUser } from "../../types/user";
import type { MessageMention } from "@mushroom/shared";

interface MentionPickerModalProps {
  open: boolean;
  activeConversation: Conversation;
  loginUser: LoginUser;
  canMentionAll: boolean;
  onCancel: () => void;
  onPickMention: (mention: MessageMention) => void;
  onPickMentionAll: () => void;
}

export function MentionPickerModal({
  open,
  activeConversation,
  loginUser,
  canMentionAll,
  onCancel,
  onPickMention,
  onPickMentionAll
}: MentionPickerModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      className="im-modal"
      title={t("chatMedia.selectMembersToMention")}
      open={open}
      onCancel={onCancel}
      footer={null}
    >
      <List
        dataSource={[
          ...(canMentionAll ? [{ kind: "all" as const }] : []),
          ...(activeConversation.members ?? [])
            .filter(member => member.user_id !== loginUser.userId)
            .map(member => ({ kind: "member" as const, member }))
        ]}
        renderItem={item =>
          item.kind === "all" ? (
            <List.Item style={{ cursor: "pointer" }} onClick={onPickMentionAll}>
              <List.Item.Meta
                avatar={<Avatar>@</Avatar>}
                title="@all"
                description={t("chatMedia.notifyAllMembers")}
              />
            </List.Item>
          ) : (
            <List.Item
              style={{ cursor: "pointer" }}
              onClick={() =>
                onPickMention({
                  user_id: item.member.user_id,
                  nickname: item.member.nickname
                })
              }
            >
              <List.Item.Meta
                avatar={
                  <Avatar src={item.member.avatar_url}>
                    {item.member.nickname?.[0]}
                  </Avatar>
                }
                title={item.member.nickname}
                description={t("chatMedia.userID", { id: item.member.user_id })}
              />
            </List.Item>
          )
        }
      />
    </Modal>
  );
}

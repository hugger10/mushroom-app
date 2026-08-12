import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Modal } from "antd";
import { LeftOutlined } from "@ant-design/icons";
import type { Conversation } from "../../types/chat";
import type { LoginUser } from "../../types/user";
import { UserAvatar } from "../avatars/UserAvatar";
import { getUserDisplayName } from "../../utils/display";
import { useTranslation } from "react-i18next";

/**
 * Group-call member picker. Mirrors WhatsApp/WeChat: before starting an
 * audio/video call from a group chat the user chooses which members to
 * invite, instead of paging the entire (potentially very large) group.
 *
 * The local user's own row is always checked and locked (you cannot exclude
 * yourself from a call you start); every other member starts unchecked.
 * A back arrow on the left closes the modal and a "Start Call" action sits on
 * the top right.
 */
export function CallMemberPickerModal(props: {
  visible: boolean;
  mediaType: 1 | 2;
  conversation: Conversation | null;
  loginUser: LoginUser;
  onClose: () => void;
  onStartCall: (targetUserIds: number[]) => void;
}) {
  const { t } = useTranslation();
  const { visible, conversation, loginUser } = props;
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Reset the selection every time the picker opens so a previous session's
  // picks never leak into a new one.
  useEffect(() => {
    if (visible) {
      setSelectedIds(new Set());
    }
  }, [visible]);

  const members = useMemo(() => conversation?.members ?? [], [conversation]);
  const selfMember = useMemo(
    () => members.find(member => member.user_id === loginUser.userId),
    [members, loginUser.userId]
  );
  const sortedMembers = useMemo(() => {
    const others = members
      .filter(member => member.user_id !== loginUser.userId)
      .sort((left, right) =>
        left.nickname.localeCompare(right.nickname, "zh-Hans")
      );
    return [...(selfMember ? [selfMember] : []), ...others];
  }, [members, loginUser.userId, selfMember]);

  const selectedCount = selectedIds.size;
  const isVideo = props.mediaType === 2;

  function toggleMember(userId: number) {
    if (userId === loginUser.userId) {
      return;
    }
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  return (
    <Modal
      open={visible}
      onCancel={props.onClose}
      width={380}
      title={null}
      closeIcon={false}
      footer={null}
      maskClosable
      data-testid="call-member-picker-modal"
    >
      <div className="im-call-member-picker">
        <div className="im-call-member-picker-header">
          <button
            type="button"
            className="im-call-member-picker-back"
            onClick={props.onClose}
            aria-label={t("common.close")}
            data-testid="call-member-picker-close"
          >
            <LeftOutlined />
          </button>
          <div className="im-call-member-picker-header-title">
            {isVideo
              ? t("ui.callOverlay.selectVideoMembers")
              : t("ui.callOverlay.selectVoiceMembers")}
          </div>
          <Button
            type="primary"
            size="small"
            disabled={selectedCount === 0}
            onClick={() => {
              props.onClose();
              props.onStartCall(Array.from(selectedIds));
            }}
            data-testid="call-member-picker-start"
          >
            {t("ui.callOverlay.startCall")}
          </Button>
        </div>

        <div className="im-call-member-picker-list">
          {sortedMembers.map(member => {
            const isSelf = member.user_id === loginUser.userId;
            const checked = isSelf || selectedIds.has(member.user_id);
            const displayName = getUserDisplayName({
              userId: member.user_id,
              loginUser,
              conversation,
              fallbackNickname: member.nickname,
              defaultLabel: t("display.unknownUser", { id: member.user_id })
            });
            return (
              <div
                key={member.user_id}
                className={`im-call-member-picker-row${
                  isSelf ? " im-call-member-picker-row-self" : ""
                }`}
                onClick={() => toggleMember(member.user_id)}
                role="button"
                tabIndex={0}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    toggleMember(member.user_id);
                  }
                }}
                data-testid={`call-member-picker-${member.user_id}`}
              >
                <UserAvatar
                  src={member.avatar_url}
                  name={displayName}
                  size={32}
                />
                <div className="im-call-member-picker-row-copy">
                  <div className="im-call-member-picker-row-name">
                    {displayName}
                    {isSelf ? t("groupInfo.meSuffix") : ""}
                  </div>
                  {isSelf ? (
                    <div className="im-call-member-picker-row-hint">
                      呼叫发起人
                    </div>
                  ) : null}
                </div>
                <Checkbox
                  checked={checked}
                  disabled={isSelf}
                  onClick={event => event.stopPropagation()}
                  onKeyDown={event => event.stopPropagation()}
                  onChange={() => toggleMember(member.user_id)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

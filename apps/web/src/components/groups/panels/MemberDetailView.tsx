import { Button, Empty, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { ConversationMember } from "../../../types/chat";
import { string2DateTime } from "../../../utils/date";
import { UserAvatar } from "../../avatars/UserAvatar";

const { Text } = Typography;

function getRoleText(role: number, t: (key: string) => string) {
  switch (role) {
    case 2:
      return t("groupInfo.owner");
    case 1:
      return t("groupInfo.admin");
    default:
      return t("groupInfo.member");
  }
}

interface MemberDetailViewProps {
  selectedMember: ConversationMember | null;
  selectedMemberIsSelf: boolean;
  selectedMemberMuted: boolean;
  canTransferSelectedOwner: boolean;
  canToggleSelectedRole: boolean;
  canToggleSelectedMute: boolean;
  canManageSelectedMember: boolean;
  loading: boolean;
  onTransferOwner: (member: ConversationMember) => void;
  onToggleRole: (member: ConversationMember) => void;
  onUpdateMemberMute: (
    member: ConversationMember,
    muteMinutes?: number | null
  ) => void;
  onRemoveMember: (member: ConversationMember) => void;
}

export default function MemberDetailView({
  selectedMember,
  selectedMemberIsSelf,
  selectedMemberMuted,
  canTransferSelectedOwner,
  canToggleSelectedRole,
  canToggleSelectedMute,
  canManageSelectedMember,
  loading,
  onTransferOwner,
  onToggleRole,
  onUpdateMemberMute,
  onRemoveMember
}: MemberDetailViewProps) {
  const { t } = useTranslation();
  if (!selectedMember) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={t("groupInfo.selectMemberHint")}
      />
    );
  }

  const hasAnyAction =
    canTransferSelectedOwner ||
    canToggleSelectedRole ||
    canToggleSelectedMute ||
    canManageSelectedMember;

  return (
    <Space direction="vertical" size={14} style={{ width: "100%" }}>
      <Space className="im-member-detail-hero">
        <UserAvatar
          src={selectedMember.avatar_url}
          name={selectedMember.nickname}
          size={48}
        />
        <div className="im-member-detail-heading">
          <div className="im-member-detail-name">
            {selectedMember.nickname || t("groupInfo.unnamedMember")}
          </div>
          <div className="im-member-detail-tags">
            <Tag>{getRoleText(selectedMember.role, t)}</Tag>
            {selectedMemberIsSelf ? (
              <Tag color="blue">{t("groupInfo.you")}</Tag>
            ) : null}
            {selectedMemberMuted ? (
              <Tag color="volcano">{t("groupInfo.muted")}</Tag>
            ) : null}
          </div>
        </div>
      </Space>
      <div className="im-member-detail-field">
        <Text className="im-group-helper">{t("groupInfo.joinedAt")}</Text>
        <div className="im-member-detail-value">
          {string2DateTime(selectedMember.joined_at)}
        </div>
      </div>
      <div className="im-member-detail-field">
        <Text className="im-group-helper">{t("groupInfo.muteStatus")}</Text>
        <div className="im-member-detail-value">
          {selectedMemberMuted && selectedMember.muted_until
            ? t("groupInfo.mutedUntil", {
                time: string2DateTime(selectedMember.muted_until)
              })
            : t("groupInfo.notMuted")}
        </div>
      </div>
      {hasAnyAction ? (
        <div className="im-member-detail-actions">
          {canTransferSelectedOwner ? (
            <Button
              onClick={() => onTransferOwner(selectedMember)}
              disabled={loading}
            >
              {t("groupInfo.transferOwnership")}
            </Button>
          ) : null}
          {canToggleSelectedRole ? (
            <Button
              onClick={() => onToggleRole(selectedMember)}
              disabled={loading}
            >
              {selectedMember.role === 1
                ? t("groupInfo.removeAdmin")
                : t("groupInfo.makeAdmin")}
            </Button>
          ) : null}
          {canToggleSelectedMute ? (
            <>
              <Button
                onClick={() => onUpdateMemberMute(selectedMember, 10)}
                disabled={loading}
              >
                {t("groupInfo.mute10min")}
              </Button>
              <Button
                onClick={() => onUpdateMemberMute(selectedMember, 60)}
                disabled={loading}
              >
                {t("groupInfo.mute1hour")}
              </Button>
              <Button
                onClick={() => onUpdateMemberMute(selectedMember, 24 * 60)}
                disabled={loading}
              >
                {t("groupInfo.mute1day")}
              </Button>
              {selectedMemberMuted ? (
                <Button
                  onClick={() => onUpdateMemberMute(selectedMember, null)}
                  disabled={loading}
                >
                  {t("groupInfo.unmute")}
                </Button>
              ) : null}
            </>
          ) : null}
          {canManageSelectedMember ? (
            <Button
              danger
              onClick={() => onRemoveMember(selectedMember)}
              disabled={loading}
            >
              {t("groupInfo.removeFromGroup")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Space>
  );
}

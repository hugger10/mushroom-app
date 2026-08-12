import type { UserSearchResult } from "@mushroom/shared";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import { Button, Empty, Input } from "antd";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import type { ConversationMember } from "../../../types/chat";
import type { ContactListItem } from "../../../types/user";
import { UserAvatar } from "../../avatars/UserAvatar";
import { getUserDisplayName } from "../../../utils/display";
import MemberDetailView from "./MemberDetailView";
import MemberInviteView from "./MemberInviteView";

type MemberPanelMode = "detail" | "invite";

interface GroupMembersPanelProps {
  members: ConversationMember[];
  filteredMembers: ConversationMember[];
  memberKeyword: string;
  onMemberKeywordChange: (value: string) => void;
  selectedMember: ConversationMember | null;
  onSelectMember: (member: ConversationMember) => void;
  memberPanelMode: MemberPanelMode;
  onMemberPanelModeChange: (mode: MemberPanelMode) => void;
  loginUserId: number;
  ownerCount: number;
  adminCount: number;
  totalSelectedCount: number;
  /**
   * Full local contacts cache. Used to honor `remark_name → nickname → username`
   * priority when rendering member display names. Optional for backward
   * compatibility; when omitted, falls back to `member.nickname`.
   */
  contacts?: ContactListItem[];

  isMemberMuted: (member: ConversationMember) => boolean;

  // detail view
  selectedMemberIsSelf: boolean;
  selectedMemberMuted: boolean;
  canTransferSelectedOwner: boolean;
  canToggleSelectedRole: boolean;
  canToggleSelectedMute: boolean;
  canManageSelectedMember: boolean;
  onTransferOwner: (member: ConversationMember) => void;
  onToggleRole: (member: ConversationMember) => void;
  onUpdateMemberMute: (
    member: ConversationMember,
    muteMinutes?: number | null
  ) => void;
  onRemoveMember: (member: ConversationMember) => void;

  // invite view
  canInviteByPermission: boolean;
  canInviteFriends: boolean;
  friendKeyword: string;
  onFriendKeywordChange: (value: string) => void;
  availableContacts: ContactListItem[];
  selectedFriendIds: number[];
  selectedInviteContacts: ContactListItem[];
  strangerSearchResults: UserSearchResult[];
  selectedStrangers: UserSearchResult[];
  searching: boolean;
  onToggleFriend: (userId: number) => void;
  onToggleStranger: (user: UserSearchResult) => void;
  onAddMembers: () => void;

  loading: boolean;
}

export default function GroupMembersPanel(props: GroupMembersPanelProps) {
  const {
    members,
    filteredMembers,
    memberKeyword,
    onMemberKeywordChange,
    selectedMember,
    onSelectMember,
    memberPanelMode,
    onMemberPanelModeChange,
    loginUserId,
    ownerCount,
    adminCount,
    totalSelectedCount,
    contacts,
    isMemberMuted,
    loading
  } = props;

  const { t } = useTranslation();

  const contactsMap = useMemo(
    () => new Map((contacts ?? []).map(item => [Number(item.user_id), item])),
    [contacts]
  );

  const resolveMemberName = (member: ConversationMember) =>
    getUserDisplayName({
      userId: member.user_id,
      contacts: contactsMap,
      fallbackNickname: member.nickname,
      defaultLabel: t("groupInfo.unnamedMember")
    });

  return (
    <div className="im-group-member-workspace">
      <div className="im-group-member-toolbar">
        <div className="im-group-member-toolbar-copy">
          <div className="im-group-member-toolbar-title">
            {t("groupInfo.memberListLabel")}
          </div>
          <div className="im-group-member-toolbar-meta">
            <span>
              {t("groupInfo.membersCount", { count: members.length })}
            </span>
            <span>{t("groupInfo.ownerCount", { count: ownerCount })}</span>
            <span>{t("groupInfo.adminCount", { count: adminCount })}</span>
            <span>
              {t("groupInfo.selectedInviteCount", {
                count: totalSelectedCount
              })}
            </span>
          </div>
        </div>
        <div className="im-group-member-toolbar-actions">
          <Input
            placeholder={t("groupInfo.searchMembersPlaceholder")}
            value={memberKeyword}
            onChange={event => onMemberKeywordChange(event.target.value)}
            maxLength={SEARCH_KEYWORD_MAX_LENGTH}
          />
        </div>
      </div>

      <div className="im-group-member-workspace-layout">
        <div className="im-group-roster-list">
          {members.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("groupInfo.noMembers")}
            />
          ) : filteredMembers.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("groupInfo.noMatchingMembers")}
              style={{ padding: 24 }}
            />
          ) : (
            filteredMembers.map(member => {
              const muted = isMemberMuted(member);
              const isSelf = member.user_id === loginUserId;
              const displayName = resolveMemberName(member);

              return (
                <button
                  key={member.user_id}
                  type="button"
                  className={`im-group-roster-item ${
                    selectedMember?.user_id === member.user_id
                      ? "im-group-roster-item-active"
                      : ""
                  }`}
                  onClick={() => {
                    onSelectMember(member);
                    onMemberPanelModeChange("detail");
                  }}
                >
                  <UserAvatar src={member.avatar_url} name={displayName} />
                  <span className="im-group-roster-copy">
                    <span className="im-group-roster-name-row">
                      <span className="im-group-roster-name">
                        {displayName}
                      </span>
                      {isSelf ? (
                        <span className="im-group-roster-pill im-group-roster-pill-self">
                          {t("groupInfo.you")}
                        </span>
                      ) : null}
                      {member.role === 2 ? (
                        <span className="im-group-roster-pill im-group-roster-pill-owner">
                          {t("groupInfo.owner")}
                        </span>
                      ) : member.role === 1 ? (
                        <span className="im-group-roster-pill">
                          {t("groupInfo.admin")}
                        </span>
                      ) : null}
                      {muted ? (
                        <span className="im-group-roster-pill im-group-roster-pill-muted">
                          {t("groupInfo.muted")}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="im-member-detail-card im-group-member-sidecard">
          <div className="im-group-member-panel-switch">
            <Button
              size="small"
              type={memberPanelMode === "detail" ? "primary" : "default"}
              className={
                memberPanelMode === "detail"
                  ? "im-group-panel-switch-button-active"
                  : "im-group-panel-switch-button"
              }
              onClick={() => onMemberPanelModeChange("detail")}
            >
              {t("groupInfo.memberDetail")}
            </Button>
            <Button
              size="small"
              type={memberPanelMode === "invite" ? "primary" : "default"}
              className={
                memberPanelMode === "invite"
                  ? "im-group-panel-switch-button-active"
                  : "im-group-panel-switch-button"
              }
              onClick={() => onMemberPanelModeChange("invite")}
            >
              {t("groupInfo.inviteTitle")}
            </Button>
          </div>

          {memberPanelMode === "invite" ? (
            <MemberInviteView
              loading={loading}
              canInviteByPermission={props.canInviteByPermission}
              canInviteFriends={props.canInviteFriends}
              friendKeyword={props.friendKeyword}
              onFriendKeywordChange={props.onFriendKeywordChange}
              selectedInviteContacts={props.selectedInviteContacts}
              selectedStrangers={props.selectedStrangers}
              availableContacts={props.availableContacts}
              strangerSearchResults={props.strangerSearchResults}
              selectedFriendIds={props.selectedFriendIds}
              searching={props.searching}
              onToggleFriend={props.onToggleFriend}
              onToggleStranger={props.onToggleStranger}
              onAddMembers={props.onAddMembers}
              totalSelectedCount={totalSelectedCount}
            />
          ) : (
            <MemberDetailView
              selectedMember={selectedMember}
              selectedMemberIsSelf={props.selectedMemberIsSelf}
              selectedMemberMuted={props.selectedMemberMuted}
              canTransferSelectedOwner={props.canTransferSelectedOwner}
              canToggleSelectedRole={props.canToggleSelectedRole}
              canToggleSelectedMute={props.canToggleSelectedMute}
              canManageSelectedMember={props.canManageSelectedMember}
              loading={loading}
              onTransferOwner={props.onTransferOwner}
              onToggleRole={props.onToggleRole}
              onUpdateMemberMute={props.onUpdateMemberMute}
              onRemoveMember={props.onRemoveMember}
            />
          )}
        </div>
      </div>
    </div>
  );
}

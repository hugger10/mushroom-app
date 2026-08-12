import type { UserSearchResult } from "@mushroom/shared";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import { Button, Input } from "antd";
import { useTranslation } from "react-i18next";
import { CheckCircleFilled } from "@ant-design/icons";
import type { ContactListItem } from "../../../types/user";
import { UserAvatar } from "../../avatars/UserAvatar";

interface MemberInviteViewProps {
  loading: boolean;
  canInviteByPermission: boolean;
  canInviteFriends: boolean;
  friendKeyword: string;
  onFriendKeywordChange: (value: string) => void;
  selectedInviteContacts: ContactListItem[];
  selectedStrangers: UserSearchResult[];
  availableContacts: ContactListItem[];
  strangerSearchResults: UserSearchResult[];
  selectedFriendIds: number[];
  searching: boolean;
  onToggleFriend: (userId: number) => void;
  onToggleStranger: (user: UserSearchResult) => void;
  onAddMembers: () => void;
  totalSelectedCount: number;
}

export default function MemberInviteView({
  loading,
  canInviteByPermission,
  canInviteFriends,
  friendKeyword,
  onFriendKeywordChange,
  selectedInviteContacts,
  selectedStrangers,
  availableContacts,
  strangerSearchResults,
  selectedFriendIds,
  searching,
  onToggleFriend,
  onToggleStranger,
  onAddMembers,
  totalSelectedCount
}: MemberInviteViewProps) {
  const { t } = useTranslation();
  const hasFriends = availableContacts.length > 0;
  const hasStrangers = strangerSearchResults.length > 0;
  const keywordTrimmed = friendKeyword.trim();

  return (
    <div className="im-group-invite-panel">
      <Input
        placeholder={t("groupInfo.inviteSearchPlaceholder")}
        value={friendKeyword}
        onChange={event => onFriendKeywordChange(event.target.value)}
        disabled={!canInviteByPermission || loading}
        allowClear
        maxLength={SEARCH_KEYWORD_MAX_LENGTH}
      />
      {totalSelectedCount > 0 ? (
        <div className="im-group-invite-chip-list">
          {selectedInviteContacts.map(friend => (
            <button
              key={`selected-friend:${friend.user_id}`}
              type="button"
              className="im-group-invite-chip"
              onClick={() => onToggleFriend(friend.user_id)}
            >
              <UserAvatar
                src={friend.avatar_url}
                name={friend.nickname}
                size={24}
              />
              <span className="im-group-invite-chip-name">
                {friend.nickname}
              </span>
            </button>
          ))}
          {selectedStrangers.map(stranger => (
            <button
              key={`selected-stranger:${stranger.user_id}`}
              type="button"
              className="im-group-invite-chip"
              onClick={() => onToggleStranger(stranger)}
            >
              <UserAvatar
                src={stranger.avatar_url}
                name={stranger.nickname}
                size={24}
              />
              <span className="im-group-invite-chip-name">
                {stranger.nickname}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="im-group-invite-list">
        {!canInviteByPermission ? (
          <div className="im-group-empty-inline">
            {t("groupInfo.inviteNotAllowed")}
          </div>
        ) : !hasFriends && !hasStrangers ? (
          searching ? (
            <div className="im-group-empty-inline">
              {t("groupInfo.searching")}
            </div>
          ) : (
            <div className="im-group-empty-inline">
              {keywordTrimmed
                ? t("groupInfo.noMatchingUsers")
                : t("groupInfo.allFriendsInGroup")}
            </div>
          )
        ) : (
          <>
            {hasFriends ? (
              <>
                <div className="im-group-invite-group-title">
                  {t("groupInfo.friends")}
                </div>
                {availableContacts.map(friend => {
                  const isSelected = selectedFriendIds.includes(friend.user_id);
                  return (
                    <button
                      key={`friend:${friend.user_id}`}
                      type="button"
                      className={`im-group-selectable-row ${
                        isSelected ? "im-group-selectable-row-active" : ""
                      }`}
                      onClick={() => onToggleFriend(friend.user_id)}
                    >
                      <UserAvatar
                        src={friend.avatar_url}
                        name={friend.nickname}
                      />
                      <span className="im-group-selectable-copy">
                        <span className="im-group-selectable-name">
                          {friend.nickname}
                        </span>
                        <span className="im-group-selectable-subtitle">
                          @{friend.username}
                        </span>
                      </span>
                      <CheckCircleFilled className="im-group-selectable-check" />
                    </button>
                  );
                })}
              </>
            ) : null}
            {hasStrangers ? (
              <>
                <div className="im-group-invite-group-title">
                  {t("groupInfo.strangers")}
                  {searching ? t("groupInfo.searching") : ""}
                </div>
                {strangerSearchResults.map(user => {
                  const isSelected = selectedStrangers.some(
                    item => item.user_id === user.user_id
                  );
                  return (
                    <button
                      key={`stranger:${user.user_id}`}
                      type="button"
                      className={`im-group-selectable-row ${
                        isSelected ? "im-group-selectable-row-active" : ""
                      }`}
                      onClick={() => onToggleStranger(user)}
                    >
                      <UserAvatar src={user.avatar_url} name={user.nickname} />
                      <span className="im-group-selectable-copy">
                        <span className="im-group-selectable-name">
                          {user.nickname}
                          <span className="im-group-roster-pill im-group-roster-pill-stranger">
                            {t("groupInfo.strangers")}
                          </span>
                        </span>
                        <span className="im-group-selectable-subtitle">
                          @{user.username}
                        </span>
                      </span>
                      <CheckCircleFilled className="im-group-selectable-check" />
                    </button>
                  );
                })}
              </>
            ) : keywordTrimmed && searching ? (
              <div className="im-group-empty-inline">
                {t("groupInfo.searchingStrangers")}
              </div>
            ) : null}
          </>
        )}
      </div>
      <Button
        className="im-group-primary-button"
        type="primary"
        onClick={onAddMembers}
        disabled={!canInviteFriends || loading}
        loading={loading}
        block
      >
        {t("groupInfo.inviteJoin")}
      </Button>
    </div>
  );
}

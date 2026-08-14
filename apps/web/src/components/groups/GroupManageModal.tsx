import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  classifyUserSearchInput,
  parseGroupConversationSettings,
  type UserSearchResult
} from "@mushroom/shared";
import { Modal, Space, Tag, message } from "antd";
import type { Conversation, ConversationMember } from "../../types/chat";
import type { ContactListItem, LoginUser } from "../../types/user";
import { searchUser } from "../../http/api";
import GroupAnnouncementPanel from "./panels/GroupAnnouncementPanel";
import GroupDangerZone from "./panels/GroupDangerZone";
import GroupMembersPanel from "./panels/GroupMembersPanel";
import GroupProfileFields, {
  GroupProfileAvatarRow
} from "./panels/GroupProfilePanel";
import GroupSettingsPanel from "./panels/GroupSettingsPanel";
import { Button } from "antd";

interface GroupManageModalProps {
  visible: boolean;
  conversation: Conversation | null;
  loginUser: LoginUser;
  onClose: () => void;
  onUpdateProfile: (
    name: string,
    description?: string,
    avatarUrl?: string
  ) => Promise<void>;
  onUpdateAnnouncement: (announcement?: string) => Promise<void>;
  onUpdateSettings: (patch: {
    mute_all?: boolean;
    invite_permission?: "all_members" | "admins_only";
    profile_edit_permission?: "admins" | "owner_only";
  }) => Promise<void>;
  onAddMembers: (contacts: ContactListItem[]) => Promise<void>;
  onRemoveMember: (userId: number) => Promise<void>;
  onUpdateMemberRole: (userId: number, role: number) => Promise<void>;
  onUpdateMemberMute: (
    userId: number,
    muteMinutes?: number | null
  ) => Promise<void>;
  onLeaveConversation: () => Promise<void>;
  onDisbandGroupConversation: () => Promise<void>;
  onTransferOwner: (userId: number) => Promise<void>;
  /**
   * Optional one-shot fallback sync invoked once after a settings/profile/
   * announcement save actually writes anything. The per-handler proactive
   * `syncConversationState` calls were removed to prevent request floods on
   * every group action; this single callback closes the WS reconnect-gap
   * window where the actor's UI might otherwise miss the conversation.sync
   * outbox event.
   */
  onAfterSave?: () => void | Promise<void>;
}

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

export default function GroupManageModal({
  visible,
  conversation,
  loginUser,
  onClose,
  onUpdateProfile,
  onUpdateAnnouncement,
  onUpdateSettings,
  onAddMembers,
  onRemoveMember,
  onUpdateMemberRole,
  onUpdateMemberMute,
  onLeaveConversation,
  onDisbandGroupConversation,
  onTransferOwner,
  onAfterSave
}: GroupManageModalProps) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<number[]>([]);
  const [selectedStrangers, setSelectedStrangers] = useState<
    UserSearchResult[]
  >([]);
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTokenRef = useRef(0);
  const [friendKeyword, setFriendKeyword] = useState("");
  const [memberKeyword, setMemberKeyword] = useState("");
  const [selectedMember, setSelectedMember] =
    useState<ConversationMember | null>(null);
  const [memberPanelMode, setMemberPanelMode] = useState<"detail" | "invite">(
    "detail"
  );
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | undefined>();
  const [groupAnnouncement, setGroupAnnouncement] = useState("");
  const [muteAll, setMuteAll] = useState(false);
  const [invitePermission, setInvitePermission] = useState<
    "all_members" | "admins_only"
  >("admins_only");
  const [profileEditPermission, setProfileEditPermission] = useState<
    "admins" | "owner_only"
  >("admins");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSelectedFriendIds([]);
      setSelectedStrangers([]);
      setSearchResults([]);
      setSearching(false);
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      searchTokenRef.current += 1;
      setFriendKeyword("");
      setMemberKeyword("");
      setSelectedMember(null);
      setMemberPanelMode("detail");
      setGroupName("");
      setGroupDescription("");
      setGroupAvatarUrl(undefined);
      setGroupAnnouncement("");
      setMuteAll(false);
      setInvitePermission("admins_only");
      setProfileEditPermission("admins");
      return;
    }

    const settings = parseGroupConversationSettings(conversation?.settings);
    setGroupName(conversation?.name ?? "");
    setGroupDescription(conversation?.description ?? "");
    setGroupAvatarUrl(conversation?.avatar_url);
    setGroupAnnouncement(settings.announcement ?? "");
    setMuteAll(Boolean(settings.mute_all));
    setInvitePermission(
      settings.invite_permission === "all_members"
        ? "all_members"
        : "admins_only"
    );
    setProfileEditPermission(
      settings.profile_edit_permission === "owner_only"
        ? "owner_only"
        : "admins"
    );
    void window.electronAPI.getContacts().then(setContacts);
  }, [
    visible,
    conversation?.avatar_url,
    conversation?.description,
    conversation?.name,
    conversation?.settings
  ]);

  useEffect(() => {
    if (!selectedMember || !conversation?.members) {
      return;
    }
    const nextSelected = conversation.members.find(
      member => member.user_id === selectedMember.user_id
    );
    setSelectedMember(nextSelected ?? null);
  }, [conversation?.members, selectedMember]);

  const members = useMemo(
    () => conversation?.members ?? [],
    [conversation?.members]
  );
  const currentMember = members.find(
    member => member.user_id === loginUser.userId
  );
  const currentSettings = parseGroupConversationSettings(
    conversation?.settings
  );
  const canManageMembers = (currentMember?.role ?? 0) >= 1;
  const canUpdateRoles = (currentMember?.role ?? 0) === 2;
  const canEditProfile =
    currentSettings.profile_edit_permission === "owner_only"
      ? (currentMember?.role ?? 0) === 2
      : canManageMembers;
  const canUpdateAnnouncement = canEditProfile;
  const canToggleMuteAll = canManageMembers;
  const canEditGroupSettings = (currentMember?.role ?? 0) === 2;
  const memberIdSet = useMemo(
    () => new Set(members.map(member => member.user_id)),
    [members]
  );
  const availableContacts = contacts.filter(friend => {
    if (memberIdSet.has(friend.user_id)) {
      return false;
    }
    const keyword = friendKeyword.trim().toLowerCase();
    if (!keyword) {
      return true;
    }
    return (
      friend.nickname.toLowerCase().includes(keyword) ||
      friend.username.toLowerCase().includes(keyword)
    );
  });
  const filteredMembers = members.filter(member => {
    const keyword = memberKeyword.trim().toLowerCase();
    if (!keyword) {
      return true;
    }
    return member.nickname.toLowerCase().includes(keyword);
  });
  const selectedInviteContacts = contacts.filter(contact =>
    selectedFriendIds.includes(contact.user_id)
  );
  const strangerSearchResults = useMemo(() => {
    const contactIds = new Set(contacts.map(c => c.user_id));
    return searchResults.filter(
      user =>
        user.user_id !== loginUser.userId &&
        !memberIdSet.has(user.user_id) &&
        !contactIds.has(user.user_id)
    );
  }, [searchResults, contacts, memberIdSet, loginUser.userId]);
  const totalSelectedCount =
    selectedInviteContacts.length + selectedStrangers.length;
  const canInviteByPermission =
    invitePermission === "all_members"
      ? (currentMember?.role ?? 0) >= 0
      : canManageMembers;
  const canInviteFriends = canInviteByPermission && totalSelectedCount > 0;
  const isMemberMuted = (member: ConversationMember) =>
    !!member.muted_until && new Date(member.muted_until).getTime() > Date.now();
  const selectedMemberMuted = selectedMember
    ? isMemberMuted(selectedMember)
    : false;
  const selectedMemberIsSelf = selectedMember?.user_id === loginUser.userId;
  const canManageSelectedMember =
    !!selectedMember &&
    canManageMembers &&
    !selectedMemberIsSelf &&
    selectedMember.role < (currentMember?.role ?? 0);
  const canToggleSelectedRole =
    !!selectedMember &&
    canUpdateRoles &&
    !selectedMemberIsSelf &&
    selectedMember.role !== 2;
  const canTransferSelectedOwner =
    !!selectedMember &&
    (currentMember?.role ?? 0) === 2 &&
    !selectedMemberIsSelf &&
    selectedMember.role !== 2;
  const canToggleSelectedMute =
    !!selectedMember &&
    canManageMembers &&
    !selectedMemberIsSelf &&
    selectedMember.role !== 2 &&
    ((currentMember?.role ?? 0) === 2 || selectedMember.role === 0);

  const ownerCount = members.filter(member => member.role === 2).length;
  const adminCount = members.filter(member => member.role === 1).length;

  const toggleFriendSelection = (userId: number) => {
    setSelectedFriendIds(current =>
      current.includes(userId)
        ? current.filter(id => id !== userId)
        : [...current, userId]
    );
  };

  const toggleStrangerSelection = (user: UserSearchResult) => {
    if (memberIdSet.has(user.user_id) || user.user_id === loginUser.userId) {
      return;
    }
    setSelectedStrangers(current => {
      const exists = current.some(item => item.user_id === user.user_id);
      if (exists) {
        return current.filter(item => item.user_id !== user.user_id);
      }
      return [...current, user];
    });
  };

  // Debounced server-side user search; only runs while the invite panel is
  // active so we don't fire requests during regular member browsing.
  useEffect(() => {
    if (!visible || memberPanelMode !== "invite") {
      return;
    }
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    const keyword = friendKeyword.trim();
    if (!keyword) {
      searchTokenRef.current += 1;
      setSearchResults([]);
      setSearching(false);
      return;
    }
    if (classifyUserSearchInput(keyword) === "too-short") {
      searchTokenRef.current += 1;
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const token = ++searchTokenRef.current;
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await searchUser({
          keyword,
          default_country_code: "+86"
        });
        if (token !== searchTokenRef.current) return;
        setSearchResults(Array.isArray(res?.data) ? res.data : []);
      } catch (error) {
        if (token !== searchTokenRef.current) return;
        setSearchResults([]);
        // 静默失败，仍然允许在本地好友列表中选择

        console.warn("[GroupManageModal] searchUser failed", error);
      } finally {
        if (token === searchTokenRef.current) {
          setSearching(false);
        }
      }
    }, 350);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
    };
  }, [friendKeyword, visible, memberPanelMode]);

  const confirmDangerAction = (
    title: string,
    content: string,
    action: () => Promise<void>
  ) => {
    Modal.confirm({
      title,
      content,
      okText: t("common.confirm"),
      cancelText: t("common.cancel"),
      okButtonProps: { danger: true },
      onOk: action
    });
  };

  const handleAddMembers = async () => {
    if (selectedInviteContacts.length === 0 && selectedStrangers.length === 0) {
      message.warning(t("groupActions.selectMembersToInvite"));
      return;
    }

    const strangerPayload: ContactListItem[] = selectedStrangers.map(user => ({
      user_id: user.user_id,
      username: user.username,
      nickname: user.nickname,
      avatar_url: user.avatar_url,
      gender: 0,
      updated_at: new Date().toISOString(),
      is_blocked: false
    }));

    setLoading(true);
    try {
      await onAddMembers([...selectedInviteContacts, ...strangerPayload]);
      setSelectedFriendIds([]);
      setSelectedStrangers([]);
      setFriendKeyword("");
      setSearchResults([]);
      message.success(t("groupActions.membersInvited"));
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : t("groupActions.inviteFailed")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    if (
      !canEditProfile &&
      !canUpdateAnnouncement &&
      !canToggleMuteAll &&
      !canEditGroupSettings
    ) {
      message.warning(t("groupActions.nothingToSave"));
      return;
    }

    if (canEditProfile && !groupName.trim()) {
      message.warning(t("groupActions.groupNameRequiredShort"));
      return;
    }

    const settingsPatch: {
      mute_all?: boolean;
      invite_permission?: "all_members" | "admins_only";
      profile_edit_permission?: "admins" | "owner_only";
    } = {};

    // Build a diff-based patch so non-owner callers (admins toggling only
    // mute_all) do not include owner-only fields in the payload, which would
    // otherwise trip the server's per-field permission checks. Aligns with the
    // mobile client's handleSaveGroupSettings behavior.
    if (muteAll !== Boolean(currentSettings.mute_all)) {
      settingsPatch.mute_all = muteAll;
    }
    if (
      invitePermission !== (currentSettings.invite_permission || "all_members")
    ) {
      settingsPatch.invite_permission = invitePermission;
    }
    if (
      profileEditPermission !==
      (currentSettings.profile_edit_permission || "admins")
    ) {
      settingsPatch.profile_edit_permission = profileEditPermission;
    }

    setLoading(true);
    try {
      const tasks: Array<Promise<unknown>> = [];

      if (canEditProfile) {
        tasks.push(
          onUpdateProfile(
            groupName.trim(),
            groupDescription.trim() || undefined,
            groupAvatarUrl
          )
        );
      }
      if (canUpdateAnnouncement) {
        const previousAnnouncement = (
          currentSettings.announcement ?? ""
        ).trim();
        const nextAnnouncement = groupAnnouncement.trim();
        if (nextAnnouncement !== previousAnnouncement) {
          tasks.push(onUpdateAnnouncement(nextAnnouncement || undefined));
        }
      }
      if (Object.keys(settingsPatch).length > 0) {
        tasks.push(onUpdateSettings(settingsPatch));
      }

      await Promise.all(tasks);
      // One-shot fallback sync: only when we actually wrote something. Covers
      // the WS reconnect gap between the HTTP response and the server-side
      // conversation.sync outbox dispatch reaching this client.
      if (tasks.length > 0 && onAfterSave) {
        try {
          await onAfterSave();
        } catch {
          // Fallback sync is best-effort; failures should not surface to the
          // user since the primary save already succeeded.
        }
      }
      message.success(t("groupActions.settingsSaved"));
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : t("groupActions.settingsSaveFailed")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = (member: ConversationMember) => {
    confirmDangerAction(
      t("groupInfo.removeFromGroup"),
      t("groupActions.removeMemberConfirm", { name: member.nickname }),
      async () => {
        setLoading(true);
        try {
          await onRemoveMember(member.user_id);
          message.success(
            t("groupActions.memberRemovedNamed", { name: member.nickname })
          );
          if (selectedMember?.user_id === member.user_id) {
            setSelectedMember(null);
          }
        } catch (error) {
          message.error(
            error instanceof Error
              ? error.message
              : t("groupActions.removeMemberFailed")
          );
          throw error;
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handleToggleRole = async (member: ConversationMember) => {
    const nextRole = member.role === 1 ? 0 : 1;
    setLoading(true);
    try {
      await onUpdateMemberRole(member.user_id, nextRole);
      message.success(
        nextRole === 1
          ? t("groupActions.roleUpdatedAdmin", { name: member.nickname })
          : t("groupActions.roleUpdatedMember", { name: member.nickname })
      );
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : t("groupActions.roleUpdateFailed")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveConversation = () => {
    confirmDangerAction(
      t("groupActions.leaveGroupTitle"),
      t("groupActions.leaveGroupConfirmWeb"),
      async () => {
        setLoading(true);
        try {
          await onLeaveConversation();
          message.success(t("groupActions.leftGroup"));
          onClose();
        } catch (error) {
          message.error(
            error instanceof Error
              ? error.message
              : t("groupActions.leaveFailed")
          );
          throw error;
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handleTransferOwner = (member: ConversationMember) => {
    confirmDangerAction(
      t("groupActions.transferOwnerTitle"),
      t("groupActions.transferOwnerConfirmWeb", { name: member.nickname }),
      async () => {
        setLoading(true);
        try {
          await onTransferOwner(member.user_id);
          message.success(
            t("groupActions.transferOwnerDone", { name: member.nickname })
          );
        } catch (error) {
          message.error(
            error instanceof Error
              ? error.message
              : t("groupActions.transferOwnerFailed")
          );
          throw error;
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handleDisbandConversation = () => {
    confirmDangerAction(
      t("groupActions.disbandGroupTitle"),
      t("groupActions.disbandGroupConfirmWeb"),
      async () => {
        setLoading(true);
        try {
          await onDisbandGroupConversation();
          message.success(t("groupActions.groupDisbanded"));
          onClose();
        } catch (error) {
          message.error(
            error instanceof Error
              ? error.message
              : t("groupActions.disbandFailed")
          );
          throw error;
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handleUpdateMemberMute = async (
    member: ConversationMember,
    muteMinutes?: number | null
  ) => {
    setLoading(true);
    try {
      await onUpdateMemberMute(member.user_id, muteMinutes);
      message.success(
        muteMinutes && muteMinutes > 0
          ? t("groupActions.memberMutedNamed", { name: member.nickname })
          : t("groupActions.memberUnmutedNamed", { name: member.nickname })
      );
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : t("groupActions.muteUpdateFailed")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      className="im-modal im-group-manage-modal"
      title={
        conversation
          ? `${conversation.name}（${members.length}）`
          : t("groupInfo.manageTitle")
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1160}
      destroyOnHidden
    >
      <div className="im-group-manage-shell">
        <div className="im-group-manage-column">
          <div className="im-group-summary-row">
            <Space size={[8, 8]} wrap>
              <Tag color="geekblue">
                {t("groupInfo.yourRole", {
                  role: getRoleText(currentMember?.role ?? 0, t)
                })}
              </Tag>
              <Tag>{t("groupInfo.memberTitle", { count: members.length })}</Tag>
              <Tag color="purple">
                {t("groupInfo.ownerCount", { count: ownerCount })}
              </Tag>
              <Tag color="cyan">
                {t("groupInfo.adminCount", { count: adminCount })}
              </Tag>
            </Space>
          </div>

          <section className="im-group-section">
            <header className="im-group-section-header">
              <h3 className="im-group-section-title">
                {t("groupInfo.profileSettingsTitle")}
              </h3>
              <p className="im-group-section-subtitle">
                {t("groupInfo.profileSettingsSubtitle")}
              </p>
            </header>

            <GroupProfileAvatarRow
              conversation={conversation}
              groupName={groupName}
              groupAvatarUrl={groupAvatarUrl}
              loading={loading}
              canEditProfile={canEditProfile}
              onChangeAvatarUrl={setGroupAvatarUrl}
              onUploadingChange={setLoading}
            />

            <div className="im-group-attr-grid">
              <GroupProfileFields
                groupName={groupName}
                groupDescription={groupDescription}
                loading={loading}
                canEditProfile={canEditProfile}
                onChangeName={setGroupName}
                onChangeDescription={setGroupDescription}
              />
              <GroupAnnouncementPanel
                value={groupAnnouncement}
                loading={loading}
                canUpdate={canUpdateAnnouncement}
                onChange={setGroupAnnouncement}
              />
              <GroupSettingsPanel
                muteAll={muteAll}
                invitePermission={invitePermission}
                profileEditPermission={profileEditPermission}
                canToggleMuteAll={canToggleMuteAll}
                canEditGroupSettings={canEditGroupSettings}
                loading={loading}
                onChangeMuteAll={setMuteAll}
                onChangeInvitePermission={setInvitePermission}
                onChangeProfileEditPermission={setProfileEditPermission}
              />
            </div>
          </section>
        </div>

        <div className="im-group-manage-column">
          <section className="im-group-section">
            <header className="im-group-section-header">
              <h3 className="im-group-section-title">
                {t("groupInfo.membersInviteTitle")}
              </h3>
              <p className="im-group-section-subtitle">
                {t("groupInfo.membersInviteSubtitle")}
              </p>
            </header>
            <GroupMembersPanel
              members={members}
              filteredMembers={filteredMembers}
              memberKeyword={memberKeyword}
              onMemberKeywordChange={setMemberKeyword}
              selectedMember={selectedMember}
              onSelectMember={setSelectedMember}
              memberPanelMode={memberPanelMode}
              onMemberPanelModeChange={setMemberPanelMode}
              loginUserId={loginUser.userId}
              ownerCount={ownerCount}
              adminCount={adminCount}
              totalSelectedCount={totalSelectedCount}
              contacts={contacts}
              isMemberMuted={isMemberMuted}
              selectedMemberIsSelf={selectedMemberIsSelf}
              selectedMemberMuted={selectedMemberMuted}
              canTransferSelectedOwner={canTransferSelectedOwner}
              canToggleSelectedRole={canToggleSelectedRole}
              canToggleSelectedMute={canToggleSelectedMute}
              canManageSelectedMember={canManageSelectedMember}
              onTransferOwner={handleTransferOwner}
              onToggleRole={member => void handleToggleRole(member)}
              onUpdateMemberMute={(member, muteMinutes) =>
                void handleUpdateMemberMute(member, muteMinutes)
              }
              onRemoveMember={handleRemoveMember}
              canInviteByPermission={canInviteByPermission}
              canInviteFriends={canInviteFriends}
              friendKeyword={friendKeyword}
              onFriendKeywordChange={setFriendKeyword}
              availableContacts={availableContacts}
              selectedFriendIds={selectedFriendIds}
              selectedInviteContacts={selectedInviteContacts}
              strangerSearchResults={strangerSearchResults}
              selectedStrangers={selectedStrangers}
              searching={searching}
              onToggleFriend={toggleFriendSelection}
              onToggleStranger={toggleStrangerSelection}
              onAddMembers={() => void handleAddMembers()}
              loading={loading}
            />
          </section>
        </div>
      </div>

      <div className="im-group-footer">
        <GroupDangerZone
          isOwner={(currentMember?.role ?? 0) === 2}
          loading={loading}
          onLeave={handleLeaveConversation}
          onDisband={handleDisbandConversation}
        />
        <Button
          className="im-group-primary-button"
          type="primary"
          onClick={() => void handleSaveChanges()}
          disabled={
            (!canEditProfile &&
              !canUpdateAnnouncement &&
              !canToggleMuteAll &&
              !canEditGroupSettings) ||
            loading
          }
          loading={loading}
        >
          保存
        </Button>
      </div>
    </Modal>
  );
}

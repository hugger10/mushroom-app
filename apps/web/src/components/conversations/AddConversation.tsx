import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Empty, Input, Modal, Spin } from "antd";
import {
  CheckCircleFilled,
  CloseOutlined,
  SearchOutlined
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { ContactListItem } from "../../types/user";
import type { ConversationMember } from "../../types/chat";
import { UserAvatar } from "../avatars/UserAvatar";
import { searchUser } from "../../http/api";
import type { UserSearchResult } from "@mushroom/shared";
import {
  classifyUserSearchInput,
  GROUP_NAME_MAX_LENGTH,
  SEARCH_KEYWORD_MAX_LENGTH
} from "@mushroom/shared";

interface Props {
  visible: boolean;
  onCreateConversation: (values: {
    groupName: string;
    members: ConversationMember[];
  }) => void | Promise<void>;
  onCancel: () => void;
}

/** Unified member item used for selection (from contacts or search results) */
interface SelectableMember {
  user_id: number;
  username: string;
  nickname: string;
  avatar_url?: string;
  remark_name?: string | null;
  isContact: boolean;
}

function getMemberDisplayName(member: SelectableMember) {
  return member.remark_name || member.nickname || member.username;
}

function contactToSelectable(contact: ContactListItem): SelectableMember {
  return {
    user_id: contact.user_id,
    username: contact.username,
    nickname: contact.nickname,
    avatar_url: contact.avatar_url,
    remark_name: contact.remark_name,
    isContact: true
  };
}

function searchResultToSelectable(result: UserSearchResult): SelectableMember {
  return {
    user_id: result.user_id,
    username: result.username,
    nickname: result.nickname,
    avatar_url: result.avatar_url,
    remark_name: null,
    isContact: false
  };
}

export default function AddConversation({
  visible,
  onCreateConversation,
  onCancel
}: Props) {
  const { t } = useTranslation();

  // Step: 1 = select members, 2 = group info
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedMembers, setSelectedMembers] = useState<SelectableMember[]>(
    []
  );
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupNameError, setGroupNameError] = useState("");
  const [creating, setCreating] = useState(false);

  // Remote search state
  const [remoteResults, setRemoteResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load contacts on open
  useEffect(() => {
    if (!visible) return;
    void window.electronAPI.getContacts().then(nextContacts => {
      setContacts(nextContacts);
    });
  }, [visible]);

  // Reset on close
  useEffect(() => {
    if (!visible) {
      setStep(1);
      setSelectedMembers([]);
      setSearchText("");
      setGroupName("");
      setGroupNameError("");
      setRemoteResults([]);
      setIsSearching(false);
      setCreating(false);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    }
  }, [visible]);

  // Debounced remote search
  const doRemoteSearch = useCallback(async (keyword: string) => {
    setIsSearching(true);
    try {
      const res = await searchUser({
        q: keyword,
        default_country_code: "+86"
      });
      setRemoteResults(res.data || []);
    } catch {
      setRemoteResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchText(value);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (
        value.trim().length >= 2 &&
        classifyUserSearchInput(value) !== "too-short"
      ) {
        debounceRef.current = setTimeout(() => {
          void doRemoteSearch(value.trim());
        }, 300);
      } else {
        setRemoteResults([]);
        setIsSearching(false);
      }
    },
    [doRemoteSearch]
  );

  const selectedIds = useMemo(
    () => new Set(selectedMembers.map(m => m.user_id)),
    [selectedMembers]
  );

  // Filtered contacts (local)
  const filteredContacts = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return contacts;
    return contacts.filter(contact => {
      const displayName = (
        contact.remark_name ||
        contact.nickname ||
        contact.username
      ).toLowerCase();
      return (
        displayName.includes(keyword) ||
        contact.username.toLowerCase().includes(keyword)
      );
    });
  }, [contacts, searchText]);

  // Remote results filtered: exclude self contacts (already shown) and already-selected
  const filteredRemoteResults = useMemo(() => {
    const contactIds = new Set(contacts.map(c => c.user_id));
    return remoteResults.filter(r => !contactIds.has(r.user_id));
  }, [remoteResults, contacts]);

  const toggleSelection = (member: SelectableMember) => {
    setSelectedMembers(current => {
      if (current.some(m => m.user_id === member.user_id)) {
        return current.filter(m => m.user_id !== member.user_id);
      }
      return [...current, member];
    });
  };

  const removeSelection = (userId: number) => {
    setSelectedMembers(current => current.filter(m => m.user_id !== userId));
  };

  const handleNext = () => {
    if (selectedMembers.length === 0) return;
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
    setGroupNameError("");
  };

  const handleCreate = async () => {
    if (creating) return;
    const name = groupName.trim();
    if (!name) {
      setGroupNameError(t("createGroup.groupNameRequired"));
      return;
    }
    setCreating(true);
    try {
      await onCreateConversation({
        groupName: name,
        members: selectedMembers.map(m => ({
          user_id: m.user_id,
          nickname: m.nickname,
          avatar_url: m.avatar_url,
          role: 0
        }))
      });
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    onCancel();
  };

  // Render a single contact/member row
  const renderMemberRow = (member: SelectableMember) => {
    const isSelected = selectedIds.has(member.user_id);
    return (
      <button
        key={member.user_id}
        type="button"
        className={`im-create-group-contact ${
          isSelected ? "im-create-group-contact-active" : ""
        }`}
        onClick={() => toggleSelection(member)}
      >
        <UserAvatar
          className="im-create-group-avatar"
          size={40}
          src={member.avatar_url}
          name={getMemberDisplayName(member)}
          fallback={getMemberDisplayName(member).slice(0, 1) || "U"}
        />
        <span className="im-create-group-contact-copy">
          <span className="im-create-group-contact-line">
            {getMemberDisplayName(member)}
            <span className="im-create-group-contact-username">
              {" "}
              (@{member.username})
            </span>
          </span>
        </span>
        <CheckCircleFilled
          className={`im-create-group-check ${
            isSelected ? "im-create-group-check-active" : ""
          }`}
        />
      </button>
    );
  };

  const hasSearchKeyword = searchText.trim().length >= 2;
  const showRemoteSection =
    hasSearchKeyword && filteredRemoteResults.length > 0;

  return (
    <Modal
      className="im-modal im-create-group-modal"
      title={
        step === 1 ? t("createGroup.title") : t("createGroup.groupInfoTitle")
      }
      open={visible}
      forceRender
      onCancel={handleClose}
      footer={
        step === 1
          ? [
              <Button
                key="cancel"
                className="im-group-secondary-button"
                onClick={handleClose}
              >
                {t("common.cancel")}
              </Button>,
              <Button
                key="next"
                className="im-group-primary-button"
                type="primary"
                disabled={selectedMembers.length === 0}
                onClick={handleNext}
              >
                {t("createGroup.next")}
              </Button>
            ]
          : [
              <Button
                key="back"
                className="im-group-secondary-button"
                onClick={handleBack}
              >
                {t("createGroup.back")}
              </Button>,
              <Button
                key="create"
                className="im-group-primary-button"
                type="primary"
                loading={creating}
                disabled={creating}
                onClick={handleCreate}
              >
                {t("createGroup.create")}
              </Button>
            ]
      }
      width={760}
    >
      {step === 1 ? (
        <div className="im-create-group-step1">
          {/* Search input */}
          <Input
            className="im-create-group-search"
            placeholder={t("createGroup.searchPlaceholder")}
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={event => handleSearchChange(event.target.value)}
            allowClear
            maxLength={SEARCH_KEYWORD_MAX_LENGTH}
            suffix={isSearching ? <Spin size="small" /> : undefined}
          />

          {/* Selected chips */}
          {selectedMembers.length > 0 && (
            <div className="im-create-group-chips">
              {selectedMembers.map(member => (
                <div key={member.user_id} className="im-create-group-chip">
                  <UserAvatar
                    size={24}
                    src={member.avatar_url}
                    name={getMemberDisplayName(member)}
                    fallback={getMemberDisplayName(member).slice(0, 1) || "U"}
                  />
                  <span className="im-create-group-chip-name">
                    {getMemberDisplayName(member)}
                  </span>
                  <CloseOutlined
                    className="im-create-group-chip-close"
                    onClick={() => removeSelection(member.user_id)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Contact list */}
          <div className="im-create-group-list">
            {filteredContacts.length > 0 && (
              <div className="im-create-group-section">
                <div className="im-create-group-section-title">
                  {t("createGroup.contactsLabel")}
                </div>
                {filteredContacts.map(contact =>
                  renderMemberRow(contactToSelectable(contact))
                )}
              </div>
            )}

            {/* Remote search results */}
            {showRemoteSection && (
              <div className="im-create-group-section">
                <div className="im-create-group-section-title">
                  {t("createGroup.otherUsers")}
                </div>
                {filteredRemoteResults.map(result =>
                  renderMemberRow(searchResultToSelectable(result))
                )}
              </div>
            )}

            {/* Empty state */}
            {filteredContacts.length === 0 &&
              !showRemoteSection &&
              !isSearching && (
                <div className="im-create-group-empty">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      hasSearchKeyword
                        ? t("createGroup.noSearchResults")
                        : contacts.length === 0
                          ? t("createGroup.noContacts")
                          : t("createGroup.noSearchResults")
                    }
                  />
                </div>
              )}
          </div>
        </div>
      ) : (
        <div className="im-create-group-step2">
          {/* Group name */}
          <div className="im-create-group-name-row">
            <span className="im-create-group-name-label">
              {t("createGroup.groupNameLabel")}
            </span>
            <Input
              className="im-create-group-input"
              placeholder={t("createGroup.groupNamePlaceholder")}
              maxLength={GROUP_NAME_MAX_LENGTH}
              value={groupName}
              onChange={e => {
                setGroupName(e.target.value);
                if (e.target.value.trim()) setGroupNameError("");
              }}
              status={groupNameError ? "error" : undefined}
            />
            {groupNameError && (
              <div className="im-create-group-error">{groupNameError}</div>
            )}
          </div>

          {/* Selected members preview */}
          <div className="im-create-group-panel">
            <div className="im-create-group-panel-head">
              <div className="im-create-group-panel-title">
                {t("createGroup.selectedCount", {
                  count: selectedMembers.length
                })}
              </div>
            </div>
            <div className="im-create-group-list">
              {selectedMembers.map(member => (
                <div
                  key={`selected:${member.user_id}`}
                  className="im-create-group-selected-item"
                >
                  <UserAvatar
                    className="im-create-group-avatar"
                    size={36}
                    src={member.avatar_url}
                    name={getMemberDisplayName(member)}
                    fallback={getMemberDisplayName(member).slice(0, 1) || "U"}
                  />
                  <span className="im-create-group-contact-copy">
                    <span className="im-create-group-contact-line">
                      {getMemberDisplayName(member)}
                      <span className="im-create-group-contact-username">
                        {" "}
                        (@{member.username})
                      </span>
                    </span>
                  </span>
                  <Button
                    className="im-create-group-remove"
                    type="text"
                    icon={<CloseOutlined />}
                    onClick={() => removeSelection(member.user_id)}
                    aria-label={t("createGroup.remove")}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

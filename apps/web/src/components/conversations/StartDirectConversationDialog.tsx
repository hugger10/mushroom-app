import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Input, Button, message, Empty, Spin } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import type { ContactListItem } from "../../types/user";
import { UserAvatar } from "../avatars/UserAvatar";
import { getReadableErrorMessage } from "../../utils/errorMessage";

interface UserInfo {
  user_id: number;
  username: string;
  nickname: string;
  avatar_url?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSearchUser: (keyword: string) => Promise<UserInfo[]>;
  onOpenChat: (userId: number) => Promise<void>;
}

interface RowData {
  user_id: number;
  username: string;
  nickname: string;
  avatar_url?: string;
  remark_name?: string | null;
}

function getDisplayName(row: RowData) {
  return row.remark_name || row.nickname || row.username;
}

function contactToRow(contact: ContactListItem): RowData {
  return {
    user_id: contact.user_id,
    username: contact.username,
    nickname: contact.nickname,
    avatar_url: contact.avatar_url,
    remark_name: contact.remark_name
  };
}

function userInfoToRow(user: UserInfo): RowData {
  return {
    user_id: user.user_id,
    username: user.username,
    nickname: user.nickname,
    avatar_url: user.avatar_url,
    remark_name: null
  };
}

export default function StartDirectConversationDialog({
  visible,
  onClose,
  onSearchUser,
  onOpenChat
}: Props) {
  const { t } = useTranslation();

  const [keyword, setKeyword] = useState("");
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [remoteResults, setRemoteResults] = useState<UserInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingUserId, setAddingUserId] = useState<number | null>(null);
  const [errorText, setErrorText] = useState("");
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
      setKeyword("");
      setContacts([]);
      setRemoteResults([]);
      setIsSearching(false);
      setAddingUserId(null);
      setErrorText("");
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    }
  }, [visible]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  const doRemoteSearch = useCallback(
    async (kw: string) => {
      setIsSearching(true);
      setErrorText("");
      try {
        const users = await onSearchUser(kw);
        setRemoteResults(users || []);
      } catch (error) {
        setRemoteResults([]);
        setErrorText(
          getReadableErrorMessage(error, t("startConversation.searchFailed"))
        );
      } finally {
        setIsSearching(false);
      }
    },
    [onSearchUser, t]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setKeyword(value);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (value.trim().length >= 2) {
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

  // Filtered contacts (local)
  const filteredContacts = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return contacts;
    return contacts.filter(contact => {
      const displayName = (
        contact.remark_name ||
        contact.nickname ||
        contact.username
      ).toLowerCase();
      return (
        displayName.includes(kw) || contact.username.toLowerCase().includes(kw)
      );
    });
  }, [contacts, keyword]);

  // Exclude remote results already shown in contacts
  const filteredRemoteResults = useMemo(() => {
    const contactIds = new Set(contacts.map(c => c.user_id));
    return remoteResults.filter(r => !contactIds.has(r.user_id));
  }, [remoteResults, contacts]);

  const hasSearchKeyword = keyword.trim().length >= 2;
  const showRemoteSection =
    hasSearchKeyword && filteredRemoteResults.length > 0;

  const handleAdd = async (userId: number) => {
    if (addingUserId !== null) return;
    setAddingUserId(userId);
    setErrorText("");
    try {
      await onOpenChat(userId);
      message.success(t("startConversation.chatOpened"));
      handleClose();
    } catch (error) {
      setErrorText(
        getReadableErrorMessage(error, t("startConversation.openChatFailed"))
      );
    } finally {
      setAddingUserId(null);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const renderRow = (row: RowData) => {
    const isAdding = addingUserId === row.user_id;
    return (
      <div
        key={row.user_id}
        className="im-create-group-contact"
        style={{ cursor: "default" }}
      >
        <UserAvatar
          className="im-create-group-avatar"
          size={40}
          src={row.avatar_url}
          name={getDisplayName(row)}
          fallback={getDisplayName(row).slice(0, 1) || "U"}
        />
        <span className="im-create-group-contact-copy">
          <span className="im-create-group-contact-line">
            {getDisplayName(row)}
            <span className="im-create-group-contact-username">
              {" "}
              (@{row.username})
            </span>
          </span>
        </span>
        <Button
          type="primary"
          size="small"
          loading={isAdding}
          disabled={addingUserId !== null && !isAdding}
          onClick={() => void handleAdd(row.user_id)}
        >
          {t("startConversation.startChat")}
        </Button>
      </div>
    );
  };

  return (
    <Modal
      className="im-modal im-create-group-modal"
      title={t("startConversation.startChatTitle")}
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={760}
    >
      <div className="im-create-group-step1">
        {/* Search input (same UI as group chat) */}
        <Input
          className="im-create-group-search"
          placeholder={t("createGroup.searchPlaceholder")}
          prefix={<SearchOutlined />}
          value={keyword}
          onChange={event => handleSearchChange(event.target.value)}
          allowClear
          maxLength={SEARCH_KEYWORD_MAX_LENGTH}
          suffix={isSearching ? <Spin size="small" /> : undefined}
        />

        {errorText ? (
          <div style={{ color: "#dc2626", margin: "8px 0" }}>{errorText}</div>
        ) : null}

        <div className="im-create-group-list">
          {/* Contacts section */}
          {filteredContacts.length > 0 && (
            <div className="im-create-group-section">
              <div className="im-create-group-section-title">
                {t("createGroup.contactsLabel")}
              </div>
              {filteredContacts.map(contact =>
                renderRow(contactToRow(contact))
              )}
            </div>
          )}

          {/* Remote (non-contact) results */}
          {showRemoteSection && (
            <div className="im-create-group-section">
              <div className="im-create-group-section-title">
                {t("createGroup.otherUsers")}
              </div>
              {filteredRemoteResults.map(user =>
                renderRow(userInfoToRow(user))
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
    </Modal>
  );
}

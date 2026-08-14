import { Input, List, Modal, Skeleton, message } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { UserSearchResult } from "@mushroom/shared";
import {
  compactPhone,
  isValidPhoneInput,
  SEARCH_KEYWORD_MAX_LENGTH
} from "@mushroom/shared";
import { searchUser, saveContact } from "../../http/api";
import type { ContactListItem } from "../../types/user";
import { normalizeAvatarUrl } from "../../utils/display";
import { UserAvatar } from "../avatars/UserAvatar";

interface AddContactDialogProps {
  visible: boolean;
  onClose: () => void;
  contacts: ContactListItem[];
  onContactAdded: () => void;
}

type TabKey = "phone" | "username";

export function AddContactDialog({
  visible,
  onClose,
  contacts,
  onContactAdded
}: AddContactDialogProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>("phone");
  const [phoneKeyword, setPhoneKeyword] = useState("");
  const [usernameKeyword, setUsernameKeyword] = useState("");
  const [phoneInvalid, setPhoneInvalid] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contactUserIds = useMemo(
    () => new Set(contacts.map(c => c.user_id)),
    [contacts]
  );

  useEffect(() => {
    if (!visible) {
      setPhoneKeyword("");
      setUsernameKeyword("");
      setPhoneInvalid(false);
      setResults([]);
      setSearched(false);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    }
  }, [visible]);

  const doSearch = useCallback(async (query: string, mode: TabKey) => {
    setSearching(true);
    setSearched(true);
    try {
      const res = await searchUser({
        q: query,
        mode,
        default_country_code: "+86"
      });
      setResults(res.data || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const scheduleSearch = useCallback(
    (query: string, mode: TabKey) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (!query) {
        setResults([]);
        setSearched(false);
        setSearching(false);
        return;
      }
      if (mode === "phone") {
        const valid = isValidPhoneInput(query);
        setPhoneInvalid(!valid);
        if (!valid) {
          setResults([]);
          setSearched(false);
          setSearching(false);
          return;
        }
      }
      debounceRef.current = setTimeout(() => {
        void doSearch(query, mode);
      }, 300);
    },
    [doSearch]
  );

  const handlePhoneChange = (value: string) => {
    setPhoneKeyword(value);
    scheduleSearch(compactPhone(value), "phone");
  };

  const handleUsernameChange = (value: string) => {
    setUsernameKeyword(value);
    if (value.trim().length >= 2) {
      scheduleSearch(value.trim(), "username");
    } else {
      setResults([]);
      setSearched(false);
      setSearching(false);
    }
  };

  const handleAddContact = useCallback(
    async (userId: number) => {
      setAddingId(userId);
      try {
        await saveContact(userId);
        message.success(t("addContact.addSuccess"));
        onContactAdded();
        onClose();
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : t("addContact.addFailed")
        );
      } finally {
        setAddingId(null);
      }
    },
    [onContactAdded, onClose, t]
  );

  const isAlreadyContact = (userId: number) => contactUserIds.has(userId);

  return (
    <Modal
      className="im-modal im-add-contact-modal"
      title={t("addContact.title")}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={420}
      destroyOnHidden
    >
      <div className="im-add-contact-body">
        <div className="im-add-contact-tabs">
          <button
            type="button"
            className={`im-add-contact-tab${tab === "phone" ? " im-add-contact-tab-active" : ""}`}
            onClick={() => {
              setTab("phone");
              setResults([]);
              setSearched(false);
              setSearching(false);
              setPhoneInvalid(false);
            }}
          >
            {t("addContact.tabPhone")}
          </button>
          <button
            type="button"
            className={`im-add-contact-tab${tab === "username" ? " im-add-contact-tab-active" : ""}`}
            onClick={() => {
              setTab("username");
              setResults([]);
              setSearched(false);
              setSearching(false);
              setPhoneInvalid(false);
            }}
          >
            {t("addContact.tabUsername")}
          </button>
        </div>

        {tab === "phone" ? (
          <Input
            className="im-add-contact-search"
            placeholder={t("addContact.phonePlaceholder")}
            prefix={<SearchOutlined />}
            value={phoneKeyword}
            onChange={e => handlePhoneChange(e.target.value)}
            allowClear
            maxLength={16}
            autoFocus
          />
        ) : (
          <Input
            className="im-add-contact-search"
            placeholder={t("addContact.usernamePlaceholder")}
            prefix={<SearchOutlined />}
            value={usernameKeyword}
            onChange={e => handleUsernameChange(e.target.value)}
            allowClear
            maxLength={SEARCH_KEYWORD_MAX_LENGTH}
            autoFocus
          />
        )}

        <div className="im-add-contact-results">
          {phoneInvalid ? (
            <div className="im-add-contact-empty">
              {t("addContact.phoneInvalid")}
            </div>
          ) : searching ? (
            <div className="im-add-contact-loading">
              <Skeleton active avatar paragraph={{ rows: 1 }} />
            </div>
          ) : results.length > 0 ? (
            <List
              className="im-add-contact-list"
              dataSource={results}
              renderItem={user => {
                const alreadyAdded = isAlreadyContact(user.user_id);
                return (
                  <List.Item className="im-add-contact-item">
                    <div className="im-add-contact-user">
                      <UserAvatar
                        size={40}
                        src={normalizeAvatarUrl(user.avatar_url ?? null)}
                        name={user.nickname || user.username}
                      />
                      <div className="im-add-contact-user-info">
                        <span className="im-add-contact-user-name">
                          {user.nickname || user.username}
                        </span>
                        <span className="im-add-contact-user-username">
                          @{user.username}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`im-add-contact-btn${alreadyAdded ? " im-add-contact-btn-done" : ""}`}
                      disabled={alreadyAdded || addingId === user.user_id}
                      onClick={() => void handleAddContact(user.user_id)}
                    >
                      {alreadyAdded ? (
                        <span>{t("addContact.added")}</span>
                      ) : (
                        <span>
                          {addingId === user.user_id
                            ? "..."
                            : t("addContact.add")}
                        </span>
                      )}
                    </button>
                  </List.Item>
                );
              }}
            />
          ) : searched ? (
            <div className="im-add-contact-empty">
              {t("addContact.notFound")}
            </div>
          ) : (
            <div className="im-add-contact-hint">{t("addContact.hint")}</div>
          )}
        </div>
      </div>
    </Modal>
  );
}

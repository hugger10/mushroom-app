import { Input, List, Modal, Skeleton, message } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { UserSearchResult } from "@mushroom/shared";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
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

export function AddContactDialog({
  visible,
  onClose,
  contacts,
  onContactAdded
}: AddContactDialogProps) {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState("");
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
      setKeyword("");
      setResults([]);
      setSearched(false);
    }
  }, [visible]);

  const doSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    setSearched(true);
    try {
      const res = await searchUser({ q: query.trim() });
      setResults(res.data || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setKeyword(value);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (value.trim().length >= 2) {
        debounceRef.current = setTimeout(() => {
          void doSearch(value);
        }, 300);
      } else {
        setResults([]);
        setSearched(false);
      }
    },
    [doSearch]
  );

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
        <Input
          className="im-add-contact-search"
          placeholder={t("addContact.placeholder")}
          prefix={<SearchOutlined />}
          value={keyword}
          onChange={e => handleInputChange(e.target.value)}
          allowClear
          maxLength={SEARCH_KEYWORD_MAX_LENGTH}
          autoFocus
        />

        <div className="im-add-contact-results">
          {searching ? (
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

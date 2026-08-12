import { Button, Input, List, Tabs } from "antd";
import { useMemo, useState } from "react";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import type { ContactListItem } from "../../types/user";
import { AddContactDialog } from "./AddContactDialog";
import { UserAvatar } from "../avatars/UserAvatar";

interface Props {
  contacts: ContactListItem[];
  blockedUsers: ContactListItem[];
  selectedContactId?: number | null;
  onSelectContact: (contact: ContactListItem) => void;
  onBlockUser: (targetUserId: number) => Promise<void>;
  onUnblockUser: (targetUserId: number) => Promise<void>;
  onContactAdded: () => void;
}

function getContactDisplayName(friend: ContactListItem) {
  return friend.remark_name || friend.nickname || friend.username;
}

function getContactInitial(friend: ContactListItem) {
  return (getContactDisplayName(friend) || "?").charAt(0).toUpperCase();
}

function renderTabLabel(label: string, count: number) {
  return (
    <span className="im-addressbook-tab-label">
      <span>{label}</span>
      <span className="im-addressbook-tab-count">{count}</span>
    </span>
  );
}

function renderContactSummary(
  friend: ContactListItem,
  tone: "friend" | "blocked"
) {
  const displayName = getContactDisplayName(friend);
  return (
    <div className="im-addressbook-contact">
      <UserAvatar
        size={40}
        src={friend.avatar_url}
        name={displayName}
        fallback={getContactInitial(friend)}
        className={`im-addressbook-avatar im-addressbook-avatar-${tone}`}
      />
      <div className="im-addressbook-contact-meta">
        <span className="im-addressbook-contact-nickname">{displayName}</span>
        <span className="im-addressbook-contact-username">
          @{friend.username}
        </span>
      </div>
    </div>
  );
}

export default function ContactsPanel({
  contacts,
  blockedUsers,
  selectedContactId,
  onSelectContact,
  onUnblockUser,
  onContactAdded
}: Props) {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState("");
  const [addContactVisible, setAddContactVisible] = useState(false);

  const filteredContacts = useMemo(() => {
    if (!searchText.trim()) return contacts;
    const keyword = searchText.trim().toLowerCase();
    return contacts.filter(c => {
      const name = getContactDisplayName(c).toLowerCase();
      const username = (c.username || "").toLowerCase();
      return name.includes(keyword) || username.includes(keyword);
    });
  }, [contacts, searchText]);

  const filteredBlocked = useMemo(() => {
    if (!searchText.trim()) return blockedUsers;
    const keyword = searchText.trim().toLowerCase();
    return blockedUsers.filter(c => {
      const name = getContactDisplayName(c).toLowerCase();
      const username = (c.username || "").toLowerCase();
      return name.includes(keyword) || username.includes(keyword);
    });
  }, [blockedUsers, searchText]);

  return (
    <div className="im-contacts-inline-panel">
      <div className="im-contacts-inline-topbar">
        <div className="im-conversation-search-row">
          <Input
            className="im-conversation-search"
            placeholder={t("contacts.searchPlaceholder")}
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            maxLength={SEARCH_KEYWORD_MAX_LENGTH}
          />
          <Button
            className="im-conversation-action-button"
            icon={<PlusOutlined />}
            onClick={() => setAddContactVisible(true)}
          />
        </div>
      </div>
      <div className="im-contacts-inline-body">
        <Tabs
          className="im-addressbook-tabs im-contacts-inline-tabs"
          defaultActiveKey="contacts"
          items={[
            {
              key: "contacts",
              label: renderTabLabel(
                t("contacts.friends"),
                filteredContacts.length
              ),
              children: (
                <List
                  className="im-action-list im-addressbook-list"
                  locale={{ emptyText: t("contacts.noContacts") }}
                  dataSource={filteredContacts}
                  renderItem={friend => (
                    <List.Item
                      className={`im-action-list-item im-addressbook-item im-contacts-inline-item${selectedContactId === friend.user_id ? " im-contacts-inline-item-active" : ""}`}
                      onClick={() => onSelectContact(friend)}
                    >
                      {renderContactSummary(friend, "friend")}
                    </List.Item>
                  )}
                />
              )
            },
            {
              key: "blocked",
              label: renderTabLabel(
                t("contacts.blocked"),
                filteredBlocked.length
              ),
              children: (
                <List
                  className="im-action-list im-addressbook-list"
                  locale={{ emptyText: t("contacts.noBlocked") }}
                  dataSource={filteredBlocked}
                  renderItem={friend => (
                    <List.Item
                      className={`im-action-list-item im-addressbook-item im-contacts-inline-item${selectedContactId === friend.user_id ? " im-contacts-inline-item-active" : ""}`}
                      onClick={() => onSelectContact(friend)}
                      actions={[
                        <button
                          key="unblock"
                          type="button"
                          className="im-addressbook-action im-addressbook-action-secondary"
                          onClick={e => {
                            e.stopPropagation();
                            void onUnblockUser(friend.user_id);
                          }}
                        >
                          {t("contacts.unblock")}
                        </button>
                      ]}
                    >
                      {renderContactSummary(friend, "blocked")}
                    </List.Item>
                  )}
                />
              )
            }
          ]}
        />
      </div>
      <AddContactDialog
        visible={addContactVisible}
        onClose={() => setAddContactVisible(false)}
        contacts={contacts}
        onContactAdded={onContactAdded}
      />
    </div>
  );
}

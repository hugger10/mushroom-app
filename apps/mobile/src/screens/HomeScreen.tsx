import type { MobileAppSnapshot } from "@mushroom/app-core";
import type {
  ContactListItem,
  Conversation,
  UserPresenceSummary
} from "@mushroom/shared";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconGlyph, SearchOverlay, TabButton } from "../components/ui";
import { useAppTheme } from "../styles/app-styles";
import { getConversationDisplayName } from "../utils/display";
import type { HomeTab } from "../types/app";
import type { MobileRealtimeStatus } from "../services/realtime";
import { ChatsScreen } from "./ChatsScreen";
import { ContactsScreen } from "./ContactsScreen";
import { MeScreen } from "./MeScreen";

export function HomeScreen(props: {
  tab: HomeTab;
  addEntryMenuVisible: boolean;
  snapshot: MobileAppSnapshot;
  realtimeStatus: MobileRealtimeStatus;
  /** True while the first sync after a WS (re)connect is still in flight. */
  catchingUp: boolean;
  mobileApiBaseUrl: string;
  conversations: Conversation[];
  availableContacts: ContactListItem[];
  userPresenceByUserId?: Record<number, UserPresenceSummary>;
  /** 群已读高水位（key = server_conversation_id），透传到列表行渲染勾。 */
  groupReadStateByConversation?: Record<string, Record<number, number>>;
  /**
   * 当前所有会话的输入中状态（key = server_conversation_id，value = senderId → activity）。
   * 用于在会话列表第二行渲染 "正在输入…" / "Alice 正在输入…"。
   */
  typersByConversationId?: Record<
    string,
    Record<number, { activity: "text" | "voice" }>
  >;
  /** 已读回执是否启用；透传到列表行渲染勾的兜底 gate。 */
  isReceiptsEnabled?: boolean;
  pending: boolean;
  onChangeTab: (tab: HomeTab) => void;
  onOpenAddEntryMenu: () => void;
  onCloseAddEntryMenu: () => void;
  onOpenAddContact: () => void;
  onOpenStartConversation: () => void;
  onOpenCreateGroupConversation: () => void;
  onOpenQRScanner: () => void;
  onOpenConversation: (conversation: Conversation) => void;
  onToggleConversationMute: (conversation: Conversation) => void;
  onDeleteConversation: (conversation: Conversation) => void;
  onToggleConversationArchive: (conversation: Conversation) => void;
  onToggleConversationRead: (conversation: Conversation) => void;
  onToggleConversationPin: (conversation: Conversation) => void;
  onOpenContactProfile: (contact: ContactListItem) => void;
  onRemarkContact?: (contact: ContactListItem) => void;
  onSyncNow: () => void;
  onRefreshMeData: () => void;
  onOpenWorkspaceSearch: () => void;
  onOpenAttachmentCenter: () => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [archiveConversationsOpen, setArchiveConversationsOpen] =
    useState(false);
  const title =
    props.tab === "chats"
      ? t("home.tabs.chats")
      : props.tab === "contacts"
        ? t("home.tabs.contacts")
        : t("home.tabs.me");
  const isConnecting =
    props.realtimeStatus.status === "connecting" ||
    props.realtimeStatus.status === "reconnecting";
  const isOffline = props.realtimeStatus.status === "offline";
  const isSyncingMessages =
    props.realtimeStatus.status === "connected" &&
    props.catchingUp &&
    props.snapshot?.metrics.syncing === true;
  const visibleConversations = props.conversations.filter(
    conversation => Number(conversation.is_locally_deleted || 0) === 0
  );
  const archivedConversations = visibleConversations.filter(
    conversation => Number(conversation.is_archived || 0) > 0
  );
  const activeConversations = visibleConversations.filter(
    conversation => Number(conversation.is_archived || 0) === 0
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [contactsSearchQuery, setContactsSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"none" | "chats" | "contacts">(
    "none"
  );

  const filteredConversations = searchQuery.trim()
    ? activeConversations.filter(conversation => {
        const name = getConversationDisplayName(conversation).toLowerCase();
        return name.includes(searchQuery.trim().toLowerCase());
      })
    : activeConversations;
  const isChatArchivePage = props.tab === "chats" && archiveConversationsOpen;

  useEffect(() => {
    if (props.tab !== "chats") {
      setArchiveConversationsOpen(false);
    }
  }, [props.tab]);

  useEffect(() => {
    if (archiveConversationsOpen && archivedConversations.length === 0) {
      setArchiveConversationsOpen(false);
    }
  }, [archivedConversations.length, archiveConversationsOpen]);

  function handleChangeTab(tab: HomeTab) {
    setArchiveConversationsOpen(false);
    setSearchQuery("");
    setContactsSearchQuery("");
    setSearchMode("none");
    props.onChangeTab(tab);
  }

  function handleToggleArchivedConversationArchive(conversation: Conversation) {
    props.onToggleConversationArchive(conversation);
    setArchiveConversationsOpen(false);
  }

  function handleOpenArchivedConversations() {
    props.onCloseAddEntryMenu();
    setArchiveConversationsOpen(true);
  }

  return (
    <View style={styles.homeShell}>
      {props.tab === "chats" && !isChatArchivePage ? (
        <View style={styles.homeHeader}>
          <View style={styles.chatsHero}>
            <View style={styles.chatsHeroTop}>
              <Text style={styles.homeHeaderTitle}>{title}</Text>
              {isConnecting || isSyncingMessages ? (
                <View style={styles.connectionSpinner}>
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.textMuted}
                  />
                  <Text style={styles.connectionSpinnerText}>
                    {isSyncingMessages
                      ? t("home.receivingMessages")
                      : t("home.connectingMessages")}
                  </Text>
                </View>
              ) : null}
              <View style={styles.homeHeaderActions}>
                <Pressable
                  testID="home-add-entry-trigger"
                  style={({ pressed }) => [
                    styles.homeHeaderActionButton,
                    pressed && styles.homeHeaderActionButtonPressed
                  ]}
                  onPress={props.onOpenAddEntryMenu}
                >
                  <IconGlyph name="add" textStyle={styles.homeHeaderPlusIcon} />
                </Pressable>
              </View>
            </View>
            {isOffline ? (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>
                  {t("chatDetail.offlineBanner")}
                </Text>
              </View>
            ) : null}
            <Pressable
              onPress={() => setSearchMode("chats")}
              style={styles.homeSearchBar}
            >
              <Ionicons name="search" size={16} color={theme.colors.textSoft} />
              <Text style={styles.homeSearchPlaceholder}>
                {t("home.searchPlaceholder")}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : props.tab === "contacts" ? (
        <View style={styles.homeHeader}>
          <View style={styles.chatsHero}>
            <View style={styles.chatsHeroTop}>
              <Text style={styles.homeHeaderTitle}>{title}</Text>
              <View style={styles.homeHeaderActions}>
                <Pressable
                  testID="contacts-add-trigger"
                  style={({ pressed }) => [
                    styles.homeHeaderActionButton,
                    pressed && styles.homeHeaderActionButtonPressed
                  ]}
                  onPress={props.onOpenAddContact}
                >
                  <IconGlyph name="add" textStyle={styles.homeHeaderPlusIcon} />
                </Pressable>
              </View>
            </View>
            <Pressable
              onPress={() => setSearchMode("contacts")}
              style={styles.homeSearchBar}
            >
              <Ionicons name="search" size={16} color={theme.colors.textSoft} />
              <Text style={styles.homeSearchPlaceholder}>
                {t("home.searchPlaceholder")}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : isChatArchivePage ? (
        <View style={styles.chatArchiveHeader}>
          <Pressable
            style={({ pressed }) => [
              styles.chatArchiveBackButton,
              pressed ? styles.chatArchiveBackButtonPressed : null
            ]}
            onPress={() => setArchiveConversationsOpen(false)}
            testID="conversation-archive-back"
          >
            <IconGlyph name="back" textStyle={styles.chatArchiveBackIcon} />
          </Pressable>
        </View>
      ) : null}

      {props.addEntryMenuVisible ? (
        <View style={styles.homeActionMenuLayer} pointerEvents="box-none">
          <Pressable
            style={styles.homeActionMenuBackdrop}
            onPress={props.onCloseAddEntryMenu}
            testID="home-add-entry-backdrop"
          />
          <View style={styles.homeActionMenuCard} testID="home-add-entry-menu">
            <Pressable
              style={({ pressed }) => [
                styles.homeActionMenuItem,
                pressed && styles.homeActionMenuItemPressed
              ]}
              onPress={props.onOpenQRScanner}
              testID="home-qr-scanner-option"
            >
              <View style={styles.homeActionMenuIconWrap}>
                <IconGlyph
                  name="qr-scanner"
                  textStyle={styles.homeActionMenuIcon}
                />
              </View>
              <View style={styles.homeActionMenuTextWrap}>
                <Text style={styles.homeActionMenuTitle}>{t("home.scan")}</Text>
              </View>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.homeActionMenuItem,
                pressed && styles.homeActionMenuItemPressed
              ]}
              onPress={props.onOpenCreateGroupConversation}
              testID="home-add-group-option"
            >
              <View style={styles.homeActionMenuIconWrap}>
                <IconGlyph name="group" textStyle={styles.homeActionMenuIcon} />
              </View>
              <View style={styles.homeActionMenuTextWrap}>
                <Text style={styles.homeActionMenuTitle}>
                  {t("home.startGroup")}
                </Text>
              </View>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.homeActionMenuItem,
                pressed && styles.homeActionMenuItemPressed
              ]}
              onPress={props.onOpenStartConversation}
              testID="home-start-conversation-option"
            >
              <View style={styles.homeActionMenuIconWrap}>
                <IconGlyph
                  name="add-person"
                  textStyle={styles.homeActionMenuIcon}
                />
              </View>
              <View style={styles.homeActionMenuTextWrap}>
                <Text style={styles.homeActionMenuTitle}>
                  {t("home.startChat")}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.homeContent}>
        {isChatArchivePage ? (
          <View style={styles.chatListWrap}>
            <ChatsScreen
              conversations={archivedConversations}
              loginUserId={props.snapshot.auth.user?.userId}
              userPresenceByUserId={props.userPresenceByUserId}
              typersByConversationId={props.typersByConversationId}
              groupReadStateByConversation={props.groupReadStateByConversation}
              isReceiptsEnabled={props.isReceiptsEnabled}
              onDeleteConversation={props.onDeleteConversation}
              onOpenConversation={props.onOpenConversation}
              onToggleConversationArchive={
                handleToggleArchivedConversationArchive
              }
              onToggleConversationMute={props.onToggleConversationMute}
              onToggleConversationPin={props.onToggleConversationPin}
              onToggleConversationRead={props.onToggleConversationRead}
            />
          </View>
        ) : props.tab === "chats" ? (
          <View style={styles.chatListWrap}>
            <ChatsScreen
              conversations={filteredConversations}
              loginUserId={props.snapshot.auth.user?.userId}
              userPresenceByUserId={props.userPresenceByUserId}
              typersByConversationId={props.typersByConversationId}
              groupReadStateByConversation={props.groupReadStateByConversation}
              isReceiptsEnabled={props.isReceiptsEnabled}
              archivedConversationCount={archivedConversations.length}
              syncing={props.snapshot.metrics.syncing}
              hasEverSynced={Boolean(props.snapshot.metrics.completedAt)}
              onDeleteConversation={props.onDeleteConversation}
              onOpenArchivedConversations={handleOpenArchivedConversations}
              onOpenConversation={props.onOpenConversation}
              onToggleConversationArchive={props.onToggleConversationArchive}
              onToggleConversationMute={props.onToggleConversationMute}
              onToggleConversationPin={props.onToggleConversationPin}
              onToggleConversationRead={props.onToggleConversationRead}
            />
          </View>
        ) : props.tab === "contacts" ? (
          <ContactsScreen
            availableContacts={props.availableContacts}
            searchQuery={contactsSearchQuery}
            onOpenContactProfile={props.onOpenContactProfile}
            onRemarkContact={props.onRemarkContact}
          />
        ) : (
          <MeScreen
            snapshot={props.snapshot}
            onRefreshMeData={props.onRefreshMeData}
            onLogout={props.onLogout}
          />
        )}
      </View>

      <View
        style={[
          styles.bottomTabs,
          { paddingBottom: Math.max(insets.bottom, 6) }
        ]}
      >
        <TabButton
          label={t("home.tabs.chats")}
          icon="chat"
          active={props.tab === "chats"}
          onPress={() => handleChangeTab("chats")}
        />
        <TabButton
          label={t("home.tabs.contacts")}
          icon="contacts"
          active={props.tab === "contacts"}
          testID="home-contacts-tab"
          onPress={() => handleChangeTab("contacts")}
        />
        <TabButton
          label={t("home.tabs.me")}
          icon="settings"
          active={props.tab === "me"}
          onPress={() => handleChangeTab("me")}
        />
      </View>

      <SearchOverlay
        visible={searchMode !== "none"}
        query={searchMode === "chats" ? searchQuery : contactsSearchQuery}
        onChangeQuery={
          searchMode === "chats" ? setSearchQuery : setContactsSearchQuery
        }
        onClose={() => {
          setSearchQuery("");
          setContactsSearchQuery("");
          setSearchMode("none");
        }}
        placeholder={t("home.searchPlaceholder")}
        emptyLabel={t("home.searchEmpty")}
      >
        {searchMode === "chats" ? (
          <ChatsScreen
            conversations={filteredConversations}
            loginUserId={props.snapshot.auth.user?.userId}
            userPresenceByUserId={props.userPresenceByUserId}
            typersByConversationId={props.typersByConversationId}
            groupReadStateByConversation={props.groupReadStateByConversation}
            isReceiptsEnabled={props.isReceiptsEnabled}
            archivedConversationCount={archivedConversations.length}
            syncing={props.snapshot.metrics.syncing}
            hasEverSynced={Boolean(props.snapshot.metrics.completedAt)}
            onDeleteConversation={props.onDeleteConversation}
            onOpenArchivedConversations={handleOpenArchivedConversations}
            onOpenConversation={props.onOpenConversation}
            onToggleConversationArchive={props.onToggleConversationArchive}
            onToggleConversationMute={props.onToggleConversationMute}
            onToggleConversationPin={props.onToggleConversationPin}
            onToggleConversationRead={props.onToggleConversationRead}
          />
        ) : (
          <ContactsScreen
            availableContacts={props.availableContacts}
            searchQuery={contactsSearchQuery}
            onOpenContactProfile={props.onOpenContactProfile}
            onRemarkContact={props.onRemarkContact}
          />
        )}
      </SearchOverlay>
    </View>
  );
}

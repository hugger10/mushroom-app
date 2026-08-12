import type { Conversation, UserPresenceSummary } from "@mushroom/shared";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Lucide from "@react-native-vector-icons/lucide/static";
import type { LucideIconName } from "@react-native-vector-icons/lucide/static";
import Ionicons from "react-native-vector-icons/Ionicons";
import { BottomSheet, ChatListSkeleton, EmptyState } from "../components/ui";
import {
  ConversationSwipeRow,
  type ConversationSwipeAction,
  type ConversationSwipeRowHandle
} from "../features/chat";
import { useAppTheme } from "../styles/app-styles";
import { getConversationDisplayName } from "../utils/display";

export function ChatsScreen(props: {
  conversations: Conversation[];
  loginUserId?: number | null;
  userPresenceByUserId?: Record<number, UserPresenceSummary>;
  /**
   * 群已读高水位（key = server_conversation_id）。由本地缓存回灌到
   * controller 的 `groupReadStateByConversation`，用于列表行渲染群消息已读勾。
   */
  groupReadStateByConversation?: Record<string, Record<number, number>>;
  /**
   * 当前所有会话的输入中状态（key = server_conversation_id）。
   * 用于在列表行第二行渲染 "正在输入…" / "Alice 正在输入…"。
   */
  typersByConversationId?: Record<
    string,
    Record<number, { activity: "text" | "voice" }>
  >;
  /** 当前用户的"已读回执"开关；false 时列表行不渲染 ✓✓ 兜底。 */
  isReceiptsEnabled?: boolean;
  archivedConversationCount?: number;
  /** True while a `syncNow()` run is in progress. */
  syncing?: boolean;
  /**
   * Whether the controller has ever completed a sync for this account
   * (i.e. `metrics.completedAt` is set). Used together with `syncing` to
   * decide whether the empty conversation list means "first sync still in
   * flight, render a skeleton" or "really nothing to show, render the
   * empty state".
   */
  hasEverSynced?: boolean;
  onOpenArchivedConversations?: () => void;
  onOpenConversation: (conversation: Conversation) => void;
  onToggleConversationMute: (conversation: Conversation) => void;
  onDeleteConversation: (conversation: Conversation) => void;
  onToggleConversationArchive: (conversation: Conversation) => void;
  onToggleConversationRead: (conversation: Conversation) => void;
  onToggleConversationPin: (conversation: Conversation) => void;
}) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const [menuConversation, setMenuConversation] = useState<Conversation | null>(
    null
  );
  const swipeableRefs = useRef<
    Record<string, ConversationSwipeRowHandle | null>
  >({});
  const conversations = useMemo(
    () =>
      props.conversations.filter(
        conversation => Number(conversation.is_locally_deleted || 0) === 0
      ),
    [props.conversations]
  );
  const hasArchiveEntry =
    Number(props.archivedConversationCount || 0) > 0 &&
    Boolean(props.onOpenArchivedConversations);

  const closeSwipeables = useCallback((exceptConversationId?: string) => {
    Object.entries(swipeableRefs.current).forEach(([conversationId, ref]) => {
      if (!ref || conversationId === exceptConversationId) {
        return;
      }
      ref.close();
    });
  }, []);

  const runConversationAction = useCallback(
    (conversation: Conversation, action: (target: Conversation) => void) => {
      closeSwipeables();
      setMenuConversation(null);
      action(conversation);
    },
    [closeSwipeables]
  );

  const buildConversationActions = useCallback(
    (
      conversation: Conversation
    ): {
      left: ConversationSwipeAction[];
      right: ConversationSwipeAction[];
    } => {
      const hasUnread = Number(conversation.unread_count || 0) > 0;
      const isPinned = Number(conversation.is_pinned || 0) > 0;
      const isMuted = Number(conversation.is_muted || 0) > 0;
      const isArchived = Number(conversation.is_archived || 0) > 0;

      return {
        left: [
          {
            key: "read",
            label: hasUnread
              ? t("conversationList.read")
              : t("conversationList.unread"),
            icon: hasUnread ? "checkmark-done" : "mail-unread",
            circleColor: hasUnread ? theme.colors.success : theme.colors.accent,
            tintColor: theme.colors.textInverse,
            onPress: () =>
              runConversationAction(
                conversation,
                props.onToggleConversationRead
              )
          },
          {
            key: "pin",
            label: isPinned
              ? t("conversationList.unpin")
              : t("conversationList.pin"),
            icon: isPinned ? "pin-off" : "pin",
            iconSet: "lucide",
            circleColor: isPinned
              ? theme.colors.surfaceMuted
              : theme.colors.accentStrong,
            tintColor: isPinned ? theme.colors.text : theme.colors.textInverse,
            onPress: () =>
              runConversationAction(conversation, props.onToggleConversationPin)
          }
        ],
        right: [
          {
            key: "mute",
            label: isMuted
              ? t("conversationList.unmute")
              : t("conversationList.mute"),
            icon: isMuted ? "volume-high" : "volume-mute",
            circleColor: isMuted
              ? theme.colors.surfaceMuted
              : theme.colors.accentStrong,
            tintColor: isMuted ? theme.colors.text : theme.colors.textInverse,
            onPress: () =>
              runConversationAction(
                conversation,
                props.onToggleConversationMute
              )
          },
          {
            key: "delete",
            label: t("conversationList.deleteConversation"),
            icon: "trash",
            circleColor: theme.colors.danger,
            tintColor: theme.colors.textInverse,
            onPress: () =>
              runConversationAction(conversation, props.onDeleteConversation)
          },
          {
            key: "archive",
            label: isArchived
              ? t("conversationList.unarchive")
              : t("conversationList.archive"),
            icon: isArchived ? "archive-outline" : "archive",
            circleColor: isArchived ? theme.colors.surfaceMuted : "#B8BDC7",
            tintColor: isArchived
              ? theme.colors.text
              : theme.colors.textInverse,
            onPress: () =>
              runConversationAction(
                conversation,
                props.onToggleConversationArchive
              )
          }
        ]
      };
    },
    [
      t,
      theme,
      runConversationAction,
      props.onToggleConversationRead,
      props.onToggleConversationPin,
      props.onToggleConversationMute,
      props.onDeleteConversation,
      props.onToggleConversationArchive
    ]
  );

  const renderItem = useCallback(
    ({ item: conversation }: { item: Conversation }) => {
      const actions = buildConversationActions(conversation);
      const peerPresence =
        conversation.type === 1 && conversation.peer_id
          ? (props.userPresenceByUserId?.[Number(conversation.peer_id)] ?? null)
          : null;
      // 群已读：从 controller 缓存里挑当前会话的高水位 map。
      const groupReadState =
        conversation.type !== 1 && conversation.server_conversation_id
          ? (props.groupReadStateByConversation?.[
              String(conversation.server_conversation_id)
            ] ?? null)
          : null;
      // 输入中状态：列表层按会话 id 直接查 typer 映射。
      const typers = conversation.server_conversation_id
        ? (props.typersByConversationId?.[
            String(conversation.server_conversation_id)
          ] ?? null)
        : null;
      return (
        <ConversationSwipeRow
          conversation={conversation}
          loginUserId={props.loginUserId}
          peerPresence={peerPresence}
          groupReadState={groupReadState}
          typers={typers}
          isReceiptsEnabled={props.isReceiptsEnabled}
          leftActions={actions.left}
          onLongPress={() => {
            closeSwipeables();
            setMenuConversation(conversation);
          }}
          onPress={() => props.onOpenConversation(conversation)}
          onRequestCloseOthers={() =>
            closeSwipeables(conversation.client_conversation_id)
          }
          ref={instance => {
            swipeableRefs.current[conversation.client_conversation_id] =
              instance;
          }}
          rightActions={actions.right}
        />
      );
    },
    [
      props.userPresenceByUserId,
      props.groupReadStateByConversation,
      props.typersByConversationId,
      props.isReceiptsEnabled,
      props.loginUserId,
      props.onOpenConversation,
      buildConversationActions,
      closeSwipeables
    ]
  );

  // 行外派生数据：仅当 typing/presence/已读高水位/回执开关之一变化时才失效，
  // 避免每次父组件渲染都重建对象导致 FlatList 全量重跑 renderItem。
  const listExtraData = useMemo(
    () => ({
      typers: props.typersByConversationId,
      presence: props.userPresenceByUserId,
      groupRead: props.groupReadStateByConversation,
      receipts: props.isReceiptsEnabled
    }),
    [
      props.typersByConversationId,
      props.userPresenceByUserId,
      props.groupReadStateByConversation,
      props.isReceiptsEnabled
    ]
  );

  if (conversations.length === 0 && !hasArchiveEntry) {
    // During the first sync of a brand-new login the conversation list is
    // legitimately empty for a few seconds. Show a skeleton instead of the
    // "no conversations" empty state so the screen does not flash an
    // empty-state-then-data jank.
    if (props.syncing && !props.hasEverSynced) {
      return <ChatListSkeleton />;
    }
    return <EmptyState label={t("conversationList.empty")} />;
  }

  const listHeader = hasArchiveEntry ? (
    <View>
      <Pressable
        style={({ pressed }) => [
          styles.conversationArchiveEntry,
          pressed ? styles.conversationArchiveEntryPressed : null
        ]}
        onPress={props.onOpenArchivedConversations}
        testID="conversation-archive-entry"
      >
        <View style={styles.conversationArchiveEntryIcon}>
          <Ionicons
            color={theme.colors.textMuted}
            name="archive-outline"
            size={17}
          />
        </View>
        <Text style={styles.conversationArchiveEntryText}>
          {t("conversationList.archivedConversations")}
        </Text>
        <Ionicons
          color={theme.colors.textSoft}
          name="chevron-forward"
          size={16}
        />
      </Pressable>
    </View>
  ) : null;

  return (
    <>
      <FlatList
        data={conversations}
        keyExtractor={item => item.client_conversation_id}
        renderItem={renderItem}
        // 当 typing / presence / 已读高水位等"行外派生数据"变化时，
        // 必须显式把它们塞进 extraData 才能让 FlatList 重新调用 renderItem。
        // 否则 conversation item 引用未变 → 行被跳过，输入中状态不会显示。
        extraData={listExtraData}
        ListHeaderComponent={listHeader}
        style={styles.chatsList}
        contentContainerStyle={styles.chatsListContent}
        showsVerticalScrollIndicator={false}
        // 上滑/下滑到边缘时提供弹簧回弹效果，与聊天详情消息列表一致
        bounces
        alwaysBounceVertical
        overScrollMode="always"
        // Conversation list is bounded (typically < few hundred items) and
        // each row is composed of a Reanimated swipeable + ConversationRow;
        // FlatList's intrinsic-height measurement is more forgiving than
        // FlashList v2 for this composition. See T11 regression notes.
        keyboardShouldPersistTaps="handled"
      />

      <BottomSheet
        visible={Boolean(menuConversation)}
        onClose={() => setMenuConversation(null)}
        title={
          menuConversation
            ? getConversationDisplayName(menuConversation)
            : undefined
        }
        testID="conversation-actions-sheet"
        containerStyle={styles.conversationActionsSheet}
      >
        {menuConversation ? (
          <>
            <Text style={styles.conversationActionsSubtitle}>
              {t("conversationList.actionsHint")}
            </Text>
            <View style={styles.conversationActionsList}>
              {buildConversationActions(menuConversation)
                .left.concat(buildConversationActions(menuConversation).right)
                .map(action => (
                  <Pressable
                    key={`${menuConversation.client_conversation_id}:${action.key}:sheet`}
                    onPress={action.onPress}
                    style={styles.conversationActionItem}
                    testID={`conversation-sheet-action-${action.key}`}
                  >
                    <View
                      style={[
                        styles.conversationActionItemIcon,
                        { backgroundColor: action.circleColor }
                      ]}
                    >
                      {action.iconSet === "lucide" ? (
                        <Lucide
                          color={action.tintColor}
                          name={action.icon as LucideIconName}
                          size={22}
                        />
                      ) : (
                        <Ionicons
                          color={action.tintColor}
                          name={action.icon}
                          size={22}
                        />
                      )}
                    </View>
                    <Text style={styles.conversationActionItemLabel}>
                      {action.label}
                    </Text>
                  </Pressable>
                ))}
            </View>
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}

import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Lucide from "@react-native-vector-icons/lucide/static";
import type { LucideIconName } from "@react-native-vector-icons/lucide/static";
import Ionicons from "react-native-vector-icons/Ionicons";
import {
  getTextMessageText,
  isFileMessageContent,
  isImageFileMessageContent,
  isVideoFileMessageContent,
  isVoiceMessageContent,
  type Message,
  type MessageReactionEntry
} from "@mushroom/shared";
import { BottomSheet } from "../../components/ui";
import { useAppTheme } from "../../styles/app-styles";
import { QUICK_REACTION_EMOJIS } from "./EmojiPickerSheet";

/**
 * Kept exported for backward compat with call-sites that still type the
 * anchor; new BottomSheet implementation ignores anchor coordinates.
 */
export type MessageMenuAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MenuAction = {
  key: string;
  label: string;
  icon: string;
  iconSet?: "lucide";
  tone?: "danger";
  onPress: () => void;
};

/**
 * MessageContextMenu (T15 — Phase B).
 *
 * Replaced the previous bespoke `Modal` + `Animated` + `measureInWindow` +
 * `setTimeout(...handler, 60)` reveal with `@gorhom/bottom-sheet`. The native
 * sheet handles enter/exit, backdrop dismiss, and pan-to-close on the UI
 * thread, and dispatching actions no longer races a JS-driven close
 * animation. Quick-reaction bar is rendered as a header row inside the sheet.
 *
 * iOS-native `ContextMenuView` wrapping per-bubble is a polish follow-up; the
 * gorhom sheet path here already removes the JS-bridge antipatterns called
 * out in the Phase B plan.
 */
export function MessageContextMenu(props: {
  visible: boolean;
  message: Message | null;
  anchor: MessageMenuAnchor | null;
  isOwn: boolean;
  replyTargetId: string | null;
  canRecall: boolean;
  currentUserId?: number | null;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onTogglePin: (message: Message) => void;
  onRecall: (message: Message) => void;
  onMultiSelect?: (message: Message) => void;
  onReact?: (message: Message, emoji: string | null) => void;
  onOpenEmojiPicker?: (message: Message) => void;
  /**
   * 仅当自己的消息且会话为群（type !== 1）时由调用方传入，传入即追加
   * "查看已读" 入口。调用方负责打开已读详情面板。
   */
  onViewReadReceipts?: (message: Message) => void;
  /**
   * 失败附件草稿 (status===-1 && !server_message_id && type===2)。
   * 调用方判定后置为 true 时：菜单只保留单一"删除"项，且隐藏 reaction bar，
   * 与 WhatsApp / Telegram 对待"未发出"消息的菜单一致。
   */
  isFailedDraft?: boolean;
  /** 上面 isFailedDraft 时触发的删除回调，无二次确认。 */
  onDeleteFailedMessage?: (message: Message) => void;
  /** 保存图片或视频到系统相册。调用方负责处理权限/反馈。 */
  onSaveToAlbum?: (message: Message) => void;
  /** 保存文件/普通音频到手机本地（排除语音消息）。调用方负责处理下载/反馈。 */
  onSaveToFile?: (message: Message) => void;
  /** 复制文字消息文本到系统剪贴板。调用方负责执行复制与反馈。 */
  onCopyMessage?: (message: Message) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const message = props.message;

  // Build action list lazily; safe even when message is null.
  const actions: MenuAction[] = [];
  if (message && props.isFailedDraft && props.onDeleteFailedMessage) {
    // 失败本地草稿：唯一操作 = 删除（无二次确认）。
    actions.push({
      key: "delete-failed",
      label: t("chat.delete"),
      icon: "trash-outline",
      tone: "danger",
      onPress: () => props.onDeleteFailedMessage!(message)
    });
  } else if (message) {
    if (
      props.onSaveToAlbum &&
      (isImageFileMessageContent(message.content) ||
        isVideoFileMessageContent(message.content))
    ) {
      actions.push({
        key: "save-to-album",
        label: t("chatMessage.saveToAlbum"),
        icon: "download-outline",
        onPress: () => props.onSaveToAlbum!(message)
      });
    }
    if (
      props.onSaveToFile &&
      isFileMessageContent(message.content) &&
      !isImageFileMessageContent(message.content) &&
      !isVideoFileMessageContent(message.content) &&
      !isVoiceMessageContent(message.content)
    ) {
      actions.push({
        key: "save-to-file",
        label: t("chatMessage.saveToFile"),
        icon: "save-outline",
        onPress: () => props.onSaveToFile!(message)
      });
    }
    if (
      props.onCopyMessage &&
      !message.is_recalled &&
      getTextMessageText(message.content) !== null
    ) {
      actions.push({
        key: "copy",
        label: t("chatMessage.copy"),
        icon: "copy-outline",
        onPress: () => props.onCopyMessage!(message)
      });
    }
    actions.push({
      key: "reply",
      label: t("chat.reply"),
      icon: "arrow-undo-outline",
      onPress: () => props.onReply(message)
    });
    actions.push({
      key: "forward",
      label: t("chatMessage.forward"),
      icon: "arrow-redo-outline",
      onPress: () => props.onForward(message)
    });
    actions.push({
      key: "pin",
      label: message.is_pinned ? t("chatMessage.unpin") : t("chatMessage.pin"),
      icon: message.is_pinned ? "pin-off" : "pin",
      iconSet: "lucide",
      onPress: () => props.onTogglePin(message)
    });
    if (props.canRecall) {
      actions.push({
        key: "recall",
        label: t("chat.recall"),
        icon: "close-circle-outline",
        tone: "danger",
        onPress: () => props.onRecall(message)
      });
    }
    if (props.onMultiSelect) {
      actions.push({
        key: "multi-select",
        label: t("chatMessage.multiSelect"),
        icon: "checkbox-outline",
        onPress: () => props.onMultiSelect!(message)
      });
    }
    if (props.onViewReadReceipts && props.isOwn) {
      actions.push({
        key: "view-read",
        label: t("chat.viewReadReceipts"),
        icon: "eye-outline",
        onPress: () => props.onViewReadReceipts!(message)
      });
    }
  }

  const showReactionBar =
    !props.isFailedDraft &&
    Boolean(props.onReact) &&
    Boolean(message) &&
    Number(message?.is_recalled || 0) === 0;

  const myReactionEmoji = ((): string | null => {
    if (!message || !props.currentUserId) return null;
    const list: MessageReactionEntry[] = (message.reactions ??
      []) as MessageReactionEntry[];
    const mine = list.find(
      item => Number(item.user_id) === Number(props.currentUserId)
    );
    return mine?.emoji ?? null;
  })();

  const isDark = theme.mode === "dark";
  const textColor = isDark ? "#F5F5F5" : "#1C1C1E";
  const dangerColor = theme.colors.danger;
  const separatorColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const hoverBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

  function handleAction(action: MenuAction) {
    // Close first; gorhom dismisses on UI thread and the parent can flip its
    // own state synchronously after action.onPress() resolves.
    props.onClose();
    action.onPress();
  }

  function handleReact(emoji: string, selected: boolean) {
    if (!message) return;
    props.onClose();
    props.onReact?.(message, selected ? null : emoji);
  }

  function handleOpenPicker() {
    if (!message) return;
    props.onClose();
    props.onOpenEmojiPicker?.(message);
  }

  return (
    <BottomSheet
      visible={props.visible && Boolean(message)}
      onClose={props.onClose}
      testID="message-context-menu"
      containerStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      {showReactionBar && message ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderBottomWidth: 0.5,
            borderBottomColor: separatorColor
          }}
        >
          {QUICK_REACTION_EMOJIS.map(emoji => {
            const selected = myReactionEmoji === emoji;
            return (
              <Pressable
                key={emoji}
                onPress={() => handleReact(emoji, selected)}
                style={({ pressed }) => ({
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  alignItems: "center",
                  justifyContent: "center",
                  marginHorizontal: 2,
                  backgroundColor: selected || pressed ? hoverBg : "transparent"
                })}
                testID={`message-context-reaction-${emoji}`}
              >
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </Pressable>
            );
          })}
          {props.onOpenEmojiPicker ? (
            <Pressable
              onPress={handleOpenPicker}
              style={({ pressed }) => ({
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: "center",
                justifyContent: "center",
                marginHorizontal: 2,
                backgroundColor: pressed ? hoverBg : "transparent"
              })}
              testID="message-context-reaction-more"
            >
              <Ionicons name="add" size={22} color={textColor} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={{ paddingVertical: 4 }}>
        {actions.map((action, index) => (
          <View key={action.key}>
            <Pressable
              onPress={() => handleAction(action)}
              android_ripple={{ color: hoverBg }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                height: 48,
                paddingHorizontal: 20,
                backgroundColor: pressed ? hoverBg : "transparent"
              })}
              testID={`message-context-action-${action.key}`}
            >
              {action.iconSet === "lucide" ? (
                <Lucide
                  name={action.icon as LucideIconName}
                  size={20}
                  color={action.tone === "danger" ? dangerColor : textColor}
                  style={{ marginRight: 14, width: 20, textAlign: "center" }}
                />
              ) : (
                <Ionicons
                  name={action.icon}
                  size={20}
                  color={action.tone === "danger" ? dangerColor : textColor}
                  style={{ marginRight: 14, width: 20, textAlign: "center" }}
                />
              )}
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "400",
                  color: action.tone === "danger" ? dangerColor : textColor
                }}
              >
                {action.label}
              </Text>
            </Pressable>
            {index < actions.length - 1 ? (
              <View
                style={{
                  height: 0.5,
                  backgroundColor: separatorColor,
                  marginHorizontal: 20
                }}
              />
            ) : null}
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

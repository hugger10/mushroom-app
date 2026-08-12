import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import {
  BottomSheetTextInput,
  type BottomSheetModal as BottomSheetModalType
} from "@gorhom/bottom-sheet";
import type { Conversation, Message } from "@mushroom/shared";
import {
  getMessageSummaryText,
  MAX_TEXT_LENGTH,
  SEARCH_KEYWORD_MAX_LENGTH
} from "@mushroom/shared";
import {
  AppAvatar,
  BottomSheet,
  GroupAvatar,
  SaveHeaderButton
} from "../../components/ui";
import { useAppTheme } from "../../styles/app-styles";
import { colorFromSeed } from "../../styles/theme";
import type { BatchForwardMode } from "../../app/controller/state/useChatInteractionState";
import {
  getConversationAvatarSeed,
  getConversationDisplayAvatar,
  getConversationDisplayName
} from "../../utils/display";

export function ForwardPanel(props: {
  forwardingMessageId: string | null;
  batchForwardMode?: BatchForwardMode | null;
  batchCount?: number;
  conversations: Conversation[];
  previewMessages?: Message[];
  onCancel: () => void;
  onForwardToConversation: (
    conversationId: string,
    extraMessage?: string
  ) => void;
}) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const [searchText, setSearchText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [extraMessage, setExtraMessage] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const confirmSheetRef = useRef<BottomSheetModalType>(null);
  const prevKeyboardHeightRef = useRef(0);

  // Track the keyboard height so the confirm sheet can be lifted above it via
  // `bottomInset`. gorhom re-snaps the sheet up when `bottomInset` grows but
  // never snaps it back down when the keyboard hides, so we force it back to
  // its content-sized bottom detent with `expand()` on keyboard hide.
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, e =>
      setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!showConfirmModal) return;
    const sheet = confirmSheetRef.current;
    if (!sheet) return;
    if (keyboardHeight === 0 && prevKeyboardHeightRef.current > 0) {
      // Wait one frame so the layout reaction has applied the restored
      // container height before snapping back to the bottom detent.
      requestAnimationFrame(() => {
        sheet.expand();
      });
    }
    prevKeyboardHeightRef.current = keyboardHeight;
  }, [keyboardHeight, showConfirmModal]);

  const isVisible =
    props.forwardingMessageId != null || props.batchForwardMode != null;

  useEffect(() => {
    if (isVisible) {
      setSelectedId(null);
      setSearchText("");
      setExtraMessage("");
      setShowConfirmModal(false);
      setShowDetailModal(false);
      setKeyboardHeight(0);
      prevKeyboardHeightRef.current = 0;
    }
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  const filteredList = searchText.trim()
    ? props.conversations.filter(c => {
        const name = (c.display_name || c.name || "").toLowerCase();
        return name.includes(searchText.trim().toLowerCase());
      })
    : props.conversations;

  const selectedConversation = selectedId
    ? props.conversations.find(c => c.client_conversation_id === selectedId)
    : null;

  function handleNext() {
    if (!selectedConversation) return;
    Keyboard.dismiss();
    // Present the sheet at the bottom (bottomInset 0) regardless of the search
    // keyboard still collapsing, so the keyboard-hide recovery never races the
    // sheet's initial presentation.
    setKeyboardHeight(0);
    prevKeyboardHeightRef.current = 0;
    setShowConfirmModal(true);
  }

  function handleConfirmSend() {
    if (!selectedConversation) return;
    props.onForwardToConversation(
      selectedConversation.client_conversation_id,
      extraMessage.trim() || undefined
    );
    setSelectedId(null);
    setSearchText("");
    setExtraMessage("");
    setShowConfirmModal(false);
    prevKeyboardHeightRef.current = 0;
  }

  function handleCancelConfirm() {
    setShowConfirmModal(false);
    setShowDetailModal(false);
    prevKeyboardHeightRef.current = 0;
  }

  const targetName = selectedConversation
    ? getConversationDisplayName(selectedConversation)
    : "";

  const previewMessages = props.previewMessages ?? [];
  const msgCount = previewMessages.length;
  const isBatch = props.batchForwardMode != null;
  const modeLabel =
    props.batchForwardMode === "merged"
      ? t("chatMessage.forwardMerged")
      : t("chatMessage.forwardOneByOne");
  const cardLabel = isBatch
    ? `[${modeLabel}] ${t("chatMessage.nMessages", { count: msgCount })}`
    : t("chatMessage.forwardSingle");

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.colors.background,
        zIndex: 100
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 8,
          paddingBottom: 10,
          paddingHorizontal: 16
        }}
      >
        <Pressable onPress={props.onCancel}>
          <Text style={{ fontSize: 15, color: theme.colors.text }}>
            {t("common.cancel")}
          </Text>
        </Pressable>
        <Text
          style={{ fontSize: 16, fontWeight: "600", color: theme.colors.text }}
        >
          {t("chatMessage.selectConversation")}
        </Text>
        <Pressable onPress={handleNext} disabled={!selectedId}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: "500",
              color: selectedId ? "#07c160" : "#a8dfc0"
            }}
          >
            {t("createGroup.next")}
          </Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.inputBg ?? "#f5f5f5",
            borderRadius: 8,
            paddingHorizontal: 10,
            height: 34
          }}
        >
          <Ionicons name="search" size={16} color="#bbb" />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder={t("conversationList.searchPlaceholder")}
            placeholderTextColor="#bbb"
            maxLength={SEARCH_KEYWORD_MAX_LENGTH}
            style={{
              flex: 1,
              marginLeft: 6,
              fontSize: 14,
              color: theme.colors.text,
              padding: 0
            }}
          />
          {searchText ? (
            <Pressable onPress={() => setSearchText("")}>
              <Ionicons name="close-circle" size={16} color="#ccc" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Conversation list */}
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        {filteredList.map(conversation => {
          const id = conversation.client_conversation_id;
          const displayName = getConversationDisplayName(conversation);
          const avatarUrl = getConversationDisplayAvatar(conversation);
          const avatarColor = colorFromSeed(
            displayName || id,
            theme.avatarPalette
          );
          const isChecked = selectedId === id;
          const isGroup = conversation.type === 2;
          const showGroupAvatar = isGroup && !avatarUrl;

          return (
            <Pressable
              key={id}
              onPress={() => setSelectedId(isChecked ? null : id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 10,
                backgroundColor: isChecked
                  ? "rgba(7,193,96,0.06)"
                  : "transparent"
              }}
            >
              {/* Checkbox */}
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: isChecked ? "#07c160" : "#d0d0d0",
                  backgroundColor: isChecked ? "#07c160" : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12
                }}
              >
                {isChecked ? (
                  <Ionicons name="checkmark" size={13} color="#fff" />
                ) : null}
              </View>

              {/* Avatar */}
              {showGroupAvatar ? (
                <GroupAvatar
                  seed={getConversationAvatarSeed(conversation)}
                  name={displayName}
                  size={48}
                  style={{ marginRight: 12 }}
                />
              ) : (
                <AppAvatar
                  label={displayName}
                  imageUrl={avatarUrl}
                  style={[styles.rowAvatar, { backgroundColor: avatarColor }]}
                  textStyle={styles.rowAvatarText}
                />
              )}

              {/* Name */}
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontSize: 15,
                  color: theme.colors.text
                }}
              >
                {displayName}
              </Text>
            </Pressable>
          );
        })}
        {filteredList.length === 0 ? (
          <Text
            style={{
              textAlign: "center",
              color: "#999",
              fontSize: 13,
              paddingVertical: 32
            }}
          >
            {t("chatMessage.noMatching")}
          </Text>
        ) : null}
      </ScrollView>
      {/* Confirm + detail sheet (T14 — single gorhom BottomSheet, swaps body) */}
      <BottomSheet
        ref={confirmSheetRef}
        visible={showConfirmModal}
        onClose={handleCancelConfirm}
        testID="forward-confirm-sheet"
        bottomInset={keyboardHeight}
      >
        <View>
          {/* Header: back arrow / title / send button */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 4,
              paddingBottom: 10,
              minHeight: 56
            }}
          >
            <Pressable
              onPress={() =>
                showDetailModal
                  ? setShowDetailModal(false)
                  : handleCancelConfirm()
              }
              hitSlop={8}
              testID="forward-detail-back"
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Ionicons
                name="chevron-back"
                size={28}
                color={theme.colors.text}
              />
            </Pressable>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 18,
                fontWeight: "700",
                color: theme.colors.text
              }}
            >
              {showDetailModal
                ? cardLabel
                : t("chatMessage.sendTo", { name: targetName })}
            </Text>
            <View style={{ minWidth: 44, alignItems: "flex-end" }}>
              <SaveHeaderButton
                onPress={handleConfirmSend}
                pending={false}
                title={t("chat.send")}
                testID="forward-confirm-send"
              />
            </View>
          </View>

          {showDetailModal ? (
            <ScrollView
              style={{ maxHeight: 360 }}
              keyboardShouldPersistTaps="handled"
            >
              {previewMessages.map((m, idx) => {
                const sender =
                  m.sender_nickname ||
                  t("chatMessage.unknownUser", { id: m.sender_id });
                const summary = getMessageSummaryText(m.content, t);
                const avatarColor = colorFromSeed(sender, theme.avatarPalette);
                return (
                  <View
                    key={m.client_message_id || idx}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 10,
                      borderBottomWidth:
                        idx < previewMessages.length - 1 ? 0.5 : 0,
                      borderBottomColor: theme.colors.border
                    }}
                  >
                    <AppAvatar
                      label={sender}
                      imageUrl={m.sender_avatar}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: avatarColor,
                        marginRight: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0
                      }}
                      textStyle={{
                        fontSize: 14,
                        color: "#fff",
                        lineHeight: 36
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          color: "#999",
                          marginBottom: 2
                        }}
                      >
                        {sender}
                      </Text>
                      <Text
                        style={{ fontSize: 14, color: theme.colors.text }}
                        numberOfLines={3}
                      >
                        {summary}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <View style={{ paddingTop: 4, paddingBottom: 8 }}>
              <Pressable
                onPress={() => setShowDetailModal(true)}
                style={{
                  backgroundColor: theme.colors.inputBg ?? "#f5f5f5",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flex: 1
                  }}
                >
                  <Ionicons
                    name={
                      isBatch && props.batchForwardMode === "merged"
                        ? "documents-outline"
                        : "chatbubbles-outline"
                    }
                    size={18}
                    color={theme.colors.textSoft}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={{
                      fontSize: 14,
                      color: theme.colors.text,
                      flex: 1
                    }}
                    numberOfLines={1}
                  >
                    {cardLabel}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={theme.colors.textMuted}
                />
              </Pressable>

              <BottomSheetTextInput
                value={extraMessage}
                onChangeText={setExtraMessage}
                placeholder={t("chatMessage.leaveMessage")}
                placeholderTextColor="#bbb"
                multiline
                maxLength={MAX_TEXT_LENGTH}
                style={{
                  minHeight: 44,
                  maxHeight: 88,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: theme.colors.inputBg ?? "#f5f5f5",
                  fontSize: 14,
                  color: theme.colors.text,
                  textAlignVertical: "top"
                }}
              />
            </View>
          )}
        </View>
      </BottomSheet>
    </View>
  );
}

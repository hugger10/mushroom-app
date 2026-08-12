import type {
  MobileMessageSearchFilter,
  MobileMessageSearchResult
} from "@mushroom/app-core";
import { Conversation, UserPresenceSummary } from "@mushroom/shared";
import { formatLastActiveTime } from "@mushroom/shared";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { PressableRow } from "../../../hooks/usePressAnimation";
import {
  AppAvatar,
  GroupAvatar,
  IconGlyph,
  TypingDots
} from "../../../components/ui";
import { ChatSearchHeader } from "../../../features/chat";
import { useAppTheme } from "../../../styles/app-styles";
import { colorFromSeed } from "../../../styles/theme";
import {
  getConversationAvatarSeed,
  getConversationDisplayAvatar,
  getConversationDisplayName
} from "../../../utils/display";

export type ChatDetailHeaderProps = {
  activeConversation: Conversation;
  isDirectConversation: boolean;
  peerPresence: UserPresenceSummary | null;
  isPeerTyping: boolean;
  peerTypingActivity?: "text" | "voice" | null;
  groupTypingSubtitle?: string | null;
  isSearchVisible: boolean;
  searchKeyword: string;
  searchFilter: MobileMessageSearchFilter;
  searchResults: MobileMessageSearchResult[];
  searchCurrentIndex: number;
  isSearchNavigating?: boolean;
  onBack: () => void;
  onOpenPeerProfile: () => void;
  onOpenGroupManage: () => void;
  onChangeSearchKeyword: (value: string) => void;
  onCancelSearch: () => void;
  onSearchPrev: () => void;
  onSearchNext: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
};

export function ChatDetailHeader(props: ChatDetailHeaderProps) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const displayName = getConversationDisplayName(props.activeConversation);
  const displayAvatar = getConversationDisplayAvatar(props.activeConversation);
  const avatarColor = colorFromSeed(displayName || "chat", theme.avatarPalette);
  const isPeerOnline = Boolean(props.peerPresence?.is_online);
  const peerStatusText = props.isPeerTyping
    ? t("chatDetail.typing")
    : isPeerOnline
      ? t("chatDetail.online")
      : formatLastActiveTime(props.peerPresence?.last_active_at);
  const resolvedPeerStatusText = props.groupTypingSubtitle
    ? props.groupTypingSubtitle
    : props.isPeerTyping
      ? props.peerTypingActivity === "voice"
        ? t("chatDetail.recording")
        : t("chatDetail.typing")
      : isPeerOnline
        ? t("chatDetail.online")
        : peerStatusText;

  if (props.isSearchVisible) {
    return (
      <ChatSearchHeader
        keyword={props.searchKeyword}
        onChangeKeyword={props.onChangeSearchKeyword}
        onCancel={props.onCancelSearch}
        matchCount={props.searchResults.length}
        currentIndex={props.searchCurrentIndex}
        onPrev={props.onSearchPrev}
        onNext={props.onSearchNext}
        isNavigating={props.isSearchNavigating}
      />
    );
  }

  return (
    <View style={styles.chatHeader}>
      <View style={styles.chatHeaderLead}>
        <PressableRow
          style={styles.backButton}
          onPress={props.onBack}
          idleColor="transparent"
        >
          <IconGlyph name="back" textStyle={styles.backButtonText} />
        </PressableRow>
        <Pressable
          onPress={
            props.isDirectConversation
              ? props.onOpenPeerProfile
              : props.onOpenGroupManage
          }
          style={styles.chatHeaderAvatarWrap}
        >
          {!props.isDirectConversation && !displayAvatar ? (
            <GroupAvatar
              seed={getConversationAvatarSeed(props.activeConversation)}
              name={displayName}
              size={36}
            />
          ) : (
            <AppAvatar
              label={displayName}
              imageUrl={displayAvatar}
              style={[
                styles.chatHeaderAvatar,
                { backgroundColor: avatarColor }
              ]}
              textStyle={styles.chatHeaderAvatarText}
            />
          )}
        </Pressable>
      </View>
      <Pressable
        onPress={
          props.isDirectConversation
            ? props.onOpenPeerProfile
            : props.onOpenGroupManage
        }
        style={styles.chatHeaderTextWrap}
      >
        <Text numberOfLines={1} style={styles.chatTitle}>
          {props.isDirectConversation
            ? displayName
            : `${displayName} (${props.activeConversation.members?.length ?? 0})`}
        </Text>
        {props.isDirectConversation ? (
          <View style={styles.chatLiveStatus}>
            <View
              style={[
                styles.chatPresenceDot,
                isPeerOnline
                  ? styles.chatPresenceDotOnline
                  : styles.chatPresenceDotOffline
              ]}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.chatLiveStatusText,
                isPeerOnline ? styles.chatLiveStatusTextOnline : null
              ]}
            >
              {resolvedPeerStatusText}
            </Text>
            {props.isPeerTyping ? (
              <View style={styles.chatTypingWrap}>
                <TypingDots size="sm" />
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.chatLiveStatus}>
            <Text
              numberOfLines={1}
              style={[
                styles.chatLiveStatusText,
                props.groupTypingSubtitle
                  ? styles.chatLiveStatusTextOnline
                  : null
              ]}
            >
              {props.groupTypingSubtitle ?? "\u00A0"}
            </Text>
            {props.groupTypingSubtitle ? (
              <View style={styles.chatTypingWrap}>
                <TypingDots size="sm" />
              </View>
            ) : null}
          </View>
        )}
      </Pressable>
      <View style={styles.chatHeaderActions}>
        <Pressable
          style={styles.chatHeaderActionButton}
          onPress={props.onStartAudioCall}
          testID="chat-audio-call-button"
        >
          <IconGlyph name="phone" />
        </Pressable>
        <Pressable
          style={styles.chatHeaderActionButton}
          onPress={props.onStartVideoCall}
          testID="chat-video-call-button"
        >
          <IconGlyph name="video" />
        </Pressable>
      </View>
    </View>
  );
}

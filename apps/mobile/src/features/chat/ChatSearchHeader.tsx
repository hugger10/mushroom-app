import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import { useAppTheme } from "../../styles/app-styles";

export function ChatSearchHeader(props: {
  keyword: string;
  onChangeKeyword: (value: string) => void;
  onCancel: () => void;
  matchCount: number;
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  isNavigating?: boolean;
}) {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const trimmedKeyword = props.keyword.trim();
  const hasKeyword = trimmedKeyword.length > 0;
  const hasResults = props.matchCount > 0;
  const isNavigating = Boolean(props.isNavigating);
  const canPrev = hasResults && props.currentIndex > 0 && !isNavigating;
  const canNext =
    hasResults && props.currentIndex < props.matchCount - 1 && !isNavigating;

  let statusNode: React.ReactNode = null;
  if (hasKeyword) {
    if (hasResults) {
      statusNode = (
        <Text
          style={{
            color: theme.colors.textSoft,
            fontSize: 12,
            fontWeight: "600",
            minWidth: 36,
            textAlign: "center"
          }}
          testID="chat-search-status"
        >
          {props.currentIndex + 1}/{props.matchCount}
        </Text>
      );
    } else {
      statusNode = (
        <Text
          style={{
            color: "#ef4444",
            fontSize: 12,
            fontWeight: "600",
            minWidth: 36,
            textAlign: "center"
          }}
          testID="chat-search-status"
        >
          0/0
        </Text>
      );
    }
  }

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.surface
      }}
    >
      <Ionicons name="search" size={16} color={theme.colors.textSoft} />
      <TextInput
        value={props.keyword}
        onChangeText={props.onChangeKeyword}
        placeholder={t("chatDetail.searchMessages")}
        placeholderTextColor={theme.colors.inputPlaceholder}
        autoFocus
        maxLength={SEARCH_KEYWORD_MAX_LENGTH}
        style={{
          flex: 1,
          color: theme.colors.text,
          fontSize: 14,
          paddingVertical: 0,
          minWidth: 0
        }}
        returnKeyType="search"
        testID="chat-search-input"
      />
      {hasKeyword ? (
        <Pressable
          onPress={() => props.onChangeKeyword("")}
          hitSlop={8}
          style={{ padding: 2 }}
          testID="chat-search-clear"
        >
          <Ionicons
            name="close-circle"
            size={16}
            color={theme.colors.textSoft}
          />
        </Pressable>
      ) : null}
      {statusNode}
      {isNavigating ? (
        <ActivityIndicator
          size="small"
          color={theme.colors.accent}
          testID="chat-search-spinner"
        />
      ) : null}
      <Pressable
        onPress={props.onNext}
        disabled={!canNext}
        hitSlop={8}
        style={{
          width: 28,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          opacity: canNext ? 1 : 0.35
        }}
        testID="chat-search-next"
      >
        <Ionicons name="chevron-up" size={18} color={theme.colors.textSoft} />
      </Pressable>
      <Pressable
        onPress={props.onPrev}
        disabled={!canPrev}
        hitSlop={8}
        style={{
          width: 28,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          opacity: canPrev ? 1 : 0.35
        }}
        testID="chat-search-prev"
      >
        <Ionicons name="chevron-down" size={18} color={theme.colors.textSoft} />
      </Pressable>
      <Pressable
        onPress={props.onCancel}
        hitSlop={8}
        style={{ paddingHorizontal: 6, paddingVertical: 4 }}
        testID="chat-search-cancel"
      >
        <Text
          style={{
            color: theme.colors.accent,
            fontSize: 14,
            fontWeight: "600"
          }}
        >
          {t("common.cancel")}
        </Text>
      </Pressable>
    </View>
  );
}

import type { MobileMessageSearchResult } from "@mushroom/app-core";
import {
  formatFileSize,
  getFileMessageKindLabel,
  isFileMessageContent
} from "@mushroom/shared";
import { Pressable, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../../styles/app-styles";
import { formatDateTime } from "../../../utils/app-ui";

/**
 * Shared file list row used by both `AttachmentCenterOverlay` and
 * `ChatMediaScreen`.
 *
 * When `onPress` is omitted the row renders as a non-interactive `View` and
 * the trailing chevron is suppressed (matches the read-only ChatMediaScreen
 * variant).
 */
export function FileRow(props: {
  result: MobileMessageSearchResult;
  styles: ReturnType<typeof useAppTheme>["styles"];
  theme: ReturnType<typeof useAppTheme>["theme"];
  onPress?: () => void;
}) {
  const { result, styles, theme, onPress } = props;
  const content = result.message.content;
  const name = isFileMessageContent(content) ? content.name : result.summary;
  const size =
    isFileMessageContent(content) && typeof content.size === "number"
      ? formatFileSize(content.size)
      : "";
  const kindLabel = getFileMessageKindLabel(content);

  const body = (
    <>
      <View style={styles.chatMediaFileIconWrap}>
        <Ionicons
          name="document-outline"
          size={20}
          color={theme.colors.accent}
        />
      </View>
      <View style={styles.chatMediaFileBody}>
        <Text style={styles.chatMediaFileTitle} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.chatMediaFileMeta} numberOfLines={1}>
          {[kindLabel, size, formatDateTime(result.message.created_at)]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {onPress ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.colors.textMuted}
        />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable style={styles.chatMediaFileItem} onPress={onPress}>
        {body}
      </Pressable>
    );
  }
  return <View style={styles.chatMediaFileItem}>{body}</View>;
}

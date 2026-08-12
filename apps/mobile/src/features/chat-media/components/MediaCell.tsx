import type { MobileMessageSearchResult } from "@mushroom/app-core";
import {
  formatMediaDuration,
  isFileMessageContent,
  isImageFileMessageContent,
  isVideoFileMessageContent
} from "@mushroom/shared";
import { Image, Pressable, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../../styles/app-styles";
import { useAttachmentDisplayUri } from "../hooks/useAttachmentDisplayUri";

/**
 * Shared media grid cell used by both `AttachmentCenterOverlay` and
 * `ChatMediaScreen`. Renders a square thumbnail for image/video messages
 * with an optional press handler and a video play overlay + duration badge.
 *
 * When `onPress` is omitted the cell renders as a non-interactive `View`.
 *
 * 缩略图 URL 通过 `useAttachmentDisplayUri` 解析：当 SQLite 中缓存的
 * 旧预签名 URL 过期导致 `<Image>` 加载失败时，会自动调用服务端
 * `refresh-urls` 拿到新 URL 重新渲染，避免长时间显示灰色占位。
 */
export function MediaCell(props: {
  result: MobileMessageSearchResult;
  styles: ReturnType<typeof useAppTheme>["styles"];
  theme: ReturnType<typeof useAppTheme>["theme"];
  onPress?: () => void;
}) {
  const { result, styles, theme, onPress } = props;
  const content = result.message.content;
  const fileContent = isFileMessageContent(content) ? content : null;
  const isVideo = fileContent ? isVideoFileMessageContent(fileContent) : false;
  const isImage = fileContent ? isImageFileMessageContent(fileContent) : false;
  const isMedia = isImage || isVideo;

  // 视频 / 图片都走相同的缩略图自愈逻辑；非图片/视频的附件直接禁用。
  // 视频走 previewOnly：不能回退到 .mp4 原 URL 作为 <Image> source（必然
  // 解码失败 → 无效 refresh 请求）；无 preview/thumb 时直接灰底占位。
  const { displayUri, unavailable, handleError } = useAttachmentDisplayUri(
    isMedia ? fileContent : null,
    {
      enabled: isMedia,
      previewOnly: isVideo,
      messageId:
        result.message.client_message_id ||
        result.message.server_message_id ||
        null
    }
  );

  if (!fileContent) {
    return <View style={styles.chatMediaCellPlaceholder} />;
  }

  const durationSeconds =
    typeof fileContent.duration_ms === "number" && fileContent.duration_ms > 0
      ? Math.round(fileContent.duration_ms / 1000)
      : 0;
  const showImage = !!displayUri && !unavailable;

  const body = (
    <>
      {showImage ? (
        <Image
          source={{ uri: displayUri as string }}
          style={styles.chatMediaCellImage}
          resizeMode="cover"
          onError={handleError}
        />
      ) : (
        <View
          style={[
            styles.chatMediaCellImage,
            { alignItems: "center", justifyContent: "center" }
          ]}
        >
          <Ionicons
            name={isVideo ? "videocam-outline" : "image-outline"}
            size={28}
            color={theme.colors.textMuted}
          />
        </View>
      )}
      {isVideo ? (
        <>
          <View style={styles.chatMediaVideoOverlay} pointerEvents="none">
            <Ionicons name="play-circle" size={36} color="#FFFFFF" />
          </View>
          {durationSeconds > 0 ? (
            <View style={styles.chatMediaVideoBadge}>
              <Text style={styles.chatMediaVideoBadgeText}>
                {formatMediaDuration(durationSeconds)}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable style={styles.chatMediaCell} onPress={onPress}>
        {body}
      </Pressable>
    );
  }
  return <View style={styles.chatMediaCell}>{body}</View>;
}

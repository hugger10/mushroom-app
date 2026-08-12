import { memo, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import type { MessageFileContent } from "@mushroom/shared";
import { computeImageBubbleSize } from "@mushroom/shared";
import { useAppTheme } from "../../../../styles/app-styles";
import { useAttachmentDisplayUri } from "../../../chat-media/hooks/useAttachmentDisplayUri";

export interface ImageBubbleContentProps {
  content: MessageFileContent;
  isRecalled: boolean;
  imageCacheUri: string | null;
  /** 用于刷新 URL 后回写 SQLite。 */
  messageId?: string | null;
  onPreviewImage: () => void;
  onLongPress: () => void;
}

export const ImageBubbleContent = memo(function ImageBubbleContent(
  props: ImageBubbleContentProps
) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const imageDisplay = useAttachmentDisplayUri(props.content, {
    localCacheUri: props.imageCacheUri,
    enabled: !props.isRecalled,
    messageId: props.messageId ?? null
  });

  // 服务端缩略图 worker 写入的 content.width/height 是首选；缺失时
  // 由 <Image> 的 onLoad 回调拿到 naturalSize 后兜底重算。
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // 骨架屏 loading 状态：本地缓存 URI 立即可用无需骨架；网络 URL 需要。
  const isLocalUri = imageDisplay.displayUri?.startsWith("file://") === true;
  const [isLoading, setIsLoading] = useState(!isLocalUri);

  const hasIntrinsic = Boolean(props.content.width && props.content.height);
  const sizingInput = hasIntrinsic
    ? { width: props.content.width, height: props.content.height }
    : (naturalSize ?? { width: undefined, height: undefined });
  const sized = computeImageBubbleSize(sizingInput);
  const dynamicSize = { width: sized.width, height: sized.height };

  return (
    <Pressable
      onPress={props.onPreviewImage}
      onLongPress={props.onLongPress}
      delayLongPress={200}
    >
      {imageDisplay.unavailable || !imageDisplay.displayUri ? (
        <View
          style={[styles.inlineImage, dynamicSize, styles.mediaFallbackBox]}
        >
          <Ionicons
            name="image-outline"
            size={26}
            color={theme.colors.textSoft}
          />
          <Text style={styles.mediaFallbackText}>
            {props.content.thumb_status === "pending"
              ? t("chatMessage.thumbnailPending")
              : t("chatMessage.imageNotCached")}
          </Text>
        </View>
      ) : (
        <View style={[styles.inlineImage, dynamicSize]}>
          <Image
            key={props.messageId}
            source={{ uri: imageDisplay.displayUri }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
            onError={imageDisplay.handleError}
            onLoadStart={() => !isLocalUri && setIsLoading(true)}
            onLoadEnd={() => setIsLoading(false)}
            onLoad={
              hasIntrinsic
                ? undefined
                : event => {
                    const { width, height } = event.nativeEvent.source ?? {};
                    if (width > 0 && height > 0) {
                      setNaturalSize({ width, height });
                    }
                  }
            }
          />
          {isLoading && (
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                justifyContent: "center",
                alignItems: "center"
              }}
            >
              <ActivityIndicator
                size="small"
                color={
                  theme.mode === "dark"
                    ? "rgba(255,255,255,0.7)"
                    : "rgba(0,0,0,0.4)"
                }
              />
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
});

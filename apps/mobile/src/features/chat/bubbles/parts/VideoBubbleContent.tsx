import { memo, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import {
  computeImageBubbleSize,
  type MessageFileContent
} from "@mushroom/shared";
import { useAppTheme } from "../../../../styles/app-styles";
import { useAttachmentDisplayUri } from "../../../chat-media/hooks/useAttachmentDisplayUri";

export interface VideoBubbleContentProps {
  content: MessageFileContent | null;
  messageId?: string | null;
  onPreviewVideo: () => void;
  onLongPress: () => void;
}

export const VideoBubbleContent = memo(function VideoBubbleContent(
  props: VideoBubbleContentProps
) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const videoDisplay = useAttachmentDisplayUri(props.content, {
    enabled: true,
    messageId: props.messageId ?? null
  });

  const [isLoading, setIsLoading] = useState(true);

  // 与图片气泡共用 computeImageBubbleSize：按真实宽高比 clamp 到
  // 280×320，避免固定小尺寸导致视频封面明显偏小。
  const sized = computeImageBubbleSize({
    width: props.content?.width,
    height: props.content?.height
  });
  const boxSize = { width: sized.width, height: sized.height };

  return (
    <Pressable
      onPress={props.onPreviewVideo}
      onLongPress={props.onLongPress}
      delayLongPress={200}
    >
      {videoDisplay.unavailable || !videoDisplay.displayUri ? (
        <View
          style={[styles.videoPreviewBox, boxSize, styles.mediaFallbackBox]}
        >
          <Ionicons
            name="videocam-outline"
            size={26}
            color={theme.colors.textSoft}
          />
          <Text style={styles.mediaFallbackText}>
            {t("chatMessage.videoCoverNotLoaded")}
          </Text>
        </View>
      ) : (
        <View style={[styles.videoPreviewBox, boxSize]}>
          <Image
            source={{ uri: videoDisplay.displayUri }}
            style={styles.videoPreviewVideo}
            resizeMode="cover"
            onError={videoDisplay.handleError}
            onLoadStart={() => setIsLoading(true)}
            onLoadEnd={() => setIsLoading(false)}
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
                alignItems: "center",
                backgroundColor: theme.mode === "dark" ? "#1c1c1e" : "#e8e8e8"
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
          <Ionicons
            name="play-circle"
            size={44}
            color="rgba(255,255,255,0.92)"
          />
        </View>
      )}
    </Pressable>
  );
});

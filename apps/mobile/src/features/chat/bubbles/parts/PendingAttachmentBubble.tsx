import {
  computeImageBubbleSize,
  formatFileSize,
  isImageFileMessageContent,
  isVideoFileMessageContent,
  type Message,
  type MessageFileContent
} from "@mushroom/shared";
import { memo, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../../../styles/app-styles";
import { useAttachmentProgress } from "../../../../services/attachmentProgressStore";

type PreviewKind = "image" | "video" | "audio" | "file";

function inferPreviewKind(content: MessageFileContent): PreviewKind {
  const mime = (content.mime_type ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (isImageFileMessageContent(content)) return "image";
  if (isVideoFileMessageContent(content)) return "video";
  return "file";
}

function previewKindLabel(
  kind: PreviewKind,
  t: (key: string) => string
): string {
  switch (kind) {
    case "image":
      return t("chat.attachmentCategory.image");
    case "video":
      return t("chat.attachmentCategory.video");
    case "audio":
      return t("chat.attachmentCategory.voice");
    default:
      return t("chat.attachmentCategory.file");
  }
}

function previewKindIonicon(kind: PreviewKind): string {
  switch (kind) {
    case "image":
      return "image-outline";
    case "video":
      return "videocam-outline";
    case "audio":
      return "mic-outline";
    default:
      return "document-outline";
  }
}

/**
 * 失败 / 上传中 附件气泡。
 *
 * 设计目标：把"上传中 / 失败 / 可重试"这三种状态收敛到时间线消息气泡内，
 * 与 WhatsApp / Telegram / 微信 行为一致：**一旦消息进入聊天框，气泡永远
 * 可见，绝不出现"裸叉叉"**。
 *
 * 渲染优先级：
 *   1. `local_thumbnail_uri` / `local_preview_uri`（运行时可用的 file:// 等）
 *   2. 加载失败或缺失 → 占位卡片（图标 + 文件名 + 大小 + 类别）
 *
 * 状态层：上传中显示百分比；失败显示红色 refresh + 错误文案。
 */
export const PendingAttachmentBubble = memo(
  function PendingAttachmentBubble(props: {
    message: Message;
    content: MessageFileContent;
    isOwn: boolean;
    onRetry?: (message: Message) => void;
    /**
     * 当 `content.local_source_missing===true` 时（进程重启 / 用户手动删了
     * 原文件 → 重试时已彻底找不回 asset），气泡的"重试"按钮会换成
     * "重新选择文件"，调用方负责打开 picker → 删旧消息 → 发新消息。
     */
    onReselect?: (message: Message) => void;
  }) {
    const { t } = useTranslation();
    const { styles, theme } = useAppTheme();
    const progress =
      useAttachmentProgress(props.message.client_message_id) ?? 0;
    const [previewUnavailable, setPreviewUnavailable] = useState(false);
    const hasError =
      typeof props.content.upload_error === "string" &&
      props.content.upload_error.length > 0;
    const isFailed = props.message.status === -1 || hasError;
    const sourceMissing = Boolean(
      (props.content as { local_source_missing?: boolean }).local_source_missing
    );
    const handleFailedPress = () => {
      if (sourceMissing) {
        props.onReselect?.(props.message);
      } else {
        props.onRetry?.(props.message);
      }
    };
    const previewUri =
      props.content.local_thumbnail_uri ||
      props.content.local_preview_uri ||
      null;
    const kind = inferPreviewKind(props.content);
    const showImage =
      Boolean(previewUri) &&
      (kind === "image" || kind === "video") &&
      !previewUnavailable;
    const dangerColor = theme.colors.danger ?? "#dc3545";

    // 给 PendingAttachmentBubble 的图片设置显式宽高，避免 <Image> 因无尺寸
    // 坍塌为 0×0（参考 ImageBubbleContent 的做法）。
    const hasIntrinsic = Boolean(props.content.width && props.content.height);
    const sizingInput = hasIntrinsic
      ? { width: props.content.width, height: props.content.height }
      : {
          width: undefined as number | undefined,
          height: undefined as number | undefined
        };
    const sized = computeImageBubbleSize(sizingInput);
    const pendingImageSize = { width: sized.width, height: sized.height };

    return (
      <View>
        {showImage && previewUri ? (
          <View
            collapsable={false}
            style={[styles.inlineImage, pendingImageSize]}
          >
            <Image
              source={{ uri: previewUri }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
              onError={() => setPreviewUnavailable(true)}
            />
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center"
              }}
              pointerEvents="box-none"
            >
              {isFailed ? (
                <Pressable
                  onPress={handleFailedPress}
                  hitSlop={12}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: "rgba(220,53,69,0.92)",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                  testID={
                    sourceMissing
                      ? "message-bubble-reselect"
                      : "message-bubble-retry"
                  }
                >
                  <Ionicons
                    name={sourceMissing ? "cloud-upload-outline" : "refresh"}
                    size={22}
                    color="#fff"
                  />
                </Pressable>
              ) : (
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 10,
                    backgroundColor: "rgba(0,0,0,0.5)"
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 12 }}>
                    {`${progress}%`}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={[styles.fileCard, { opacity: isFailed ? 0.6 : 0.85 }]}>
            <View
              style={[
                styles.fileIconBox,
                props.isOwn ? styles.fileIconBoxOwn : styles.fileIconBoxOther
              ]}
            >
              <Ionicons
                name={previewKindIonicon(kind)}
                size={22}
                color={
                  props.isOwn ? "rgba(255,255,255,0.9)" : theme.colors.accent
                }
              />
            </View>
            <View style={styles.fileInfoWrap}>
              <Text
                style={[
                  styles.fileName,
                  props.isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther
                ]}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {previewKindLabel(kind, t)} ·{" "}
                {props.content.name || t("chatMessage.unnamed")}
              </Text>
              <Text
                style={[
                  styles.fileMeta,
                  props.isOwn
                    ? styles.bubbleMetaInlineOwn
                    : styles.bubbleMetaInlineOther
                ]}
              >
                {formatFileSize(props.content.size)}
                {"  ·  "}
                {sourceMissing
                  ? t("chatMessage.sourceMissing")
                  : isFailed
                    ? t("chatMessage.uploadFailed")
                    : t("chatMessage.uploading", { progress })}
              </Text>
            </View>
            {isFailed ? (
              <Pressable
                onPress={handleFailedPress}
                hitSlop={12}
                testID={
                  sourceMissing
                    ? "message-bubble-reselect"
                    : "message-bubble-retry"
                }
              >
                <Ionicons
                  name={sourceMissing ? "cloud-upload-outline" : "refresh"}
                  size={20}
                  color={dangerColor}
                />
              </Pressable>
            ) : (
              <ActivityIndicator
                size="small"
                color={
                  props.isOwn ? "rgba(255,255,255,0.9)" : theme.colors.accent
                }
              />
            )}
          </View>
        )}
        {hasError ? (
          <Text
            style={{
              marginTop: 4,
              fontSize: 11,
              color: dangerColor
            }}
            numberOfLines={2}
          >
            {props.content.upload_error}
          </Text>
        ) : null}
      </View>
    );
  }
);

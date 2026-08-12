import type { ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  formatFileSize,
  getFileMessageKindLabel,
  isAudioFileMessageContent,
  isFileMessageContent,
  isImageFileMessageContent,
  isMergedForwardContent,
  isVideoFileMessageContent,
  isVoiceMessageContent
} from "@mushroom/shared";
import type { MessageFileContent } from "@mushroom/shared";
import type { Message } from "../../../types/chat";
import type { LoginUser } from "../../../types/user";
import { PendingAttachmentBubble } from "../PendingAttachmentBubble";
import {
  AudioMessageCard,
  CachedImageMessage,
  CachedVideoMessage,
  FileAttachmentMessage
} from "../MessageMediaCards";
import { MentionText } from "./MentionText";
import {
  getForwardCardTitle,
  type ContactsLookup
} from "../../../utils/display";

interface MessageBodyProps {
  message: Message;
  loginUser: LoginUser;
  /** Local contact list used to resolve remark names for forward previews. */
  contacts?: ContactsLookup;
  /** Full ordered list of image messages in the conversation (for lightbox indexing). */
  imageMessages: Message[];
  searchKeyword?: string;
  onOpenImagePreview: (images: Message[], index: number) => void;
  onOpenVideoPlayer?: (args: { url: string; uploadId?: string }) => void;
  onOpenMergedForward?: (message: Message) => void;
  onRetryMessage: (message: Message) => void;
  /** 失败气泡上的"重新选择文件"回调。未提供时按钮会回退到普通 retry。 */
  onReselectAttachment?: (message: Message, file: File) => void;
}

/**
 * Bubble-content dispatcher. Order of branches is significant — first match wins:
 *   1. recalled  → plain text
 *   2. merged forward card
 *   3. pending / failed upload with local preview → PendingAttachmentBubble
 *   4. image file → CachedImageMessage
 *   5. video file → CachedVideoMessage
 *   6. voice file → AudioMessageCard (compact)
 *   7. audio file → AudioMessageCard (titled)
 *   8. other file → FileAttachmentMessage
 *   9. default → MentionText (text with mention/search highlights)
 */
export function MessageBody({
  message: msg,
  loginUser,
  contacts,
  imageMessages,
  searchKeyword,
  onOpenImagePreview,
  onOpenVideoPlayer,
  onOpenMergedForward,
  onRetryMessage,
  onReselectAttachment
}: MessageBodyProps): ReactNode {
  const { t } = useTranslation();

  const mergedTitle = useMemo(() => {
    if (!isMergedForwardContent(msg.content)) return "";
    return getForwardCardTitle({
      items: msg.content.messages,
      fallbackTitle: msg.content.title,
      loginUser,
      contacts
    });
  }, [msg.content, loginUser, contacts]);

  if (msg.is_recalled) {
    return t("chat.recalled");
  }

  if (isMergedForwardContent(msg.content)) {
    const merged = msg.content;
    return (
      <div
        className="im-merged-forward-card"
        onClick={e => {
          e.stopPropagation();
          onOpenMergedForward?.(msg);
        }}
      >
        <div className="im-merged-forward-title" title={mergedTitle}>
          {mergedTitle}
        </div>
        <div className="im-merged-forward-summary">
          {merged.summary.map((line, i) => (
            <div key={i} className="im-merged-forward-summary-line">
              {line}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isFileMessageContent(msg.content)) {
    const fileContent = msg.content;

    // Pending / failed uploads with local preview render a dedicated bubble
    // (avoids relying on empty url triggering the cached-image fallback).
    const pendingMeta = fileContent as {
      upload_pending?: boolean;
      upload_progress?: number;
      local_preview_uri?: string;
      upload_error?: string;
    };
    // 待上传 / 失败 / 本地预览失效 都走专用气泡，确保始终有可见占位，
    // 不会出现"裸叉叉"。msg.status === -1 包含了刷新后丢 blob URL 的场景。
    const isUploadInFlight = Boolean(
      pendingMeta.upload_pending ||
        pendingMeta.upload_error ||
        msg.status === -1
    );
    if (isUploadInFlight) {
      return (
        <PendingAttachmentBubble
          message={msg}
          previewUri={pendingMeta.local_preview_uri}
          hasError={Boolean(pendingMeta.upload_error) || msg.status === -1}
          errorText={pendingMeta.upload_error}
          onRetry={() => onRetryMessage(msg)}
          onReselect={
            onReselectAttachment
              ? file => onReselectAttachment(msg, file)
              : undefined
          }
        />
      );
    }

    if (isImageFileMessageContent(fileContent)) {
      return (
        <CachedImageMessage
          message={msg}
          content={fileContent}
          username={loginUser.username}
          onClick={() => {
            const nextIndex = imageMessages.findIndex(
              imageMessage =>
                imageMessage.client_message_id === msg.client_message_id
            );
            onOpenImagePreview(imageMessages, nextIndex >= 0 ? nextIndex : 0);
          }}
        />
      );
    }

    if (isVideoFileMessageContent(fileContent)) {
      return (
        <CachedVideoMessage
          message={msg}
          content={fileContent}
          username={loginUser.username}
          onOpen={args => onOpenVideoPlayer?.(args)}
        />
      );
    }

    if (isAudioFileMessageContent(fileContent)) {
      const audioContent = fileContent as MessageFileContent & {
        duration_seconds?: number;
      };

      if (isVoiceMessageContent(audioContent)) {
        return (
          <AudioMessageCard
            url={audioContent.url}
            message={msg}
            content={audioContent}
            username={loginUser.username}
            durationSeconds={Number(audioContent.duration_seconds || 0)}
            compactVoice
          />
        );
      }

      return (
        <AudioMessageCard
          url={audioContent.url}
          message={msg}
          content={audioContent}
          username={loginUser.username}
          title={audioContent.name}
          caption={`${getFileMessageKindLabel(audioContent)} · ${formatFileSize(audioContent.size)}`}
        />
      );
    }

    return (
      <FileAttachmentMessage
        username={loginUser.username}
        message={msg}
        content={fileContent}
      />
    );
  }

  return <MentionText content={msg.content} searchKeyword={searchKeyword} />;
}

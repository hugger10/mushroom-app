import {
  isAudioFileMessageContent,
  isFileMessageContent,
  isImageFileMessageContent,
  isVideoFileMessageContent,
  isVoiceMessageContent,
  type Message,
  type MessageFileContent,
  type VoiceFileMessageContent
} from "@mushroom/shared";

export type ResolvedMessageContents = {
  voice: VoiceFileMessageContent | null;
  image: MessageFileContent | null;
  video: MessageFileContent | null;
  audio: MessageFileContent | null;
  generic: MessageFileContent | null;
  /**
   * 当前消息是否处于「上传中 / 上传失败」状态：此时应用 PendingAttachmentBubble
   * 渲染，并短路常规附件分支以避免重复展示。
   */
  isPendingAttachment: boolean;
  /**
   * pending 附件对应的原始 content（image/video/audio/generic 之一）；
   * voice 消息走独立的发送链路，不进入 pending 分支。
   */
  pendingContent: MessageFileContent | null;
};

/**
 * 按 content 类型把消息分流到具体形态，同时识别 pending 附件状态。
 *
 * 设计目标：把原 MessageBubble 中散落在多处的「赋值 + 短路」逻辑收敛为
 * 一个纯函数（非 React hook，但作为派生数据计算，命名前缀 `use` 以与现有
 * 调用习惯保持一致），便于单测与复用。
 */
export function useResolvedMessageContents(
  message: Message
): ResolvedMessageContents {
  let voice: VoiceFileMessageContent | null = null;
  let image: MessageFileContent | null = null;
  let video: MessageFileContent | null = null;
  let audio: MessageFileContent | null = null;
  let generic: MessageFileContent | null = null;

  if (isVoiceMessageContent(message.content)) {
    voice = message.content;
  } else if (isFileMessageContent(message.content)) {
    if (isImageFileMessageContent(message.content)) {
      image = message.content;
    } else if (isVideoFileMessageContent(message.content)) {
      video = message.content;
    } else if (isAudioFileMessageContent(message.content)) {
      audio = message.content;
    } else {
      generic = message.content;
    }
  }

  const attachmentFileContent: MessageFileContent | null =
    image ?? video ?? audio ?? generic;
  const isPendingAttachment =
    !message.is_recalled &&
    attachmentFileContent !== null &&
    voice === null &&
    (attachmentFileContent.upload_pending === true ||
      typeof attachmentFileContent.upload_error === "string");

  if (isPendingAttachment) {
    image = null;
    video = null;
    audio = null;
    generic = null;
  }

  return {
    voice,
    image,
    video,
    audio,
    generic,
    isPendingAttachment,
    pendingContent: isPendingAttachment ? attachmentFileContent : null
  };
}

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Button, message } from "antd";
import {
  AudioOutlined,
  PaperClipOutlined,
  SendOutlined
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { bytesToMB, detectAttachmentCategory } from "@mushroom/shared";
import { ensureLimits } from "../../http/api";
import { ComposerTextArea } from "./composer/ComposerTextArea";
import { ReplyPreviewCard } from "./composer/ComposerStatusCards";
import { PendingImagePreviewCard } from "./composer/PendingImagePreviewCard";
import { EmojiPicker } from "./composer/EmojiPicker";
import { MentionMenu } from "./composer/MentionMenu";
import { VoiceRecordingPill } from "./composer/VoiceRecordingPill";
import { sendFileWithState } from "./composer/fileUpload";
import type { ComposerProps } from "./composer/types";
import { useMentionComposer } from "./composer/useMentionComposer";
import { useTypingSignal } from "./composer/useTypingSignal";
import { useVoiceRecording } from "./composer/useVoiceRecording";
import { focusComposerTextarea } from "./composer/utils";

export function Composer({
  activeConversation,
  inputValue,
  replyingTo,
  selectedMentions,
  mentionAll,
  currentUserId,
  wsUiState,
  fileInputRef,
  onInputChange,
  onSend,
  onReplyCancel,
  canMentionAll,
  composerMode = "normal",
  onSendFileMessage,
  onAfterFileSent,
  getUserDisplayName
}: ComposerProps) {
  const { t } = useTranslation();
  const selectionRef = useRef({
    start: inputValue.length,
    end: inputValue.length
  });
  /**
   * "原图"开关：仅在「图片待发送预览面板」生命周期内有效。
   * 面板关闭（取消或发送完成）后自动复位。
   */
  const [sendAsOriginal, setSendAsOriginal] = useState(false);
  /**
   * 桌面端图片"两步发送"流程（对齐微信桌面）：
   * 用户选图后并不立即发送，先进入此预览态；
   * 在底部预览面板内可勾选「原图」、确认发送或取消。
   * 非图片附件（pdf / 视频 / doc 等）仍保持"选完即发"。
   */
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImageSending, setPendingImageSending] = useState(false);

  const isMuted = composerMode === "muted-all" || composerMode === "muted-self";
  const mutedBannerText =
    composerMode === "muted-all"
      ? t("chat.composerMutedAll")
      : composerMode === "muted-self"
        ? t("chat.composerMutedSelf")
        : "";

  const canUploadAttachment = wsUiState.status === "connected" && !isMuted;
  const hasTextInput = inputValue.trim().length > 0;

  const { sendTypingSignal, stopTypingSignal, syncTypingState } =
    useTypingSignal({
      activeConversation,
      currentUserId,
      wsUiState
    });

  const {
    beginVoiceRecording,
    cancelVoiceRecording,
    stopVoiceRecordingAndSend,
    voiceRecording
  } = useVoiceRecording({
    inputValue,
    onSendFileMessage,
    onAfterFileSent,
    sendTypingSignal
  });

  const {
    applyMentionOption,
    handleInputChange,
    highlightedMentionIndex,
    isMentionMenuVisible,
    mentionOptions,
    setHighlightedMentionIndex,
    setMentionQueryRange,
    updateMentionQuery
  } = useMentionComposer({
    activeConversation,
    canMentionAll,
    currentUserId,
    inputValue,
    mentionAll,
    selectedMentions,
    selectionRef,
    onInputChange,
    onTextInputActivity: syncTypingState
  });

  const handlePickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const limits = await ensureLimits();
    const category = detectAttachmentCategory({
      mimeType: file.type,
      name: file.name
    });

    // 图片走"两步发送"：先进入预览面板，让用户在面板内决定是否原图后再发送。
    // 跳过此处的预压缩 maxBytes 校验（与原行为一致），由 useChatOutgoing
    // 在压缩后再做最终强制校验，行为对齐 WeChat 静默压缩。
    if (category === "image") {
      setSendAsOriginal(false);
      setPendingImage(file);
      return;
    }

    const maxBytes = limits.attachments[category];
    if (file.size > maxBytes) {
      message.error(
        t("chat.attachmentSizeExceeded", {
          label: t(`chat.attachmentCategory.${category}`),
          size: bytesToMB(maxBytes)
        })
      );
      return;
    }

    const sent = await sendFileWithState(file, onSendFileMessage);
    if (sent) {
      onAfterFileSent();
    }
  };

  const handleConfirmPendingImage = async () => {
    if (!pendingImage || pendingImageSending) {
      return;
    }
    setPendingImageSending(true);
    const sent = await sendFileWithState(pendingImage, onSendFileMessage, {
      sendAsOriginal
    });
    setPendingImageSending(false);
    if (sent) {
      setPendingImage(null);
      setSendAsOriginal(false);
      onAfterFileSent();
    }
  };

  const handleCancelPendingImage = () => {
    if (pendingImageSending) {
      return;
    }
    setPendingImage(null);
    setSendAsOriginal(false);
  };

  const handleEmojiSelect = (emoji: string) => {
    const { start, end } = selectionRef.current;
    const nextValue =
      inputValue.slice(0, start) + emoji + inputValue.slice(end);
    const nextCursor = start + emoji.length;
    selectionRef.current = {
      start: nextCursor,
      end: nextCursor
    };
    handleInputChange(nextValue);
    focusComposerTextarea(nextCursor, nextCursor);
  };

  const handleSend = () => {
    if (isMuted) {
      return;
    }
    // 文本框为空时，若存在"待发送图片"，Enter 触发图片发送（对齐微信桌面）。
    if (!hasTextInput && pendingImage) {
      void handleConfirmPendingImage();
      return;
    }
    stopTypingSignal();
    onSend();
  };

  const handlePrimaryAction = () => {
    if (isMuted) {
      return;
    }
    if (hasTextInput) {
      handleSend();
      return;
    }

    // 无文本输入但存在"待发送图片"时，主按钮变成"发送图片"。
    if (pendingImage) {
      void handleConfirmPendingImage();
      return;
    }

    if (voiceRecording.active) {
      void stopVoiceRecordingAndSend();
      return;
    }

    beginVoiceRecording();
  };

  const showSendIcon = hasTextInput || voiceRecording.active || !!pendingImage;
  const primaryActionIcon = showSendIcon ? (
    <SendOutlined className="im-composer-inline-send-icon" />
  ) : (
    <AudioOutlined className="im-composer-inline-send-icon" />
  );
  const primaryActionLabel = hasTextInput
    ? t("chatMessage.sendTextMessage")
    : pendingImage
      ? t("chatMessage.sendImage")
      : voiceRecording.active
        ? t("chatMessage.sendVoiceMessage")
        : t("chatMessage.holdToRecord");

  return (
    <div className="im-composer">
      {isMuted ? (
        <div className="im-composer-muted-banner" role="status">
          {mutedBannerText}
        </div>
      ) : null}

      {replyingTo ? (
        <ReplyPreviewCard
          replyingTo={replyingTo}
          onReplyCancel={onReplyCancel}
          getUserDisplayName={getUserDisplayName}
        />
      ) : null}

      {pendingImage ? (
        <PendingImagePreviewCard
          file={pendingImage}
          sendAsOriginal={sendAsOriginal}
          disabled={pendingImageSending}
          onToggleOriginal={setSendAsOriginal}
          onCancel={handleCancelPendingImage}
          onConfirm={handleConfirmPendingImage}
        />
      ) : null}

      <div className="im-composer-inline-row">
        <Button
          className="im-composer-inline-tool"
          type="text"
          icon={<PaperClipOutlined className="im-composer-inline-tool-icon" />}
          onClick={() => fileInputRef.current?.click()}
          disabled={!canUploadAttachment}
        />

        <div className="im-composer-textarea-wrap">
          {voiceRecording.active ? (
            <VoiceRecordingPill
              voiceRecording={voiceRecording}
              onCancel={cancelVoiceRecording}
            />
          ) : isMentionMenuVisible ? (
            <MentionMenu
              highlightedMentionIndex={highlightedMentionIndex}
              mentionOptions={mentionOptions}
              onApplyMentionOption={applyMentionOption}
            />
          ) : null}

          {!voiceRecording.active ? (
            <>
              <ComposerTextArea
                value={inputValue}
                placeholder={t("chat.placeholder")}
                hasTextInput={hasTextInput}
                isMentionMenuVisible={isMentionMenuVisible}
                mentionOptions={mentionOptions}
                highlightedMentionIndex={highlightedMentionIndex}
                selectionRef={selectionRef}
                onApplyMentionOption={applyMentionOption}
                onChangeValue={handleInputChange}
                onDismissMentionMenu={() => setMentionQueryRange(null)}
                onHighlightedMentionIndexChange={setHighlightedMentionIndex}
                onSelectionChange={updateMentionQuery}
                onSend={handleSend}
              />
              <EmojiPicker onEmojiSelect={handleEmojiSelect} />
            </>
          ) : null}
        </div>

        <Button
          className={`im-composer-inline-send${voiceRecording.active ? " is-recording" : ""}`}
          type="text"
          icon={primaryActionIcon}
          onClick={handlePrimaryAction}
          disabled={hasTextInput ? isMuted : !canUploadAttachment}
          title={isMuted ? mutedBannerText : primaryActionLabel}
          aria-label={isMuted ? mutedBannerText : primaryActionLabel}
        />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.7z,.mp3,.wav,.m4a,.mp4,.mov,.webm"
        style={{ display: "none" }}
        onChange={handlePickFile}
      />
    </div>
  );
}

import type { MobileAppState } from "../../../app/controller/useMobileAppState";
import { createMessageHelpers } from "./helpers";
import { createComposerActions } from "./composer";
import { createSendingActions } from "./sending";
import { createAttachmentActions } from "./attachments";
import { createForwardActions } from "./forward";
import { createLifecycleActions } from "./lifecycle";
import type { MessageActionsCtx } from "./types";

export {
  createMessageHelpers,
  createComposerActions,
  createSendingActions,
  createAttachmentActions,
  createForwardActions,
  createLifecycleActions
};

export type { MessageActionsCtx } from "./types";

/**
 * 组装顺序说明：
 *   1) helpers / composer 不依赖其他子工厂方法 -> 先注入。
 *   2) sending 在调用时通过 ctx 读取 composer / attachments / forward，
 *      但其方法本身又被它们调用 -> 第二个注入。
 *   3) attachments / forward 调用 sending.sendPreparedMessage（已就位）。
 *   4) attachments 自身的 handleSendImageFromGallery 也通过 ctx 被
 *      handleSendAttachment 调用 -> 注入后通过 ctx 暴露。
 *   5) lifecycle 与其他子工厂彼此独立。
 */
export function createMessageActions(params: { state: MobileAppState }) {
  const { state } = params;
  const ctx = { state } as MessageActionsCtx;

  const helpers = createMessageHelpers(state);
  ctx.getNormalizedActiveConversation = helpers.getNormalizedActiveConversation;

  const composer = createComposerActions(ctx);
  ctx.scheduleTypingStopSignal = composer.scheduleTypingStopSignal;
  ctx.buildMentionDraft = composer.buildMentionDraft;
  ctx.handleComposerTextChange = composer.handleComposerTextChange;

  const sending = createSendingActions(ctx);
  ctx.updateTypingState = sending.updateTypingState;
  ctx.sendPreparedMessage = sending.sendPreparedMessage;
  ctx.handleSendMessage = sending.handleSendMessage;

  const attachments = createAttachmentActions(ctx);
  ctx.handleSendAttachment = attachments.handleSendAttachment;
  ctx.handleSendImageFromGallery = attachments.handleSendImageFromGallery;
  ctx.handleSendImageFromCamera = attachments.handleSendImageFromCamera;
  ctx.handleCancelImagePreview = attachments.handleCancelImagePreview;
  ctx.handleConfirmSendImage = attachments.handleConfirmSendImage;
  ctx.handleRetryAttachment = attachments.handleRetryAttachment;
  ctx.handleReselectAttachment = attachments.handleReselectAttachment;
  ctx.handleDeleteFailedAttachment = attachments.handleDeleteFailedAttachment;
  ctx.processAndSendAttachmentAsset = attachments.processAndSendAttachmentAsset;
  ctx.uploadAndFinalizeAttachment = attachments.uploadAndFinalizeAttachment;

  const forward = createForwardActions(ctx);
  ctx.handleForwardToConversation = forward.handleForwardToConversation;
  ctx.handleBatchForwardToConversation =
    forward.handleBatchForwardToConversation;

  const lifecycle = createLifecycleActions(state);

  return {
    sendPreparedMessage: sending.sendPreparedMessage,
    handleSendMessage: sending.handleSendMessage,
    handleSendAttachment: attachments.handleSendAttachment,
    handleRetryAttachment: attachments.handleRetryAttachment,
    handleReselectAttachment: attachments.handleReselectAttachment,
    handleDeleteFailedAttachment: attachments.handleDeleteFailedAttachment,
    handleSendImageFromGallery: attachments.handleSendImageFromGallery,
    handleSendImageFromCamera: attachments.handleSendImageFromCamera,
    handleConfirmSendImage: attachments.handleConfirmSendImage,
    handleCancelImagePreview: attachments.handleCancelImagePreview,
    handleForwardToConversation: forward.handleForwardToConversation,
    handleBatchForwardToConversation: forward.handleBatchForwardToConversation,
    canRecallMessage: lifecycle.canRecallMessage,
    handleToggleFavorite: lifecycle.handleToggleFavorite,
    handleTogglePin: lifecycle.handleTogglePin,
    handleRecall: lifecycle.handleRecall,
    handleToggleReaction: lifecycle.handleToggleReaction,
    handleComposerTextChange: composer.handleComposerTextChange,
    updateTypingState: sending.updateTypingState
  };
}

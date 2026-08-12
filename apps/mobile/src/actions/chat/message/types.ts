import type { Message, MessageMention } from "@mushroom/shared";
import type { PickedMediaAsset } from "../../../platform/native-pickers";
import type { PendingMobileAsset } from "../../../services/pendingAssetMap";
import type { MobileAppState } from "../../../app/controller/useMobileAppState";

export type NormalizedConversation = NonNullable<
  MobileAppState["activeConversation"]
>;

export type ChatMessage = Message & { messageClassify: "chat" };

export interface MentionDraft {
  mentions: MessageMention[];
  mentionAll: boolean;
}

export type AttachmentAsset = PickedMediaAsset & {
  width?: number;
  height?: number;
  durationMs?: number;
};

export interface UploadAndFinalizeArgs {
  clientConversationId: string;
  clientMessageId: string;
  asset: PendingMobileAsset;
  successStatus: string;
}

export interface ProcessAttachmentArgs {
  asset: AttachmentAsset;
  kind: "image" | "file";
  sendAsOriginal: boolean;
}

/**
 * 共享上下文：在 `createMessageActions` 内分阶段组装。
 *
 * `composer` 与 `sending` 之间存在双向调用
 * (`handleComposerTextChange -> updateTypingState` 与
 *  `updateTypingState -> scheduleTypingStopSignal`)。为避免运行时循环依赖，
 * 各子工厂只通过 `ctx.xxx` 在调用时延迟读取彼此的方法；`index.ts` 负责按
 * 拓扑顺序把方法回填到同一个 `ctx` 对象里。
 */
export interface MessageActionsCtx {
  state: MobileAppState;
  getNormalizedActiveConversation: () => NormalizedConversation | null;

  // sending.ts
  sendPreparedMessage: (
    message: ChatMessage,
    successStatus: string
  ) => Promise<void>;
  updateTypingState: (
    active: boolean,
    activity?: "text" | "voice"
  ) => Promise<void>;
  handleSendMessage: () => Promise<void>;

  // composer.ts
  scheduleTypingStopSignal: () => void;
  buildMentionDraft: (text: string) => MentionDraft;
  handleComposerTextChange: (value: string) => void;

  // attachments.ts
  handleSendAttachment: (
    kind: "image" | "file",
    onOptimisticCreated?: () => void
  ) => Promise<void>;
  handleSendImageFromGallery: () => Promise<void>;
  handleSendImageFromCamera: () => Promise<void>;
  handleCancelImagePreview: () => void;
  handleConfirmSendImage: () => Promise<void>;
  handleRetryAttachment: (message: Message) => Promise<void>;
  handleReselectAttachment: (message: Message) => Promise<void>;
  handleDeleteFailedAttachment: (message: Message) => Promise<void>;
  processAndSendAttachmentAsset: (
    params: ProcessAttachmentArgs
  ) => Promise<void>;
  uploadAndFinalizeAttachment: (args: UploadAndFinalizeArgs) => Promise<void>;

  // forward.ts
  handleForwardToConversation: (
    targetConversationId: string,
    extraMessage?: string,
    overrideMessageId?: string
  ) => Promise<void>;
  handleBatchForwardToConversation: (
    targetConversationId: string,
    mode: "one-by-one" | "merged",
    selectedMessages: Message[],
    extraMessage?: string
  ) => Promise<void>;
}

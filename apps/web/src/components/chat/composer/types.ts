import type { RefObject } from "react";
import type { MessageMention } from "@mushroom/shared";
import type { Conversation, Message } from "../../../types/chat";
import type { WsUiState } from "../../../ws/WSClient";

export interface ComposerProps {
  activeConversation: Conversation;
  inputValue: string;
  replyingTo: Message | null;
  selectedMentions: MessageMention[];
  mentionAll: boolean;
  currentUserId: number;
  wsUiState: WsUiState;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onInputChange: (
    value: string,
    mentions: MessageMention[],
    mentionAll: boolean
  ) => void;
  onSend: () => void;
  onReplyCancel: () => void;
  canMentionAll: boolean;
  composerMode?: ComposerMode;
  onSendFileMessage: SendFileMessage;
  onAfterFileSent: () => void;
  getUserDisplayName: (userId: number, fallbackNickname?: string) => string;
}

export type VoiceFileOptions = {
  kind?: "voice_message";
  durationSeconds?: number;
  waveform?: number[];
  /** 用户勾选了"原图"，跳过客户端压缩 */
  sendAsOriginal?: boolean;
};

export type SendFileMessage = (
  file: File,
  onProgress?: (percent: number) => void,
  options?: VoiceFileOptions
) => Promise<void>;

export type MentionOption =
  | {
      kind: "all";
      key: string;
      label: string;
    }
  | {
      kind: "member";
      key: string;
      userId: number;
      nickname: string;
      avatarUrl?: string | null;
    };

export type MentionQueryRange = {
  start: number;
  end: number;
  query: string;
};

export type TextSelection = {
  start: number;
  end: number;
};

export type TextSelectionRef = RefObject<TextSelection>;

export type VoiceRecordingState = {
  active: boolean;
  elapsedMs: number;
};

export type TypingActivity = "text" | "voice";

export type ComposerMode = "normal" | "muted-all" | "muted-self";

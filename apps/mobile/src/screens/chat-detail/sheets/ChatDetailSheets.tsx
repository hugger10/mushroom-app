import {
  ContactListItem,
  Conversation,
  LoginUser,
  Message
} from "@mushroom/shared";
import { forwardRef, useImperativeHandle, useState } from "react";
import {
  AttachmentSheet,
  EmojiPickerSheet,
  GroupReadReceiptsSheet,
  ImageSendPreview,
  ReactionDetailSheet
} from "../../../features/chat";
import type { PickedMediaAsset } from "../../../platform/native-pickers";

export type ChatDetailSheetsHandle = {
  openEmojiPicker(msg: Message): void;
  openReactionDetail(msg: Message): void;
  openGroupReadReceipts(msg: Message): void;
};

export type ChatDetailSheetsProps = {
  activeConversation: Conversation;
  activeMessages: Message[];
  contacts: ContactListItem[];
  currentUserId?: number | null;
  currentLoginUser?: LoginUser | null;
  groupReadState: Record<number, number> | null;
  composerToolsVisible: boolean;
  imagePreviewVisible: boolean;
  pendingImageAsset: PickedMediaAsset | null;
  imagePreviewSendTopRight: boolean;
  sendImageAsOriginal: boolean;
  pending: boolean;
  onToggleComposerTools: () => void;
  onSendImageFromGallery: () => void;
  onSendImageFromCamera: () => void;
  onPickVideo: () => void;
  onSendFile: () => void;
  onToggleSendImageAsOriginal: () => void;
  onCancelImagePreview: () => void;
  onConfirmSendImage: () => void;
  onToggleReaction: (message: Message, emoji: string | null) => void;
};

export const ChatDetailSheets = forwardRef<
  ChatDetailSheetsHandle,
  ChatDetailSheetsProps
>(function ChatDetailSheets(props, ref) {
  const [emojiPickerTarget, setEmojiPickerTarget] = useState<Message | null>(
    null
  );
  const [reactionDetailTarget, setReactionDetailTarget] =
    useState<Message | null>(null);
  // 群已读详情面板：仅自己发的群消息可触发。
  const [groupReadReceiptsTarget, setGroupReadReceiptsTarget] =
    useState<Message | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      openEmojiPicker: (msg: Message) => setEmojiPickerTarget(msg),
      openReactionDetail: (msg: Message) => setReactionDetailTarget(msg),
      openGroupReadReceipts: (msg: Message) => setGroupReadReceiptsTarget(msg)
    }),
    []
  );

  return (
    <>
      <AttachmentSheet
        visible={props.composerToolsVisible}
        onClose={props.onToggleComposerTools}
        onPickGallery={props.onSendImageFromGallery}
        onPickCamera={props.onSendImageFromCamera}
        onPickVideo={props.onPickVideo}
        onPickDocument={props.onSendFile}
      />

      <ImageSendPreview
        visible={props.imagePreviewVisible}
        asset={props.pendingImageAsset}
        sendImageAsOriginal={props.sendImageAsOriginal}
        pending={props.pending}
        sendButtonPlacement={props.imagePreviewSendTopRight ? "top" : "bottom"}
        onToggleSendImageAsOriginal={props.onToggleSendImageAsOriginal}
        onCancel={props.onCancelImagePreview}
        onConfirm={props.onConfirmSendImage}
      />

      <EmojiPickerSheet
        visible={emojiPickerTarget != null}
        onSelect={emoji => {
          const target = emojiPickerTarget;
          setEmojiPickerTarget(null);
          if (target) {
            props.onToggleReaction(target, emoji);
          }
        }}
        onClose={() => setEmojiPickerTarget(null)}
      />

      <ReactionDetailSheet
        visible={reactionDetailTarget != null}
        reactions={
          reactionDetailTarget
            ? (props.activeMessages.find(
                m =>
                  m.client_message_id === reactionDetailTarget.client_message_id
              )?.reactions ?? reactionDetailTarget.reactions)
            : []
        }
        conversation={props.activeConversation}
        contacts={props.contacts}
        loginUser={props.currentLoginUser}
        currentUserId={props.currentUserId ?? null}
        onRemoveMine={() => {
          if (reactionDetailTarget) {
            props.onToggleReaction(reactionDetailTarget, null);
          }
          setReactionDetailTarget(null);
        }}
        onClose={() => setReactionDetailTarget(null)}
      />

      <GroupReadReceiptsSheet
        visible={groupReadReceiptsTarget != null}
        message={groupReadReceiptsTarget}
        conversation={props.activeConversation}
        groupReadState={props.groupReadState}
        contacts={props.contacts}
        loginUser={props.currentLoginUser}
        onClose={() => setGroupReadReceiptsTarget(null)}
      />
    </>
  );
});

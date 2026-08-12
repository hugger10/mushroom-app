import { useState } from "react";
import type { MobileMessageSearchResult } from "@mushroom/app-core";
import type { AttachmentTab } from "../../../types/app";

export function useOverlayState() {
  const [addEntryMenuVisible, setAddEntryMenuVisible] = useState(false);
  const [addContactVisible, setAddContactVisible] = useState(false);
  const [attachmentCenterVisible, setAttachmentCenterVisible] = useState(false);
  const [attachmentTab, setAttachmentTab] = useState<AttachmentTab>("media");
  const [attachmentItems, setAttachmentItems] = useState<{
    media: MobileMessageSearchResult[];
    files: MobileMessageSearchResult[];
  }>({
    media: [],
    files: []
  });
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarPreviewLabel, setAvatarPreviewLabel] = useState<string>("");
  // Group-call member picker: shown when starting an audio/video call from a
  // group chat so the user can choose which members to invite instead of
  // paging the entire group. `callMemberPickerMediaType` is 1 (audio) or 2
  // (video); `callMemberPickerConversationId` is the target conversation.
  const [callMemberPickerVisible, setCallMemberPickerVisible] = useState(false);
  const [callMemberPickerMediaType, setCallMemberPickerMediaType] = useState<
    1 | 2
  >(1);
  const [callMemberPickerConversationId, setCallMemberPickerConversationId] =
    useState<string | null>(null);

  return {
    addEntryMenuVisible,
    setAddEntryMenuVisible,
    addContactVisible,
    setAddContactVisible,
    attachmentCenterVisible,
    setAttachmentCenterVisible,
    attachmentTab,
    setAttachmentTab,
    attachmentItems,
    setAttachmentItems,
    avatarPreviewVisible,
    setAvatarPreviewVisible,
    avatarPreviewUrl,
    setAvatarPreviewUrl,
    avatarPreviewLabel,
    setAvatarPreviewLabel,
    callMemberPickerVisible,
    setCallMemberPickerVisible,
    callMemberPickerMediaType,
    setCallMemberPickerMediaType,
    callMemberPickerConversationId,
    setCallMemberPickerConversationId
  };
}

import {
  isAudioFileMessageContent,
  isFileMessageContent,
  isImageFileMessageContent,
  isMergedForwardContent,
  isSystemMessageContent,
  isVideoFileMessageContent,
  isVoiceMessageContent,
  Message
} from "@mushroom/shared";
import { View } from "react-native";

export const MESSAGE_SEPARATOR_STYLE = { height: 6 };

export function MessageListSeparator() {
  return <View style={MESSAGE_SEPARATOR_STYLE} />;
}

export type DateSeparatorItem = {
  __kind: "date-separator";
  key: string;
  label: string;
};

export type ChatListItem = Message | DateSeparatorItem;

export function isDateSeparatorItem(
  item: ChatListItem
): item is DateSeparatorItem {
  return (
    typeof (item as DateSeparatorItem).__kind === "string" &&
    (item as DateSeparatorItem).__kind === "date-separator"
  );
}

export function getMessageItemType(item: ChatListItem): string {
  if (isDateSeparatorItem(item)) return "date-separator";
  if (isFileMessageContent(item.content)) {
    if (isImageFileMessageContent(item.content)) return "image";
    if (isVideoFileMessageContent(item.content)) return "video";
    if (isAudioFileMessageContent(item.content)) return "audio";
    return "file";
  }
  if (isVoiceMessageContent(item.content)) return "voice";
  if (isMergedForwardContent(item.content)) return "merged";
  if (isSystemMessageContent(item.content)) return "system";
  return "text";
}

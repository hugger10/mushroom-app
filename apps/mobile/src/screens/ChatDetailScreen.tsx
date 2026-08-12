// Re-export to preserve the legacy import path (`./screens/ChatDetailScreen`)
// used by `App.tsx` and elsewhere. The actual implementation lives in the
// `chat-detail/` folder, which decomposes the screen into:
//   - `header/ChatDetailHeader`
//   - `list/MessageList` (+ `useMessageListData`, `useMessageListScroll`)
//   - `mention/useMentionQuery`
//   - `menu/useMessageContextMenu`
//   - `composer/ComposerHost`
//   - `sheets/ChatDetailSheets`
export {
  ChatDetailScreen,
  type ChatDetailScreenProps
} from "./chat-detail/ChatDetailScreen";

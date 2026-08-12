import { Conversation, Message } from "@mushroom/shared";
import { useCallback, useState } from "react";
import {
  Pressable,
  Text,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Composer,
  MultiSelectToolbar,
  ReplyPreview
} from "../../../features/chat";
import { useAppTheme } from "../../../styles/app-styles";
import { AppAvatar } from "../../../components/ui";
import { useMentionQuery } from "../mention/useMentionQuery";

export type ComposerHostProps = {
  activeConversation: Conversation;
  currentUserId?: number | null;
  isSearchVisible: boolean;
  isMultiSelectMode: boolean;
  multiSelectedIds: Set<string>;
  composerText: string;
  pending: boolean;
  composerMode: "normal" | "muted-all" | "muted-self";
  replyTarget: Message | null;
  onChangeComposerText: (value: string) => void;
  onCancelReply: () => void;
  onCancelVoiceRecording: () => void;
  onSendMessage: () => void;
  onStartVoiceRecording: () => void;
  onStopVoiceRecording: (durationMs: number) => void;
  onToggleComposerTools: () => void;
  onStartBatchForward: (mode: "one-by-one" | "merged") => void;
  onExitMultiSelectMode: () => void;
};

export function ComposerHost(props: ComposerHostProps) {
  const { styles } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [composerSelectionEnd, setComposerSelectionEnd] = useState(0);
  const [dismissedAnchor, setDismissedAnchor] = useState<number | null>(null);

  const canSendText = props.composerText.trim().length > 0;

  const { mentionOptions, showMentionPanel, insertMention, mentionQueryRange } =
    useMentionQuery({
      text: props.composerText,
      cursor: composerSelectionEnd,
      conversation: props.activeConversation,
      currentUserId: props.currentUserId,
      onChangeText: props.onChangeComposerText,
      setCursor: setComposerSelectionEnd
    });

  // 用户点击聊天区域时仅关闭弹窗（不收键盘）。以当前 "@" 锚点位置记录已关闭，
  // 之后重新输入新的 "@"（锚点位置变化）会自动恢复弹窗。
  const isMentionPanelVisible =
    showMentionPanel && mentionQueryRange?.start !== dismissedAnchor;

  const handleComposerSelectionChange = useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setComposerSelectionEnd(event.nativeEvent.selection.end);
    },
    []
  );

  return (
    <View>
      <ReplyPreview
        replyTarget={props.replyTarget}
        onCancel={props.onCancelReply}
      />

      {isMentionPanelVisible ? (
        <>
          <Pressable
            style={styles.mentionBackdrop}
            onPress={() => setDismissedAnchor(mentionQueryRange?.start ?? null)}
            testID="chat-mention-backdrop"
          />
          <View style={styles.mentionPanel} testID="chat-mention-panel">
            {mentionOptions.map((option, index) => (
              <Pressable
                key={option.key}
                style={[
                  styles.mentionOption,
                  index === mentionOptions.length - 1
                    ? styles.mentionOptionLast
                    : null
                ]}
                onPress={() => insertMention(option)}
                testID={`chat-mention-option-${option.key}`}
              >
                {option.kind === "all" ? (
                  <View style={styles.mentionAvatar}>
                    <Text style={styles.mentionAvatarText}>@</Text>
                  </View>
                ) : (
                  <AppAvatar
                    label={option.nickname}
                    imageUrl={option.avatarUrl}
                    style={styles.mentionAvatar}
                    textStyle={styles.mentionAvatarText}
                  />
                )}
                <View style={styles.mentionOptionBody}>
                  <Text style={styles.mentionOptionTitle}>
                    {option.nickname}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {props.isSearchVisible ? null : props.isMultiSelectMode ? (
        <View style={{ paddingBottom: Math.max(insets.bottom, 6) }}>
          <MultiSelectToolbar
            selectedCount={props.multiSelectedIds.size}
            onForwardOneByOne={() => props.onStartBatchForward("one-by-one")}
            onForwardMerged={() => props.onStartBatchForward("merged")}
            onCancel={props.onExitMultiSelectMode}
          />
        </View>
      ) : (
        <Composer
          composerText={props.composerText}
          onChangeComposerText={props.onChangeComposerText}
          onComposerSelectionChange={handleComposerSelectionChange}
          pending={props.pending}
          canSendText={canSendText}
          composerMode={props.composerMode}
          onSendMessage={props.onSendMessage}
          onStartVoiceRecording={props.onStartVoiceRecording}
          onStopVoiceRecording={props.onStopVoiceRecording}
          onCancelVoiceRecording={props.onCancelVoiceRecording}
          onOpenAttachments={props.onToggleComposerTools}
        />
      )}
    </View>
  );
}

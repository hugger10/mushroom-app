import { memo, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import {
  generateFakeWaveform,
  type Message,
  type VoiceFileMessageContent
} from "@mushroom/shared";
import { useAppTheme } from "../../../../styles/app-styles";
import { BubbleMetaRow } from "./BubbleMetaRow";

const VOICE_WAVEFORM_BAR_COUNT = 28;
const VOICE_WAVE_BAR_MIN_HEIGHT = 1;
const VOICE_WAVE_BAR_MAX_HEIGHT = 18;

export interface VoiceBubbleContentProps {
  message: Message;
  content: VoiceFileMessageContent;
  isOwn: boolean;
  voicePlaying: boolean;
  voicePlayingPositionMs: number;
  onToggleVoicePlayback: () => void;
  onLongPress: () => void;
  // meta row
  inlineMetaLabel: string;
  inlineMetaStyle: unknown;
  showInlineReceipt: boolean;
  isRead: boolean;
  receiptColor: string;
}

export const VoiceBubbleContent = memo(function VoiceBubbleContent(
  props: VoiceBubbleContentProps
) {
  const { styles, theme } = useAppTheme();
  const voiceDurationSeconds = Number(props.content.duration_seconds || 0);
  const voiceBubbleWidth = 180;

  // 按消息身份生成稳定种子：同一消息任何时刻/任何客户端波形一致，
  // 不同消息形状不同（不依赖真实音频采样）。
  const waveSeed = useMemo(
    () =>
      String(
        props.message.client_message_id ||
          props.message.server_message_id ||
          props.content.url ||
          ""
      ),
    [
      props.message.client_message_id,
      props.message.server_message_id,
      props.content.url
    ]
  );
  const waveform = useMemo(
    () =>
      generateFakeWaveform({
        seed: waveSeed,
        barCount: VOICE_WAVEFORM_BAR_COUNT,
        durationSeconds: voiceDurationSeconds
      }),
    [waveSeed, voiceDurationSeconds]
  );

  return (
    <View style={styles.bubbleTextWrap}>
      <Pressable
        onPress={props.onToggleVoicePlayback}
        onLongPress={props.onLongPress}
        delayLongPress={200}
        style={[
          styles.voiceMessageCard,
          props.showInlineReceipt ? styles.voiceMessageCardWithReceipt : null,
          {
            width: voiceBubbleWidth
          }
        ]}
      >
        <View style={styles.voiceCardRow}>
          <View
            style={[
              styles.voicePlayButton,
              props.isOwn
                ? styles.voicePlayButtonOwn
                : styles.voicePlayButtonOther
            ]}
          >
            <Ionicons
              name={props.voicePlaying ? "pause" : "play"}
              size={14}
              color={
                props.isOwn ? "rgba(255,255,255,0.95)" : theme.colors.accent
              }
            />
          </View>
          <View style={styles.voiceWaveRow}>
            {Array.from({ length: VOICE_WAVEFORM_BAR_COUNT }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.voiceWaveBar,
                  props.isOwn
                    ? styles.voiceWaveBarOwn
                    : styles.voiceWaveBarOther,
                  {
                    height:
                      VOICE_WAVE_BAR_MIN_HEIGHT +
                      (waveform[i] ?? 0.5) *
                        (VOICE_WAVE_BAR_MAX_HEIGHT - VOICE_WAVE_BAR_MIN_HEIGHT)
                  },
                  props.voicePlaying &&
                  i <
                    Math.floor(
                      (props.voicePlayingPositionMs /
                        ((voiceDurationSeconds || 1) * 1000)) *
                        VOICE_WAVEFORM_BAR_COUNT
                    )
                    ? props.isOwn
                      ? styles.voiceWaveBarOwnActive
                      : styles.voiceWaveBarOtherActive
                    : null
                ]}
              />
            ))}
          </View>
          <Text
            style={[
              styles.voiceMessageDuration,
              props.isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther
            ]}
          >
            {Math.max(1, Math.floor(voiceDurationSeconds || 0))}"
          </Text>
        </View>
      </Pressable>
      <BubbleMetaRow
        variant="voice"
        inlineMetaLabel={props.inlineMetaLabel}
        inlineMetaStyle={props.inlineMetaStyle as never}
        showInlineReceipt={props.showInlineReceipt}
        status={Number(props.message.status || 0)}
        read={props.isRead}
        receiptColor={props.receiptColor}
      />
    </View>
  );
});

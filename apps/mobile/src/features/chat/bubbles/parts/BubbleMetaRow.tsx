import { memo } from "react";
import { Text, View, type StyleProp, type TextStyle } from "react-native";
import { useAppTheme } from "../../../../styles/app-styles";
import { ReadReceipt } from "./ReadReceipt";

export type BubbleMetaVariant = "voice" | "text" | "media" | "inline" | "file";

export interface BubbleMetaRowProps {
  variant: BubbleMetaVariant;
  inlineMetaLabel: string;
  inlineMetaStyle?: StyleProp<TextStyle>;
  showInlineReceipt: boolean;
  status: number;
  read: boolean;
  receiptColor: string;
  /** inline variant only */
  isOwn?: boolean;
  /** inline variant only */
  isMergedForwardMessage?: boolean;
}

/**
 * Unified meta row (time + optional read receipt) for various bubble layouts.
 * Behavior 与原 inline render 完全一致；仅按 variant 选择容器/文本 style。
 */
export const BubbleMetaRow = memo(function BubbleMetaRow(
  props: BubbleMetaRowProps
) {
  const { styles } = useAppTheme();
  const {
    variant,
    inlineMetaLabel,
    inlineMetaStyle,
    showInlineReceipt,
    status,
    read,
    receiptColor,
    isOwn,
    isMergedForwardMessage
  } = props;

  const receipt = showInlineReceipt ? (
    <ReadReceipt status={status} read={read} color={receiptColor} />
  ) : null;

  if (variant === "media") {
    return (
      <View testID="message-bubble-meta" style={styles.mediaMetaOverlay}>
        <View style={styles.mediaMetaRow}>
          <Text style={styles.mediaMetaText}>{inlineMetaLabel}</Text>
          {receipt}
        </View>
      </View>
    );
  }

  if (variant === "inline") {
    return (
      <View
        testID="message-bubble-meta"
        style={[
          styles.bubbleMetaInlineRow,
          !isOwn && !isMergedForwardMessage
            ? styles.bubbleMetaInlineRowOther
            : null,
          isMergedForwardMessage ? styles.bubbleMetaInlineRowCompact : null
        ]}
      >
        <Text style={[styles.bubbleMetaInlineBase, inlineMetaStyle]}>
          {inlineMetaLabel}
        </Text>
        {receipt}
      </View>
    );
  }

  // voice + text + file 复用同一组 style：时间悬浮于气泡右下角、与最后一行同行
  return (
    <View testID="message-bubble-meta" style={styles.bubbleMetaRow}>
      <Text style={[styles.bubbleMetaOverlay, inlineMetaStyle]}>
        {inlineMetaLabel}
      </Text>
      {receipt}
    </View>
  );
});

import { memo } from "react";
import { Text, View, type StyleProp, type TextStyle } from "react-native";
import type { Message } from "@mushroom/shared";
import { useAppTheme } from "../../../../styles/app-styles";
import { BubbleMetaRow } from "./BubbleMetaRow";
import { renderHighlightedText } from "../utils/highlightText";

export interface TextBubbleContentProps {
  message: Message;
  text: string;
  textStyle: StyleProp<TextStyle>;
  inlineMetaStyle: StyleProp<TextStyle>;
  searchActive?: boolean;
  searchKeyword?: string;
  inlineMetaLabel: string;
  showInlineReceipt: boolean;
  isRead: boolean;
  receiptColor: string;
}

export const TextBubbleContent = memo(function TextBubbleContent(
  props: TextBubbleContentProps
) {
  const { styles } = useAppTheme();
  return (
    <View style={styles.bubbleTextWrap}>
      <Text style={[styles.bubbleTextBase, props.textStyle]}>
        {props.searchActive
          ? renderHighlightedText(
              props.text,
              props.searchKeyword,
              styles.searchHighlightText
            )
          : props.text}
        {/*
          内嵌行内 View 占位（RN 中 Text 可嵌套 View，Android 经
          TextInlineViewPlaceholderSpan 渲染为固定宽度的行内元素，
          等价于桌面端 .im-message-text-content::after）：只在文本末尾
          预留与时间戳等宽的空位，让"最后一行"为右下角时间让位，
          其余行铺满气泡宽度，多行时右侧不再出现空白。
        */}
        <View
          style={[
            styles.bubbleTextMetaSpacer,
            props.showInlineReceipt
              ? styles.bubbleTextMetaSpacerWithReceipt
              : null
          ]}
        />
      </Text>
      <BubbleMetaRow
        variant="text"
        inlineMetaLabel={props.inlineMetaLabel}
        inlineMetaStyle={props.inlineMetaStyle}
        showInlineReceipt={props.showInlineReceipt}
        status={Number(props.message.status || 0)}
        read={props.isRead}
        receiptColor={props.receiptColor}
      />
    </View>
  );
});

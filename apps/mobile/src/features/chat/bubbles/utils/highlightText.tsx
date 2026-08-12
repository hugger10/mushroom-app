import React from "react";
import { Text } from "react-native";
import type { TextStyle, StyleProp } from "react-native";

/**
 * 在文本中按 keyword（不区分大小写）高亮关键字。
 *
 * 用于搜索面板跳转回消息列表后，对命中文本进行视觉强调；不影响布局结构。
 */
export function renderHighlightedText(
  text: string,
  keyword: string | undefined,
  highlightStyle: StyleProp<TextStyle>
): React.ReactNode {
  const trimmed = keyword?.trim();
  if (!trimmed) return text;
  const safe = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${safe})`, "gi");
  const parts = text.split(re);
  if (parts.length <= 1) return text;
  const lower = trimmed.toLowerCase();
  return parts.map((part, idx) =>
    part.toLowerCase() === lower ? (
      <Text key={idx} style={highlightStyle}>
        {part}
      </Text>
    ) : (
      part
    )
  );
}

import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "../../components/ui";
import { useAppTheme } from "../../styles/app-styles";

export const QUICK_REACTION_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🙏"
] as const;

const EMOJI_CATEGORIES: {
  key: "frequent" | "smileys" | "emotions" | "gestures" | "symbols";
  emojis: string[];
}[] = [
  {
    key: "frequent",
    emojis: [
      "👍",
      "❤️",
      "😂",
      "😮",
      "😢",
      "🙏",
      "🔥",
      "🎉",
      "👏",
      "💯",
      "✅",
      "❌",
      "👀",
      "🤔",
      "😅",
      "😍",
      "😭",
      "😡"
    ]
  },
  {
    key: "smileys",
    emojis: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😅",
      "🤣",
      "😂",
      "🙂",
      "🙃",
      "😉",
      "😊",
      "😇",
      "🥰",
      "😍",
      "🤩",
      "😘",
      "😗",
      "😚",
      "😙",
      "🥲",
      "😋",
      "😛",
      "😜",
      "🤪",
      "😝",
      "🤑",
      "🤗",
      "🤭",
      "🤫",
      "🤔",
      "🫡",
      "🤐",
      "🤨",
      "😐",
      "😑"
    ]
  },
  {
    key: "emotions",
    emojis: [
      "😏",
      "😒",
      "🙄",
      "😬",
      "🤥",
      "😌",
      "😔",
      "😪",
      "🤤",
      "😴",
      "😷",
      "🤒",
      "🤕",
      "🤢",
      "🤮",
      "🤧",
      "🥵",
      "🥶",
      "🥴",
      "😵",
      "🤯",
      "🤠",
      "🥳",
      "🥸",
      "😎",
      "🤓",
      "🧐",
      "😕",
      "😟",
      "🙁",
      "😮",
      "😯",
      "😲",
      "😳",
      "🥺",
      "😦"
    ]
  },
  {
    key: "gestures",
    emojis: [
      "👋",
      "🤚",
      "🖐",
      "✋",
      "🖖",
      "👌",
      "🤌",
      "🤏",
      "✌️",
      "🤞",
      "🫰",
      "🤟",
      "🤘",
      "🤙",
      "👈",
      "👉",
      "👆",
      "🖕",
      "👇",
      "☝️",
      "👍",
      "👎",
      "✊",
      "👊",
      "🤛",
      "🤜",
      "👏",
      "🙌",
      "🫶",
      "👐",
      "🤲",
      "🤝",
      "🙏",
      "✍️",
      "💪",
      "🦾"
    ]
  },
  {
    key: "symbols",
    emojis: [
      "❤️",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🖤",
      "🤍",
      "🤎",
      "💔",
      "❣️",
      "💕",
      "💞",
      "💓",
      "💗",
      "💖",
      "💘",
      "💝",
      "💯",
      "💢",
      "💥",
      "💫",
      "💦",
      "💨",
      "🔥",
      "⭐",
      "🌟",
      "✨",
      "⚡",
      "☀️",
      "🎉",
      "🎊",
      "🎁",
      "🎂",
      "🏆",
      "🥇"
    ]
  }
];

export function EmojiPickerSheet(props: {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const isDark = theme.mode === "dark";
  const titleColor = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)";
  const dividerColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const [activeCategory, setActiveCategory] = useState(0);
  const activeCat = EMOJI_CATEGORIES[activeCategory];

  return (
    <BottomSheet
      visible={props.visible}
      onClose={props.onClose}
      testID="emoji-picker-sheet"
      snapPoints={["50%"]}
      containerStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: dividerColor
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: theme.colors.text
          }}
        >
          {t("chatMessage.chooseEmoji")}
        </Text>
        <Pressable onPress={props.onClose} hitSlop={8}>
          <Text style={{ color: theme.colors.accent, fontSize: 15 }}>
            {t("common.cancel")}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 4 }}
      >
        {EMOJI_CATEGORIES.map((cat, index) => {
          const active = index === activeCategory;
          return (
            <Pressable
              key={cat.key}
              onPress={() => setActiveCategory(index)}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderBottomWidth: 2,
                borderBottomColor: active ? theme.colors.accent : "transparent",
                backgroundColor: pressed
                  ? isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)"
                  : "transparent"
              })}
              testID={`emoji-picker-tab-${cat.key}`}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: active ? "600" : "400",
                  color: active ? theme.colors.accent : titleColor
                }}
              >
                {t(`chatMessage.emojiCategory.${cat.key}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={{ flex: 1, padding: 12, paddingBottom: 20 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {activeCat.emojis.map((emoji, idx) => (
            <Pressable
              key={`${activeCat.key}-${emoji}-${idx}`}
              onPress={() => {
                props.onSelect(emoji);
              }}
              style={({ pressed }) => ({
                width: "12.5%",
                aspectRatio: 1,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                backgroundColor: pressed
                  ? isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.05)"
                  : "transparent"
              })}
            >
              <Text style={{ fontSize: 26 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

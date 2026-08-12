import { memo, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import {
  MAX_VISIBLE_REACTION_GROUPS,
  formatReactionCount,
  type MessageReactionEntry
} from "@mushroom/shared";
import { useAppTheme } from "../../styles/app-styles";
import { hapticHeavy } from "../../platform/haptics";

export type ReactionGroup = {
  emoji: string;
  count: number;
  mine: boolean;
  users: MessageReactionEntry[];
};

export function groupReactions(
  reactions: MessageReactionEntry[] | undefined,
  currentUserId: number | null | undefined
): ReactionGroup[] {
  const map = new Map<string, ReactionGroup>();
  for (const item of reactions ?? []) {
    if (!item || !item.emoji) continue;
    const existing = map.get(item.emoji);
    if (existing) {
      existing.count += 1;
      existing.users.push(item);
      if (Number(item.user_id) === Number(currentUserId)) {
        existing.mine = true;
      }
    } else {
      map.set(item.emoji, {
        emoji: item.emoji,
        count: 1,
        mine: Number(item.user_id) === Number(currentUserId),
        users: [item]
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export const MessageReactionBar = memo(function MessageReactionBar(props: {
  reactions: MessageReactionEntry[] | undefined;
  currentUserId: number | null | undefined;
  isOwn: boolean;
  onToggle: (emoji: string) => void;
  onOpenDetail: () => void;
}) {
  const { theme } = useAppTheme();
  const groups = useMemo(
    () => groupReactions(props.reactions, props.currentUserId),
    [props.reactions, props.currentUserId]
  );

  if (groups.length === 0) return null;

  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);
  const visibleGroups = groups.slice(0, MAX_VISIBLE_REACTION_GROUPS);
  const hasOverflow = groups.length > MAX_VISIBLE_REACTION_GROUPS;

  const isDark = theme.mode === "dark";
  const bg = isDark ? "#2c2c2c" : "#ffffff";
  const myBorder = theme.colors.accentMuted;
  const textColor = theme.colors.text;
  const defaultBorder = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)";

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        marginTop: -6,
        marginLeft: props.isOwn ? 0 : 8,
        marginRight: props.isOwn ? 8 : 0,
        rowGap: 3,
        justifyContent: props.isOwn ? "flex-end" : "flex-start"
      }}
    >
      {visibleGroups.map(group => (
        <View key={group.emoji} style={{ position: "relative" }}>
          <Pressable
            onPress={() => props.onToggle(group.emoji)}
            onLongPress={() => {
              hapticHeavy();
              props.onOpenDetail?.();
            }}
            delayLongPress={250}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 6,
              paddingVertical: 1,
              borderRadius: 11,
              backgroundColor: bg,
              borderWidth: 1,
              borderColor: group.mine ? myBorder : defaultBorder,
              marginRight: 3
            }}
          >
            <Text style={{ fontSize: 13 }}>{group.emoji}</Text>
            {group.count > 1 ? (
              <Text
                style={{
                  fontSize: 11,
                  marginLeft: 3,
                  color: textColor,
                  fontWeight: "500"
                }}
              >
                {formatReactionCount(group.count)}
              </Text>
            ) : null}
          </Pressable>
        </View>
      ))}
      {hasOverflow ? (
        <Pressable
          onPress={props.onOpenDetail}
          onLongPress={() => {
            hapticHeavy();
            props.onOpenDetail?.();
          }}
          delayLongPress={250}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 11,
            backgroundColor: bg,
            borderWidth: 1,
            borderColor: defaultBorder,
            marginRight: 3
          }}
        >
          <Text style={{ fontSize: 11, color: textColor, fontWeight: "500" }}>
            {formatReactionCount(totalCount)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

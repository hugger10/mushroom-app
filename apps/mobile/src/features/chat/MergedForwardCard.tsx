import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import type { MergedForwardContent } from "@mushroom/shared";
import { useAppTheme } from "../../styles/app-styles";
import { useMobileAppState } from "../../app/controller/useMobileAppState";
import { getForwardCardTitle } from "../../utils/display";

export const MergedForwardCard = memo(function MergedForwardCard(props: {
  content: MergedForwardContent;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { theme } = useAppTheme();
  const state = useMobileAppState();
  const title = getForwardCardTitle({
    items: props.content.messages,
    fallbackTitle: props.content.title,
    contacts: state.contacts ?? [],
    loginUser: state.snapshot?.auth.user ?? null
  });

  return (
    <Pressable
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      delayLongPress={200}
    >
      <View
        style={{
          minWidth: 180,
          maxWidth: 260
        }}
      >
        <Text
          style={{
            fontWeight: "600",
            fontSize: 14,
            color: theme.colors.text,
            marginBottom: 4
          }}
        >
          {title}
        </Text>
        <View
          style={{
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.border,
            paddingLeft: 8
          }}
        >
          {props.content.summary.map((line, i) => (
            <Text
              key={i}
              numberOfLines={1}
              style={{
                fontSize: 12,
                color: theme.colors.textSoft,
                lineHeight: 18
              }}
            >
              {line}
            </Text>
          ))}
        </View>
      </View>
    </Pressable>
  );
});

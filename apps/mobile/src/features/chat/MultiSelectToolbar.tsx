import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../styles/app-styles";

export function MultiSelectToolbar(props: {
  selectedCount: number;
  onForwardOneByOne: () => void;
  onForwardMerged: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderTopWidth: 0.5,
        borderTopColor: theme.colors.border,
        paddingBottom: 4
      }}
    >
      {/* Selected count */}
      <Text
        style={{
          fontSize: 12,
          color: theme.colors.textSoft,
          textAlign: "center",
          paddingTop: 6,
          paddingBottom: 4
        }}
      >
        {t("chatMessage.selectedCount", { count: props.selectedCount })}
      </Text>

      {/* Action buttons */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-around",
          paddingVertical: 6,
          paddingHorizontal: 12
        }}
      >
        <Pressable
          style={{
            alignItems: "center",
            opacity: props.selectedCount > 0 ? 1 : 0.4
          }}
          disabled={props.selectedCount === 0}
          onPress={props.onForwardOneByOne}
        >
          <Ionicons
            name="arrow-redo-outline"
            size={22}
            color={theme.colors.text}
          />
          <Text
            style={{ fontSize: 11, color: theme.colors.text, marginTop: 2 }}
          >
            {t("chatMessage.forwardOneByOne")}
          </Text>
        </Pressable>

        <Pressable
          style={{
            alignItems: "center",
            opacity: props.selectedCount > 0 ? 1 : 0.4
          }}
          disabled={props.selectedCount === 0}
          onPress={props.onForwardMerged}
        >
          <Ionicons name="copy-outline" size={22} color={theme.colors.text} />
          <Text
            style={{ fontSize: 11, color: theme.colors.text, marginTop: 2 }}
          >
            {t("chatMessage.forwardMerged")}
          </Text>
        </Pressable>

        <Pressable style={{ alignItems: "center" }} onPress={props.onCancel}>
          <Ionicons
            name="close-outline"
            size={22}
            color={theme.colors.textSoft}
          />
          <Text
            style={{ fontSize: 11, color: theme.colors.textSoft, marginTop: 2 }}
          >
            {t("common.cancel")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

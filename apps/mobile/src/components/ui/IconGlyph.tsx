import {
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../styles/app-styles";

export function IconGlyph(props: {
  name:
    | "chat"
    | "contacts"
    | "settings"
    | "group"
    | "search"
    | "compose"
    | "back"
    | "phone"
    | "video"
    | "add"
    | "add-person"
    | "emoji"
    | "mic"
    | "edit"
    | "qr-scanner";
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: TextStyle | TextStyle[] | false | null | undefined;
}) {
  const { styles } = useAppTheme();
  const iconColor = props.active
    ? styles.iconGlyphActive.color
    : styles.iconGlyph.color;
  const glyphMap = {
    chat: "chatbubble-ellipses-outline",
    contacts: "people-outline",
    settings: "settings-outline",
    group: "people-outline",
    search: "search-outline",
    compose: "sync-outline",
    back: "chevron-back",
    add: "add-outline",
    "add-person": "person-add-outline",
    emoji: "images-outline",
    phone: "call-outline",
    video: "videocam-outline",
    mic: "mic-outline",
    edit: "create-outline",
    "qr-scanner": "scan-outline"
  } as const;

  return (
    <View style={[styles.iconGlyphWrap, props.style]}>
      <Ionicons
        name={glyphMap[props.name]}
        style={[
          styles.iconGlyph,
          props.active ? styles.iconGlyphActive : null,
          props.name === "back" ? styles.iconGlyphBack : null,
          props.textStyle
        ]}
        color={iconColor}
      />
    </View>
  );
}

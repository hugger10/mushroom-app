import { useEffect, useState } from "react";
import {
  Image,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from "react-native";

import { useAppTheme } from "../../styles/app-styles";

export function AppAvatar(props: {
  label: string;
  imageUrl?: string | null;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  testID?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const { theme } = useAppTheme();

  useEffect(() => {
    setLoaded(false);
  }, [props.imageUrl]);

  return (
    <View
      style={[
        props.style,
        props.imageUrl && !loaded
          ? { backgroundColor: theme.colors.skeleton }
          : null,
        props.imageUrl ? { overflow: "hidden" } : null
      ]}
      testID={props.testID}
    >
      {props.imageUrl ? (
        <Image
          source={{ uri: props.imageUrl }}
          style={[{ width: "100%", height: "100%" }, props.imageStyle]}
          resizeMode="cover"
          onLoad={() => setLoaded(true)}
        />
      ) : (
        <Text style={props.textStyle}>{(props.label || "?").slice(0, 1)}</Text>
      )}
    </View>
  );
}

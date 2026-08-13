import { useState, type ReactNode } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../styles/app-styles";

export function AuthField(props: {
  icon: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  placeholderTextColor?: string;
  secureTextEntry?: boolean;
  toggleSecure?: boolean;
  prefix?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  rightAccessory?: ReactNode;
  testID?: string;
}) {
  const { styles, theme } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(
    props.secureTextEntry && props.toggleSecure
  );

  const showSecureToggle = Boolean(props.toggleSecure);
  const effectiveSecure =
    props.secureTextEntry && (showSecureToggle ? hidden : true);

  return (
    <View style={[styles.authFieldRow, focused && styles.authFieldRowFocused]}>
      <Ionicons
        name={props.icon}
        size={20}
        color={styles.authFieldIcon.color}
      />
      {props.prefix ? (
        <Text style={styles.authPhonePrefix}>{props.prefix}</Text>
      ) : null}
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={
          props.placeholderTextColor ?? theme.colors.inputPlaceholder
        }
        style={styles.authFieldInput}
        secureTextEntry={effectiveSecure}
        keyboardType={props.keyboardType}
        maxLength={props.maxLength}
        autoCapitalize={props.autoCapitalize}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        testID={props.testID}
      />
      {props.rightAccessory ?? null}
      {showSecureToggle ? (
        <Pressable
          hitSlop={8}
          onPress={() => setHidden(current => !current)}
          style={styles.authEyeBtn}
          testID="auth-toggle-secure"
        >
          <Ionicons
            name={hidden ? "eye-outline" : "eye-off-outline"}
            size={20}
            color={styles.authFieldIcon.color}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

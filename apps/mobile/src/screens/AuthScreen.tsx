import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  NICKNAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  USERNAME_MAX_LENGTH
} from "@mushroom/shared";
import loginBg from "../assets/login-bg.png";
import { useAppTheme } from "../styles/app-styles";
import type { AuthMode } from "../types/app";

export function AuthScreen(props: {
  mode: AuthMode;
  pending: boolean;
  loginForm: {
    username: string;
    password: string;
  };
  registerForm: {
    username: string;
    nickname: string;
    password: string;
    confirmPassword: string;
  };
  onChangeMode: (mode: AuthMode) => void;
  onChangeLoginForm: (value: { username?: string; password?: string }) => void;
  onChangeRegisterForm: (value: {
    username?: string;
    nickname?: string;
    password?: string;
    confirmPassword?: string;
  }) => void;
  onLogin: () => void;
  onRegister: () => void;
}) {
  const { t } = useTranslation();
  const isLogin = props.mode === "login";
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <ImageBackground
      source={loginBg}
      resizeMode="cover"
      style={styles.authRoot}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.authKeyboardShell}
      >
        <ScrollView
          style={styles.authScroll}
          contentContainerStyle={styles.authScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 占位区，把表单推到底部 */}
          <View style={styles.authSpacer} />

          {/* 底部表单区域 */}
          <View
            style={[
              styles.authFormArea,
              { paddingBottom: Math.max(insets.bottom + 16, 40) }
            ]}
          >
            <View style={styles.authInputStack}>
              {isLogin ? (
                <>
                  <TextInput
                    value={props.loginForm.username}
                    placeholder={t("auth.username")}
                    placeholderTextColor={theme.colors.inputPlaceholder}
                    style={styles.authInput}
                    autoCapitalize="none"
                    onChangeText={value =>
                      props.onChangeLoginForm({ username: value })
                    }
                  />
                  <TextInput
                    value={props.loginForm.password}
                    placeholder={t("auth.password")}
                    placeholderTextColor={theme.colors.inputPlaceholder}
                    style={styles.authInput}
                    secureTextEntry
                    onChangeText={value =>
                      props.onChangeLoginForm({ password: value })
                    }
                  />
                </>
              ) : (
                <>
                  <TextInput
                    value={props.registerForm.nickname}
                    placeholder={t("auth.nickname")}
                    placeholderTextColor={theme.colors.inputPlaceholder}
                    style={styles.authInput}
                    maxLength={NICKNAME_MAX_LENGTH}
                    onChangeText={value =>
                      props.onChangeRegisterForm({ nickname: value })
                    }
                  />
                  <TextInput
                    value={props.registerForm.username}
                    placeholder={t("auth.username")}
                    placeholderTextColor={theme.colors.inputPlaceholder}
                    style={styles.authInput}
                    autoCapitalize="none"
                    maxLength={USERNAME_MAX_LENGTH}
                    onChangeText={value =>
                      props.onChangeRegisterForm({ username: value })
                    }
                  />
                  <TextInput
                    value={props.registerForm.password}
                    placeholder={t("auth.password")}
                    placeholderTextColor={theme.colors.inputPlaceholder}
                    style={styles.authInput}
                    secureTextEntry
                    maxLength={PASSWORD_MAX_LENGTH}
                    onChangeText={value =>
                      props.onChangeRegisterForm({ password: value })
                    }
                  />
                  <TextInput
                    value={props.registerForm.confirmPassword}
                    placeholder={t("auth.confirmPassword")}
                    placeholderTextColor={theme.colors.inputPlaceholder}
                    style={styles.authInput}
                    secureTextEntry
                    maxLength={PASSWORD_MAX_LENGTH}
                    onChangeText={value =>
                      props.onChangeRegisterForm({ confirmPassword: value })
                    }
                  />
                </>
              )}
            </View>

            {/* 主按钮 */}
            <Pressable
              disabled={props.pending}
              onPress={isLogin ? props.onLogin : props.onRegister}
              style={({ pressed }) => [
                styles.authButton,
                props.pending && styles.authButtonDisabled,
                pressed && !props.pending && styles.authButtonPressed
              ]}
            >
              <Text style={styles.authButtonLabel}>
                {props.pending
                  ? t("common.loading")
                  : isLogin
                    ? t("auth.login")
                    : t("auth.register")}
              </Text>
            </Pressable>

            {/* 切换登录/注册 */}
            <View style={styles.authModeToggle}>
              <Text style={styles.authModeHint}>
                {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}
              </Text>
              <Pressable
                disabled={props.pending}
                onPress={() =>
                  props.onChangeMode(isLogin ? "register" : "login")
                }
              >
                <Text style={styles.authModeLink}>
                  {isLogin ? t("auth.register") : t("auth.login")}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

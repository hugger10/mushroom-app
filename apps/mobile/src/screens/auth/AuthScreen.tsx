import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  NICKNAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  USERNAME_MAX_LENGTH
} from "@mushroom/shared";
import { useAppTheme } from "../../styles/app-styles";
import type { AuthMethod, AuthMode } from "../../types/app";
import { AuthField } from "./AuthField";
import { AuthMethodTabs } from "./AuthMethodTabs";
import { CodeSendButton } from "./CodeSendButton";
import appLogo from "../../assets/app-logo.png";

const CODE_RESEND_SECONDS = 60;

function AuthBackground() {
  const { styles } = useAppTheme();

  return (
    <View pointerEvents="none" style={[styles.screenCanvas]}>
      <View style={styles.authArcBack} />
      <View style={styles.authArcMid} />
      <View style={styles.authArcFront} />
      <View style={styles.authRingLarge} />
      <View style={styles.authRingMedium} />

      {/* 右上：聊天气泡（去省略号） */}
      <View style={styles.authChatBubble}>
        <View style={styles.authChatBubbleTail} />
      </View>

      {/* 左上：空心聊天气泡 + 消息点 */}
      <View style={styles.authChatOutlineWrap}>
        <View style={styles.authChatOutlineBox}>
          <View style={styles.authChatOutline} />
          <View style={styles.authChatOutlineTail} />
        </View>
        <View style={styles.authChatOutlineDot} />
      </View>

      {/* 下方零星点缀：消息小点 */}
      <View style={styles.authChatDot} />
    </View>
  );
}

export function AuthScreen(props: {
  mode: AuthMode;
  authMethod: AuthMethod;
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
  phoneLoginForm: {
    phone: string;
    code: string;
  };
  phoneRegisterForm: {
    phone: string;
    code: string;
    nickname: string;
    password: string;
  };
  onChangeMode: (mode: AuthMode) => void;
  onChangeAuthMethod: (method: AuthMethod) => void;
  onChangeLoginForm: (value: { username?: string; password?: string }) => void;
  onChangeRegisterForm: (value: {
    username?: string;
    nickname?: string;
    password?: string;
    confirmPassword?: string;
  }) => void;
  onChangePhoneLoginForm: (value: { phone?: string; code?: string }) => void;
  onChangePhoneRegisterForm: (value: {
    phone?: string;
    code?: string;
    nickname?: string;
    password?: string;
  }) => void;
  onLogin: () => void;
  onRegister: () => void;
  onPhoneLogin: () => void;
  onPhoneRegister: () => void;
  onSendCode: () => void;
}) {
  const { t } = useTranslation();
  const { styles } = useAppTheme();
  const insets = useSafeAreaInsets();
  const isLogin = props.mode === "login";
  const isAccount = props.authMethod === "account";

  const [codeRemaining, setCodeRemaining] = useState(0);

  useEffect(() => {
    if (codeRemaining <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setCodeRemaining(current => current - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [codeRemaining]);

  const handleSendCode = () => {
    props.onSendCode();
    setCodeRemaining(CODE_RESEND_SECONDS);
  };

  const handleSubmit = isAccount
    ? isLogin
      ? props.onLogin
      : props.onRegister
    : isLogin
      ? props.onPhoneLogin
      : props.onPhoneRegister;

  const renderAccountFields = () =>
    isLogin ? (
      <>
        <AuthField
          icon="person-outline"
          value={props.loginForm.username}
          onChangeText={value => props.onChangeLoginForm({ username: value })}
          placeholder={t("auth.username")}
          autoCapitalize="none"
          testID="auth-username"
        />
        <AuthField
          icon="lock-closed-outline"
          value={props.loginForm.password}
          onChangeText={value => props.onChangeLoginForm({ password: value })}
          placeholder={t("auth.password")}
          secureTextEntry
          toggleSecure
          testID="auth-password"
        />
      </>
    ) : (
      <>
        <AuthField
          icon="happy-outline"
          value={props.registerForm.nickname}
          onChangeText={value =>
            props.onChangeRegisterForm({ nickname: value })
          }
          placeholder={t("auth.nickname")}
          maxLength={NICKNAME_MAX_LENGTH}
          testID="auth-nickname"
        />
        <AuthField
          icon="person-outline"
          value={props.registerForm.username}
          onChangeText={value =>
            props.onChangeRegisterForm({ username: value })
          }
          placeholder={t("auth.username")}
          autoCapitalize="none"
          maxLength={USERNAME_MAX_LENGTH}
          testID="auth-username"
        />
        <AuthField
          icon="lock-closed-outline"
          value={props.registerForm.password}
          onChangeText={value =>
            props.onChangeRegisterForm({ password: value })
          }
          placeholder={t("auth.password")}
          secureTextEntry
          toggleSecure
          maxLength={PASSWORD_MAX_LENGTH}
          testID="auth-password"
        />
        <AuthField
          icon="shield-checkmark-outline"
          value={props.registerForm.confirmPassword}
          onChangeText={value =>
            props.onChangeRegisterForm({ confirmPassword: value })
          }
          placeholder={t("auth.confirmPassword")}
          secureTextEntry
          toggleSecure
          maxLength={PASSWORD_MAX_LENGTH}
          testID="auth-confirm-password"
        />
      </>
    );

  const renderPhoneFields = () =>
    isLogin ? (
      <>
        <AuthField
          icon="phone-portrait-outline"
          value={props.phoneLoginForm.phone}
          onChangeText={value => props.onChangePhoneLoginForm({ phone: value })}
          placeholder={t("auth.phonePlaceholder")}
          prefix="+86"
          keyboardType="phone-pad"
          maxLength={PHONE_MAX_LENGTH}
          testID="auth-phone"
        />
        <AuthField
          icon="chatbox-ellipses-outline"
          value={props.phoneLoginForm.code}
          onChangeText={value => props.onChangePhoneLoginForm({ code: value })}
          placeholder={t("auth.codePlaceholder")}
          keyboardType="number-pad"
          maxLength={6}
          rightAccessory={
            <CodeSendButton
              remaining={codeRemaining}
              onPress={handleSendCode}
            />
          }
          testID="auth-code"
        />
      </>
    ) : (
      <>
        <AuthField
          icon="phone-portrait-outline"
          value={props.phoneRegisterForm.phone}
          onChangeText={value =>
            props.onChangePhoneRegisterForm({ phone: value })
          }
          placeholder={t("auth.phonePlaceholder")}
          prefix="+86"
          keyboardType="phone-pad"
          maxLength={PHONE_MAX_LENGTH}
          testID="auth-phone"
        />
        <AuthField
          icon="chatbox-ellipses-outline"
          value={props.phoneRegisterForm.code}
          onChangeText={value =>
            props.onChangePhoneRegisterForm({ code: value })
          }
          placeholder={t("auth.codePlaceholder")}
          keyboardType="number-pad"
          maxLength={6}
          rightAccessory={
            <CodeSendButton
              remaining={codeRemaining}
              onPress={handleSendCode}
            />
          }
          testID="auth-code"
        />
        <AuthField
          icon="happy-outline"
          value={props.phoneRegisterForm.nickname}
          onChangeText={value =>
            props.onChangePhoneRegisterForm({ nickname: value })
          }
          placeholder={t("auth.nickname")}
          maxLength={NICKNAME_MAX_LENGTH}
          testID="auth-nickname"
        />
        <AuthField
          icon="lock-closed-outline"
          value={props.phoneRegisterForm.password}
          onChangeText={value =>
            props.onChangePhoneRegisterForm({ password: value })
          }
          placeholder={t("auth.password")}
          secureTextEntry
          toggleSecure
          maxLength={PASSWORD_MAX_LENGTH}
          testID="auth-password"
        />
      </>
    );

  return (
    <View style={styles.authRoot}>
      <AuthBackground />
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
          <View style={{ paddingTop: Math.max(insets.top, 24) }}>
            {/* 顶部 logo */}
            <View style={styles.authLogoWrap}>
              <Image
                source={appLogo}
                style={styles.authLogo}
                resizeMode="contain"
              />
            </View>

            {/* 顶部占位：保持表单卡片落在原有高度 */}
            <View style={styles.authSpacer} />

            {/* 表单卡片 */}
            <View style={styles.authCard}>
              <View style={styles.authCardHeader}>
                <Text style={styles.authCardTitle}>
                  {isLogin ? t("auth.login") : t("auth.register")}
                </Text>
                <Text style={styles.authCardSubtitle}>
                  {isLogin
                    ? t("auth.loginSubtitle")
                    : t("auth.registerSubtitle")}
                </Text>
              </View>

              <AuthMethodTabs
                value={props.authMethod}
                onChange={props.onChangeAuthMethod}
              />
              <View style={styles.authFieldStack}>
                {isAccount ? renderAccountFields() : renderPhoneFields()}
              </View>

              <Pressable
                disabled={props.pending}
                onPress={handleSubmit}
                style={({ pressed }) => [
                  styles.authButton,
                  props.pending && styles.authButtonDisabled,
                  pressed && !props.pending && styles.authButtonPressed
                ]}
                testID="auth-submit"
              >
                {props.pending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.authButtonLabel}>
                    {isLogin ? t("auth.login") : t("auth.register")}
                  </Text>
                )}
              </Pressable>

              <View style={styles.authModeToggle}>
                <Text style={styles.authModeHint}>
                  {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}
                </Text>
                <Pressable
                  disabled={props.pending}
                  onPress={() =>
                    props.onChangeMode(isLogin ? "register" : "login")
                  }
                  testID="auth-toggle-mode"
                >
                  <Text style={styles.authModeLink}>
                    {isLogin ? t("auth.register") : t("auth.login")}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View
              style={{
                height: Math.max(insets.bottom + 24, 40)
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

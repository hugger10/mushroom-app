import { useMemo } from "react";
import { ImageBackground, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Icon from "react-native-vector-icons/Ionicons";
import { PressableRow } from "../../../hooks/usePressAnimation";
import { useAppTheme } from "../../../styles/app-styles";
import { useChatBackground } from "../../../styles/chat-background-context";
import {
  CHAT_BACKGROUND_IDS,
  CHAT_BACKGROUND_PRESETS,
  resolveChatBackground,
  type ChatBackgroundId
} from "../../../styles/chat-backgrounds";
import type { AppStackParamList } from "../../../types/navigation";
import { AccountPageShell } from "../AccountPageShell";

const PREVIEW_OWN_TEXT = "hello";
const PREVIEW_OTHER_TEXT = "hi there";

function BackgroundTile(props: {
  id: ChatBackgroundId;
  label: string;
  selected: boolean;
  onSelect: (id: ChatBackgroundId) => void;
}) {
  const { styles, resolvedTheme } = useAppTheme();
  const resolved = resolveChatBackground(
    props.id,
    resolvedTheme === "dark" ? "dark" : "light"
  );
  return (
    <PressableRow
      onPress={() => props.onSelect(props.id)}
      style={[styles.chatBackgroundTile]}
      idleColor="transparent"
      testID={`me-chat-background-tile-${props.id}`}
    >
      <ImageBackground
        source={resolved.source}
        resizeMode={resolved.resizeMode}
        style={[
          styles.chatBackgroundTileImage,
          props.selected ? styles.chatBackgroundTileSelected : null
        ]}
      >
        {resolved.darkOverlay ? (
          <View style={styles.chatBackgroundDarkOverlay} />
        ) : null}
        {props.selected ? (
          <View style={styles.chatBackgroundTileCheck}>
            <Icon name="checkmark" size={14} color="#FFFFFF" />
          </View>
        ) : null}
      </ImageBackground>
      <Text
        style={[
          styles.chatBackgroundTileLabel,
          props.selected ? styles.chatBackgroundTileLabelSelected : null
        ]}
        numberOfLines={1}
      >
        {props.label}
      </Text>
    </PressableRow>
  );
}

/**
 * 聊天背景选择页：顶部实时预览 + 网格缩略图，点击即生效（对齐微信/Telegram
 * 「无保存按钮」的交互）。选择结果通过 `ChatBackgroundProvider` 全局持久化，
 * 聊天会话立即生效。
 */
export function ChatBackgroundScreen() {
  const { t } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { styles, theme, resolvedTheme } = useAppTheme();
  const { chatBackgroundId, setChatBackgroundId } = useChatBackground();

  const selected = resolveChatBackground(
    chatBackgroundId,
    resolvedTheme === "dark" ? "dark" : "light"
  );

  const options = useMemo(
    () =>
      CHAT_BACKGROUND_IDS.map(id => ({
        id,
        label: t(CHAT_BACKGROUND_PRESETS[id].i18nKey)
      })),
    [t]
  );

  return (
    <AccountPageShell
      title={t("me.chatBackgroundPage.title")}
      onBack={() => navigation.goBack()}
      testID="me-chat-background-page"
    >
      <ScrollView
        style={styles.chatBackgroundScroll}
        contentContainerStyle={styles.chatBackgroundContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.chatBackgroundSectionLabel}>
          {t("me.chatBackgroundPage.preview")}
        </Text>
        <View style={styles.chatBackgroundPreviewCard}>
          <ImageBackground
            source={selected.source}
            resizeMode={selected.resizeMode}
            style={styles.chatBackgroundPreviewInner}
          >
            {selected.darkOverlay ? (
              <View style={styles.chatBackgroundDarkOverlay} />
            ) : null}
            <View
              style={[
                styles.chatBackgroundPreviewBubbleRow,
                styles.chatBackgroundPreviewBubbleOwn
              ]}
            >
              <View
                style={[
                  styles.chatBackgroundPreviewBubble,
                  { backgroundColor: theme.colors.bubbleOwn }
                ]}
              >
                <Text
                  style={[
                    styles.chatBackgroundPreviewBubbleText,
                    resolvedTheme === "dark"
                      ? styles.chatBackgroundPreviewBubbleTextDark
                      : null
                  ]}
                >
                  {PREVIEW_OWN_TEXT}
                </Text>
              </View>
            </View>
            <View style={styles.chatBackgroundPreviewBubbleRow}>
              <View
                style={[
                  styles.chatBackgroundPreviewBubble,
                  { backgroundColor: theme.colors.bubbleOther }
                ]}
              >
                <Text
                  style={[
                    styles.chatBackgroundPreviewBubbleText,
                    resolvedTheme === "dark"
                      ? styles.chatBackgroundPreviewBubbleTextDark
                      : null
                  ]}
                >
                  {PREVIEW_OTHER_TEXT}
                </Text>
              </View>
            </View>
          </ImageBackground>
        </View>

        <Text style={styles.chatBackgroundSectionLabel}>
          {t("me.chatBackgroundPage.choose")}
        </Text>
        <View style={styles.chatBackgroundGrid}>
          {options.map(option => (
            <BackgroundTile
              key={option.id}
              id={option.id}
              label={option.label}
              selected={option.id === chatBackgroundId}
              onSelect={setChatBackgroundId}
            />
          ))}
        </View>
      </ScrollView>
    </AccountPageShell>
  );
}

import { memo, useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle
} from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import {
  DEFAULT_ATTACHMENT_SIZE_LIMITS,
  formatFileSize,
  type MessageFileContent
} from "@mushroom/shared";
import { useAppTheme } from "../../../../styles/app-styles";
import type { FileCacheState } from "../hooks/useFileCache";
import { BubbleMetaRow } from "./BubbleMetaRow";

export interface FileBubbleContentProps {
  content: MessageFileContent;
  fileCacheState: FileCacheState;
  isOwn: boolean;
  textStyle: StyleProp<TextStyle>;
  inlineMetaStyle: StyleProp<TextStyle>;
  // meta row：绝对定位叠在卡片右下角，与文字气泡同一机制
  inlineMetaLabel: string;
  showInlineReceipt: boolean;
  status: number;
  read: boolean;
  receiptColor: string;
  onOpenAttachment: () => void;
  onLongPress: () => void;
}

function SpinningIcon({ size, color }: { size: number; color: string }) {
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    anim.start();
    return () => anim.stop();
  }, [spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"]
  });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Ionicons name="sync-outline" size={size} color={color} />
    </Animated.View>
  );
}

export const FileBubbleContent = memo(function FileBubbleContent(
  props: FileBubbleContentProps
) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const { content, fileCacheState } = props;
  return (
    <View style={styles.fileBubbleWrap}>
      <Pressable
        style={styles.fileCard}
        onPress={props.onOpenAttachment}
        onLongPress={props.onLongPress}
        delayLongPress={200}
      >
        <View
          style={[
            styles.fileIconBox,
            props.isOwn ? styles.fileIconBoxOwn : styles.fileIconBoxOther
          ]}
        >
          <Ionicons
            name="document-outline"
            size={22}
            color={props.isOwn ? "rgba(255,255,255,0.9)" : theme.colors.accent}
          />
        </View>
        <View style={styles.fileInfoWrap}>
          <Text
            style={[styles.fileName, props.textStyle]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {content.name || t("chatMessage.unknownFile")}
          </Text>
          <Text
            style={[styles.fileMeta, props.inlineMetaStyle]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {formatFileSize(content.size)}
            {!props.isOwn && (
              <>
                {"  ·  "}
                {fileCacheState === "downloaded"
                  ? t("chat.fileCacheDownloaded")
                  : fileCacheState === "downloading" ||
                      fileCacheState === "checking"
                    ? t("chat.fileCacheDownloading")
                    : content.size > DEFAULT_ATTACHMENT_SIZE_LIMITS.file
                      ? t("chatMessage.tapToDownload")
                      : t("chat.fileCacheNotDownloaded")}
              </>
            )}
          </Text>
        </View>
        {!props.isOwn ? (
          fileCacheState === "downloaded" ? (
            <Ionicons
              name="checkmark-circle-outline"
              size={20}
              color={theme.colors.success}
            />
          ) : fileCacheState === "downloading" ||
            fileCacheState === "checking" ? (
            <SpinningIcon size={20} color={theme.colors.accent} />
          ) : (
            <Ionicons
              name="download-outline"
              size={20}
              color={theme.colors.accent}
            />
          )
        ) : null}
      </Pressable>
      <BubbleMetaRow
        variant="file"
        inlineMetaLabel={props.inlineMetaLabel}
        inlineMetaStyle={props.inlineMetaStyle}
        showInlineReceipt={props.showInlineReceipt}
        status={props.status}
        read={props.read}
        receiptColor={props.receiptColor}
      />
    </View>
  );
});

import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import { BottomSheet } from "../../components/ui";
import { useAppTheme } from "../../styles/app-styles";

type SheetItem = {
  key: string;
  label: string;
  icon: string;
  onPress?: () => void;
  disabled?: boolean;
};

/**
 * AttachmentSheet (T12 — Phase B).
 *
 * Migrated from a bespoke JS-driven `Animated` + `Modal` implementation to the
 * shared `BottomSheet` primitive backed by `@gorhom/bottom-sheet`, which runs
 * its translation/backdrop on the UI thread and adds native pan-to-close.
 *
 * "原图" 复选框已迁移到 ImageSendPreview 全屏预览页（对齐微信/Telegram 的
 * "选完图 → 预览 → 勾原图 → 发送" 流程），不在此处展示。
 */
export function AttachmentSheet(props: {
  visible: boolean;
  onClose: () => void;
  onPickGallery: () => void;
  onPickCamera: () => void;
  onPickVideo: () => void;
  onPickDocument: () => void;
}) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const pendingHandlerRef = useRef<(() => void) | null>(null);
  const wasVisibleRef = useRef<boolean>(props.visible);

  // Defer the user's chosen action until after the sheet finishes its native
  // dismiss animation. This avoids the previous setTimeout race by piggy-backing
  // on the controlled `visible` prop transition driven by the parent.
  useEffect(() => {
    if (wasVisibleRef.current && !props.visible && pendingHandlerRef.current) {
      const handler = pendingHandlerRef.current;
      pendingHandlerRef.current = null;
      // Microtask defer keeps us off the same render cycle that triggered the
      // visibility flip.
      Promise.resolve().then(handler);
    }
    wasVisibleRef.current = props.visible;
  }, [props.visible]);

  function makePress(handler: () => void) {
    return () => {
      pendingHandlerRef.current = handler;
      props.onClose();
    };
  }

  const items: SheetItem[] = [
    {
      key: "gallery",
      label: t("chatMessage.gallery"),
      icon: "images-outline",
      onPress: makePress(props.onPickGallery)
    },
    {
      key: "camera",
      label: t("chatMessage.camera"),
      icon: "camera-outline",
      onPress: makePress(props.onPickCamera)
    },
    {
      key: "video",
      label: t("chatMessage.video"),
      icon: "videocam-outline",
      onPress: makePress(props.onPickVideo)
    },
    {
      key: "document",
      label: t("chatMessage.document"),
      icon: "document-attach-outline",
      onPress: makePress(props.onPickDocument)
    },
    {
      key: "location",
      label: t("chatMessage.location"),
      icon: "location-outline",
      disabled: true
    },
    {
      key: "contact",
      label: t("chatMessage.contact"),
      icon: "person-outline",
      disabled: true
    },
    {
      key: "poll",
      label: t("chatMessage.poll"),
      icon: "stats-chart-outline",
      disabled: true
    }
  ];

  return (
    <BottomSheet
      visible={props.visible}
      onClose={props.onClose}
      testID="chat-attach-sheet"
    >
      <View style={styles.attachSheetGrid}>
        {items.map(item => (
          <Pressable
            key={item.key}
            style={[
              styles.attachSheetItem,
              item.disabled ? styles.attachSheetItemDisabled : null
            ]}
            disabled={item.disabled}
            onPress={item.onPress}
            testID={`chat-attach-${item.key}`}
          >
            <View style={styles.attachSheetItemIcon}>
              <Ionicons
                name={item.icon}
                size={26}
                color={theme.colors.accentStrong}
              />
            </View>
            <Text style={styles.attachSheetItemLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

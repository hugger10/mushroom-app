import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "./BottomSheet";
import { PrimaryButton } from "./PrimaryButton";
import { useAppTheme } from "../../styles/app-styles";

/**
 * Single-step logout confirmation sheet.
 *
 * Replaces the previous two-step `Alert.alert` flow on the Me screen by
 * folding the "Sign out?" prompt and the "Clear local data?" prompt into a
 * single bottom sheet. The wipe-local-data option is exposed as an
 * unchecked checkbox above the action buttons so the user only has to
 * confirm once.
 */
export function LogoutConfirmSheet(props: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (wipeLocalData: boolean) => void;
}) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const [wipe, setWipe] = useState(false);

  // Reset the checkbox every time the sheet is (re)opened so an earlier
  // tick does not silently carry over into a later sign-out attempt.
  useEffect(() => {
    if (props.visible) {
      setWipe(false);
    }
  }, [props.visible]);

  return (
    <BottomSheet
      visible={props.visible}
      title={t("me.logout.confirmTitle")}
      onClose={props.onCancel}
      testID="me-logout-sheet"
    >
      <View>
        <Text
          style={{
            fontSize: 14,
            lineHeight: 20,
            color: theme.colors.textSoft,
            marginBottom: 16
          }}
        >
          {t("me.logout.confirmMessage")}
        </Text>

        <Pressable
          onPress={() => setWipe(prev => !prev)}
          testID="me-logout-wipe-toggle"
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "flex-start",
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: theme.colors.surfaceMuted,
            opacity: pressed ? 0.85 : 1,
            marginBottom: 16
          })}
        >
          <View
            style={[
              styles.groupSelectCheckbox,
              wipe ? styles.groupSelectCheckboxActive : null,
              { marginTop: 2, marginRight: 10 }
            ]}
          >
            {wipe ? (
              <Icon
                name="checkmark"
                size={14}
                color={theme.colors.textInverse}
              />
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: theme.colors.text
              }}
            >
              {t("me.logout.wipeOptionLabel")}
            </Text>
            <Text
              style={{
                fontSize: 12,
                lineHeight: 18,
                color: theme.colors.textMuted,
                marginTop: 4
              }}
            >
              {t("me.logout.wipeOptionHint")}
            </Text>
          </View>
        </Pressable>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <PrimaryButton
            tone="secondary"
            label={t("me.logout.cancelButton")}
            onPress={props.onCancel}
            testID="me-logout-cancel"
          />
          <PrimaryButton
            tone="danger"
            label={t("me.logout.confirmButton")}
            onPress={() => props.onConfirm(wipe)}
            testID="me-logout-confirm"
          />
        </View>
      </View>
    </BottomSheet>
  );
}

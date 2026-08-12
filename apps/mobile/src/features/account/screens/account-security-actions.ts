import { Alert } from "react-native";
import type { TFunction } from "i18next";

export function confirmLogoutOtherDevices(t: TFunction, onConfirm: () => void) {
  Alert.alert(
    t("me.security.logoutOthersTitle"),
    t("me.security.logoutOthersMessage"),
    [
      { text: t("me.security.cancel"), style: "cancel" },
      {
        text: t("me.security.logoutOthersConfirm"),
        style: "destructive",
        onPress: onConfirm
      }
    ]
  );
}

export function confirmLogoutAllDevices(t: TFunction, onConfirm: () => void) {
  Alert.alert(
    t("me.security.logoutAllTitle"),
    t("me.security.logoutAllMessage"),
    [
      { text: t("me.security.cancel"), style: "cancel" },
      {
        text: t("me.security.logoutAllConfirm"),
        style: "destructive",
        onPress: onConfirm
      }
    ]
  );
}

import { Alert } from "react-native";
import { i18n } from "../i18n";

/**
 * Display a lightweight "coming soon" notice for placeholder actions
 * whose backend wiring is not yet implemented.
 */
export function notifyComingSoon(label: string): void {
  Alert.alert(label, i18n.t("common.comingSoonDescription"));
}

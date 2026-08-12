import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useActiveUserId } from "../services/account-namespace";
import { useAppTheme } from "../styles/app-styles";
import { AppContent } from "./AppContent";

export function AppFrame() {
  const { styles } = useAppTheme();
  // Force-remount the entire authenticated subtree when the active user
  // changes, so per-account hooks / contexts / refs (e.g. cached
  // conversation drafts, message list scroll positions, transient form
  // state) cannot leak across an account switch. Pre-login state lives
  // under the synthetic "anon" key.
  const uid = useActiveUserId();

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.safeArea}>
        <BottomSheetModalProvider>
          <AppContent key={uid ?? "anon"} />
        </BottomSheetModalProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

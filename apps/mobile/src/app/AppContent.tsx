import { Pressable, StatusBar, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { i18n } from "../i18n";
import { useActiveUserId } from "../services/account-namespace";
import {
  AttachmentCenterOverlay,
  AvatarPreviewOverlay,
  CallMemberPickerSheet,
  CallOverlay,
  ImagePreviewOverlay,
  VideoPreviewOverlay
} from "../components/overlays";
import { ChatListSkeleton, Toast } from "../components/ui";
import { useMobileAppController } from "./controller/useMobileAppController";
import { MediaPreviewProvider } from "./controller/state/MediaPreviewContext";
import { AuthScreen } from "../screens/auth/AuthScreen";
import { AccountSecurityProvider, MeProvider } from "../features/account";
import { AddContactProvider } from "../features/add-contact";
import { StartConversationProvider } from "../features/start-conversation";
import { WorkspaceSearchProvider } from "../features/workspace-search";
import { PeerProfileProvider } from "../features/peer-profile";
import { GroupManageProvider } from "../features/group-info";
import { useAppTheme } from "../styles/app-styles";
import { MainNavigator } from "../navigation/AppNavigator";

export function AppContent() {
  const controller = useMobileAppController();
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  // Cold-start gating: when a persisted uid exists, the runtime asynchronously
  // binds the per-user session and only then republishes a snapshot whose
  // `auth.accessToken` reflects the stored credentials. Before that bind
  // completes, an early `subscribe()` push may deliver a snapshot with a null
  // accessToken (read via the pre-auth bridge). Without this gate we would
  // briefly route to AuthScreen and then snap back to Home once bind finishes,
  // producing a visible "skeleton → login flash → home" sequence on every
  // launch. Keep the skeleton while a persisted account is still rehydrating.
  const persistedUid = useActiveUserId();

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle={theme.mode === "dark" ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />
      <View pointerEvents="none" style={styles.screenCanvas} />

      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {controller.error ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorText}>{controller.error}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={i18n.t("ui.closeErrorBanner")}
              onPress={controller.dismissError}
              style={styles.errorDismiss}
              hitSlop={8}
            >
              <Text style={styles.errorDismissText}>×</Text>
            </Pressable>
          </View>
        ) : null}

        {!controller.snapshot ? (
          <ChatListSkeleton />
        ) : !controller.isAuthenticated && persistedUid ? (
          <ChatListSkeleton />
        ) : !controller.isAuthenticated ? (
          <AuthScreen {...controller.authScreenProps} />
        ) : (
          <MediaPreviewProvider value={controller.mediaPreviewActions}>
            <AccountSecurityProvider value={controller.accountSecurityProps}>
              <AddContactProvider value={controller.addContactProps}>
                <GroupManageProvider value={controller.groupManageProps}>
                  <PeerProfileProvider value={controller.peerProfileProps}>
                    <StartConversationProvider
                      value={controller.startConversationProps}
                    >
                      <WorkspaceSearchProvider
                        value={controller.workspaceSearchProps}
                      >
                        {controller.meProps ? (
                          <MeProvider value={controller.meProps}>
                            <MainNavigator controller={controller} />
                          </MeProvider>
                        ) : (
                          <MainNavigator controller={controller} />
                        )}
                      </WorkspaceSearchProvider>
                    </StartConversationProvider>
                  </PeerProfileProvider>
                </GroupManageProvider>
              </AddContactProvider>
            </AccountSecurityProvider>
          </MediaPreviewProvider>
        )}
      </View>

      <ImagePreviewOverlay
        key={controller.overlayProps.imagePreview.previewKey}
        images={controller.overlayProps.imagePreview.images}
        currentIndex={controller.overlayProps.imagePreview.currentIndex}
        onClose={controller.overlayProps.imagePreview.onClose}
        onNavigate={controller.overlayProps.imagePreview.onNavigate}
        onUrlRefreshed={controller.overlayProps.imagePreview.onUrlRefreshed}
        onSaveToAlbum={controller.overlayProps.imagePreview.onSaveToAlbum}
      />
      <VideoPreviewOverlay {...controller.overlayProps.videoPreview} />
      <AvatarPreviewOverlay {...controller.overlayProps.avatarPreview} />
      <AttachmentCenterOverlay {...controller.overlayProps.attachmentCenter} />
      <CallOverlay {...controller.overlayProps.call} />
      <CallMemberPickerSheet {...controller.overlayProps.callMemberPicker} />
      <Toast message={controller.status} />
    </View>
  );
}

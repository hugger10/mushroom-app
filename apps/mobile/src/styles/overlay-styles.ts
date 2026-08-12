import { StyleSheet } from "react-native";
import type { AppTheme } from "./theme";

export function overlayStyles(theme: AppTheme) {
  const shadowOpacity = theme.mode === "dark" ? 0.28 : 0.12;

  return {
    overlay: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: "center",
      justifyContent: "center",
      padding: 24
    },
    sheetOverlay: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      justifyContent: "flex-end",
      paddingHorizontal: 0,
      zIndex: 30
    },
    overlayBackdrop: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: theme.colors.overlay
    },
    previewCard: {
      width: "100%",
      maxWidth: 420,
      borderRadius: 28,
      backgroundColor: theme.colors.glassStrong,
      padding: 16,
      gap: 14,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong
    },
    previewTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800"
    },
    previewImage: {
      width: "100%",
      height: 420,
      borderRadius: 22,
      backgroundColor: theme.colors.backgroundAlt
    },
    modalCard: {
      width: "100%",
      maxWidth: 480,
      maxHeight: "88%",
      borderRadius: 26,
      backgroundColor: theme.colors.glassStrong,
      padding: 18,
      gap: 12,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong
    },
    peerProfileModalCard: {
      width: "100%",
      maxWidth: 480,
      maxHeight: "92%",
      borderRadius: 30,
      backgroundColor: theme.colors.glassStrong,
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 22,
      gap: 14,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong
    },
    sheetCard: {
      width: "100%",
      maxHeight: "82%",
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      backgroundColor: theme.colors.glassStrong,
      paddingHorizontal: 18,
      paddingBottom: 22,
      paddingTop: 8,
      gap: 14,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: theme.colors.borderStrong,
      overflow: "hidden",
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.28 : 0.16,
      shadowRadius: 18,
      shadowOffset: {
        width: 0,
        height: -8
      },
      elevation: 14
    },
    sheetHandle: {
      alignItems: "center",
      paddingBottom: 4
    },
    sheetHandleBar: {
      width: 42,
      height: 5,
      borderRadius: 999,
      backgroundColor: theme.colors.borderStrong
    },
    modalCardLarge: {
      width: "100%",
      maxWidth: 520,
      maxHeight: "90%",
      borderRadius: 26,
      backgroundColor: theme.colors.glassStrong,
      padding: 18,
      gap: 12,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong
    },
    addFriendModalCard: {
      width: "100%",
      maxWidth: 520,
      maxHeight: "85%",
      borderRadius: 26,
      backgroundColor: theme.colors.glassStrong,
      paddingHorizontal: 18,
      paddingVertical: 18,
      gap: 12,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong
    },
    callModalCard: {
      width: "100%",
      maxWidth: 560,
      maxHeight: "92%",
      borderRadius: 28,
      backgroundColor: theme.colors.glassStrong,
      padding: 18,
      gap: 12,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12
    },
    modalHeaderMain: {
      flex: 1,
      gap: 4
    },
    modalTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800"
    },
    modalSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 13
    },
    overlayErrorText: {
      color: theme.colors.danger,
      fontSize: 13,
      lineHeight: 18
    },
    friendSearchHero: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: 22,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    friendSearchHeroIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentSoft
    },
    friendSearchHeroIcon: {
      fontSize: 24
    },
    friendSearchHeroCopy: {
      flex: 1,
      gap: 4
    },
    friendSearchHeroTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "800"
    },
    friendSearchHeroDescription: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 17
    },
    friendSearchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    friendSearchInput: {
      flex: 1,
      borderWidth: 0,
      backgroundColor: "transparent",
      paddingVertical: 8,
      paddingHorizontal: 6
    },
    friendSearchButton: {
      width: 36,
      height: 36,
      minWidth: 0,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center"
    },
    friendSearchResultRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceMuted
    },
    friendSearchResultMain: {
      flex: 1,
      minWidth: 0,
      gap: 0
    },
    friendSearchResultAction: {
      flexShrink: 0,
      minWidth: 0,
      paddingHorizontal: 12
    },
    friendSearchResultAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center"
    },
    friendSearchResultAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 12,
      fontWeight: "800"
    },
    friendSearchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    friendSearchAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center"
    },
    friendSearchAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 12,
      fontWeight: "800"
    },
    friendSearchMain: {
      flex: 1,
      gap: 0
    },
    friendListItemTitle: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 17
    },
    friendListItemSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 14
    },
    friendListItemRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 6,
      flexWrap: "nowrap",
      minWidth: 0
    },
    friendListItemRowSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 17,
      flexShrink: 1,
      minWidth: 0
    },
    friendSearchResultMiniButton: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center"
    },
    friendSearchResultMiniButtonPrimary: {
      borderColor: "rgba(255,255,255,0.12)",
      backgroundColor: theme.colors.accent
    },
    friendSearchResultMiniButtonDisabled: {
      opacity: 0.5
    },
    friendSearchResultMiniButtonLabel: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "700"
    },
    friendSearchResultMiniButtonLabelPrimary: {
      color: theme.colors.textInverse
    },
    groupRemoteSectionLabel: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: "600",
      marginTop: 8,
      marginBottom: 6,
      paddingHorizontal: 4
    },
    groupFriendCard: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 14,
      paddingVertical: 6,
      paddingHorizontal: 10,
      gap: 4,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    groupCreateHero: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: 22,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    groupCreateHeroIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentSoft
    },
    groupCreateHeroIcon: {
      fontSize: 24
    },
    groupCreateHeroCopy: {
      flex: 1,
      gap: 4
    },
    groupCreateHeroTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "800"
    },
    groupCreateHeroDescription: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 17
    },
    groupCreateHeroStat: {
      minWidth: 54,
      alignItems: "center",
      justifyContent: "center",
      gap: 2
    },
    groupCreateHeroStatLabel: {
      color: theme.colors.textSoft,
      fontSize: 11,
      fontWeight: "700"
    },
    groupCreateHeroStatValue: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "800"
    },
    groupCreateContent: {
      flex: 1,
      minHeight: 0,
      gap: 12
    },
    groupSelectedSummary: {
      gap: 8
    },
    groupSelectedSummaryTitle: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700"
    },
    groupSelectedSummaryList: {
      gap: 8
    },
    groupSelectedSummaryChip: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: "transparent"
    },
    groupSelectedSummaryChipText: {
      color: theme.colors.accentStrong,
      fontSize: 12,
      fontWeight: "700"
    },
    groupCreateButton: {
      alignSelf: "flex-end",
      minWidth: 116,
      borderRadius: 18,
      flex: 0
    },
    groupFriendList: {
      flex: 1,
      minHeight: 120
    },
    peerProfilePageLayer: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 40
    },
    peerProfilePageShell: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 2,
      elevation: 12
    },
    peerProfilePage: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    peerProfileMenuDismissLayer: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 1
    },
    peerProfilePageHeader: {
      position: "relative",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingBottom: 10,
      minHeight: 56,
      zIndex: 3
    },
    peerProfilePageHeaderButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    peerProfilePageHeaderButtonPlaceholder: {
      width: 40,
      height: 40
    },
    peerProfilePageHeaderTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "800"
    },
    peerProfilePageHeaderActions: {
      width: 40,
      alignItems: "flex-end"
    },
    peerProfilePageScroll: {
      flex: 1
    },
    peerProfilePageScrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 18,
      gap: 14
    },
    peerProfileHeroCard: {
      borderRadius: 28,
      paddingHorizontal: 18,
      paddingVertical: 18,
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 16,
      shadowColor: theme.colors.shadow,
      shadowOpacity,
      shadowRadius: 18,
      shadowOffset: {
        width: 0,
        height: 10
      },
      elevation: 6
    },
    peerProfileHeroMain: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14
    },
    peerProfileHeroAvatar: {
      width: 78,
      height: 78,
      borderRadius: 39,
      alignItems: "center",
      justifyContent: "center"
    },
    peerProfileHeroAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 30,
      fontWeight: "800"
    },
    peerProfileHeroBody: {
      flex: 1,
      gap: 6
    },
    peerProfileHeroNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    peerProfileHeroName: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: "800",
      letterSpacing: -0.8
    },
    peerProfileHeroBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      minHeight: 28,
      borderRadius: 14,
      paddingHorizontal: 10,
      backgroundColor: theme.colors.accentSoft
    },
    peerProfileHeroBadgeText: {
      color: theme.colors.accentStrong,
      fontSize: 12,
      fontWeight: "800"
    },
    peerProfileHeroAccount: {
      color: theme.colors.textMuted,
      fontSize: 14,
      fontWeight: "600"
    },
    peerProfileMenu: {
      position: "absolute",
      top: 48,
      right: 12,
      minWidth: 132,
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      overflow: "hidden",
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.34 : 0.16,
      shadowRadius: 16,
      shadowOffset: {
        width: 0,
        height: 10
      },
      elevation: 8
    },
    peerProfileMenuItem: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.colors.dangerSoft
    },
    peerProfileMenuItemNeutral: {
      backgroundColor: theme.colors.surfaceMuted
    },
    peerProfileMenuItemText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "700"
    },
    peerProfileMenuItemDanger: {
      color: theme.colors.danger,
      fontSize: 12,
      fontWeight: "700"
    },
    peerProfileSectionCard: {
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 14
    },
    peerProfileSectionTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "800"
    },
    peerProfileSectionBody: {
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 21
    },
    peerProfileSectionBodyMuted: {
      color: theme.colors.textMuted
    },
    peerProfileDetailRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12
    },
    peerProfileDetailIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentSoft
    },
    peerProfileDetailBody: {
      flex: 1,
      gap: 2
    },
    peerProfileDetailLabel: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: "700"
    },
    peerProfileDetailValue: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "600"
    },
    peerProfileDetailValueMuted: {
      color: theme.colors.textMuted,
      fontWeight: "500"
    },
    peerProfileFooter: {
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 10
    },
    peerProfilePrimaryAction: {
      minHeight: 58,
      borderRadius: 22,
      paddingHorizontal: 18,
      backgroundColor: theme.colors.accent,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      shadowColor: theme.colors.shadow,
      shadowOpacity,
      shadowRadius: 14,
      shadowOffset: {
        width: 0,
        height: 8
      },
      elevation: 5
    },
    peerProfilePrimaryActionPressed: {
      transform: [{ scale: 0.985 }]
    },
    peerProfilePrimaryActionIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.16)"
    },
    peerProfilePrimaryActionText: {
      color: theme.colors.textInverse,
      fontSize: 17,
      fontWeight: "800"
    },
    peerProfileSecondaryActionRow: {
      flexDirection: "row",
      gap: 10
    },
    peerProfileSecondaryAction: {
      flex: 1,
      minHeight: 54,
      borderRadius: 20,
      paddingHorizontal: 14,
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8
    },
    peerProfileSecondaryActionPressed: {
      transform: [{ scale: 0.985 }]
    },
    peerProfileSecondaryActionIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentSoft
    },
    peerProfileSecondaryActionText: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700"
    },
    peerProfileRemarkEditor: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 8,
      justifyContent: "flex-end"
    },
    peerProfileRemarkBackdrop: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: "rgba(0,0,0,0.22)"
    },
    peerProfileRemarkCard: {
      margin: 14,
      padding: 14,
      borderRadius: 22,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 10,
      shadowColor: "#000000",
      shadowOpacity: 0.18,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8
    },
    peerProfileRemarkCancelButton: {
      flex: 1,
      minHeight: 38,
      borderRadius: 12,
      paddingHorizontal: 14,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center"
    },
    peerProfileRemarkCancelText: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "600"
    },
    peerProfileRemarkSaveButton: {
      flex: 1,
      minHeight: 38,
      borderRadius: 12,
      paddingHorizontal: 14,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center"
    },
    peerProfileRemarkSaveText: {
      color: theme.colors.textInverse,
      fontSize: 14,
      fontWeight: "700"
    },
    callScreenOverlay: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 50,
      backgroundColor: "#000000"
    },
    callScreen: {
      flex: 1,
      backgroundColor: "#000000"
    },
    callVideoStage: {
      flex: 1,
      position: "relative",
      overflow: "hidden",
      backgroundColor: "#000000"
    },
    callRemoteVideo: {
      width: "100%",
      height: "100%",
      backgroundColor: "#000000"
    },
    callTopOverlay: {
      position: "absolute",
      top: 54,
      right: 24,
      left: 24,
      zIndex: 3,
      alignItems: "center",
      gap: 4
    },
    callPeerName: {
      color: "#ffffff",
      fontSize: 18,
      fontWeight: "800",
      textAlign: "center",
      textShadowColor: "rgba(0,0,0,0.55)",
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 12
    },
    callTimerText: {
      color: "rgba(255,255,255,0.78)",
      fontSize: 14,
      fontWeight: "700",
      textAlign: "center",
      textShadowColor: "rgba(0,0,0,0.55)",
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 12
    },
    callLocalPreview: {
      position: "absolute",
      right: 18,
      bottom: 126,
      zIndex: 3,
      width: 118,
      height: 164,
      borderRadius: 18,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.24)",
      backgroundColor: "#141414",
      shadowColor: "#000000",
      shadowOpacity: 0.36,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10
    },
    callLocalVideo: {
      width: "100%",
      height: "100%",
      backgroundColor: "#141414"
    },
    callVideoPlaceholder: {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#000000",
      paddingHorizontal: 24,
      gap: 8
    },
    callPreviewPlaceholder: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#141414",
      paddingHorizontal: 12,
      gap: 6
    },
    callVideoPlaceholderTitle: {
      color: "#ffffff",
      fontSize: 30,
      fontWeight: "800"
    },
    callPreviewPlaceholderTitle: {
      color: "#ffffff",
      fontSize: 18,
      fontWeight: "800"
    },
    callVideoPlaceholderCaption: {
      color: "rgba(255,255,255,0.72)",
      fontSize: 12,
      textAlign: "center"
    },
    callAudioHero: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
      paddingBottom: 92,
      backgroundColor: "#000000",
      gap: 12
    },
    callHiddenAudioStream: {
      position: "absolute",
      width: 1,
      height: 1,
      opacity: 0,
      top: 0,
      left: 0
    },
    callAudioAvatar: {
      width: 124,
      height: 124,
      borderRadius: 62,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.16)",
      marginBottom: 12
    },
    callAudioAvatarText: {
      color: "#ffffff",
      fontSize: 48,
      fontWeight: "900"
    },
    callAudioHeroTitle: {
      color: "#ffffff",
      fontSize: 24,
      fontWeight: "800",
      textAlign: "center"
    },
    callAudioHeroCaption: {
      color: "rgba(255,255,255,0.78)",
      fontSize: 20,
      fontWeight: "700"
    },
    callFloatingControls: {
      position: "absolute",
      right: 0,
      bottom: 42,
      left: 0,
      zIndex: 4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 18,
      paddingHorizontal: 24
    },
    callCircleButton: {
      width: 76,
      alignItems: "center",
      justifyContent: "center",
      gap: 8
    },
    callCircleButtonIconWrap: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.18)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.16)"
    },
    callCircleButtonActive: {
      backgroundColor: "rgba(255,255,255,0.26)"
    },
    callCircleButtonDanger: {
      backgroundColor: "#ef4444",
      borderColor: "#ef4444"
    },
    callCircleButtonAccept: {
      backgroundColor: "#22c55e",
      borderColor: "#22c55e"
    },
    callCircleButtonPressed: {
      transform: [{ scale: 0.96 }]
    },
    callCircleButtonIcon: {
      fontSize: 25
    },
    callCircleButtonLabel: {
      color: "rgba(255,255,255,0.86)",
      fontSize: 12,
      fontWeight: "700",
      textAlign: "center"
    },
    callStatusLine: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7
    },
    callWaitingDots: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4
    },
    callWaitingDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: "rgba(255,255,255,0.86)"
    },
    callAudioStatusLine: {
      marginTop: 2
    },
    callGroupStage: {
      flex: 1,
      backgroundColor: "#000000",
      paddingTop: 54,
      paddingHorizontal: 16,
      paddingBottom: 132
    },
    callGroupHeader: {
      alignItems: "center",
      gap: 5,
      marginBottom: 18
    },
    callGroupRoomText: {
      color: "rgba(255,255,255,0.58)",
      fontSize: 12,
      fontWeight: "600",
      textAlign: "center"
    },
    callGroupScroll: {
      flex: 1
    },
    callGroupScrollContent: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      justifyContent: "center",
      paddingBottom: 12
    },
    callGroupTile: {
      minHeight: 120,
      borderRadius: 20,
      overflow: "hidden",
      padding: 6,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.12)"
    },
    callGroupLocalVideoTile: {
      minHeight: 120,
      borderRadius: 20,
      overflow: "hidden",
      backgroundColor: "#111111",
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.12)"
    },
    // "+N 位成员" collapse tile shown when the grid exceeds the visible cap.
    // Darker background + dashed border signals "more entries available".
    callGroupMoreTile: {
      backgroundColor: "rgba(255,255,255,0.04)",
      borderColor: "rgba(255,255,255,0.22)",
      borderStyle: "dashed"
    },
    /* ─── Group-call member picker ─── */
    callMemberPickerContainer: {
      paddingTop: 0
    },
    callMemberPickerHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingBottom: 10,
      gap: 8
    },
    callMemberPickerBackButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center"
    },
    callMemberPickerHeaderTitle: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center"
    },
    callMemberPickerStartButton: {
      height: 32,
      paddingHorizontal: 16,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentStrong
    },
    callMemberPickerStartButtonDisabled: {
      opacity: 0.4
    },
    callMemberPickerStartLabel: {
      color: "#ffffff",
      fontSize: 14,
      fontWeight: "800"
    },
    callMemberPickerList: {
      paddingBottom: 8
    },
    callMemberPickerRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 4,
      paddingVertical: 6,
      gap: 10
    },
    callMemberPickerRowSelf: {
      opacity: 0.55
    },
    callMemberPickerAvatar: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center"
    },
    callMemberPickerAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 14,
      fontWeight: "800"
    },
    callMemberPickerRowBody: {
      flex: 1,
      gap: 1
    },
    callMemberPickerRowName: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "600"
    },
    callMemberPickerRowHint: {
      color: theme.colors.textMuted,
      fontSize: 11
    },
    callMemberPickerCheck: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center"
    },
    callMemberPickerCheckOn: {
      backgroundColor: theme.colors.accentStrong,
      borderColor: theme.colors.accentStrong
    },
    // Active-speaker highlight ring applied on top of a tile's own border
    // (mirrors WhatsApp/WeChat speaking indication). Width matches the base
    // 2px border so the layout does not shift when speaking toggles.
    callGroupTileSpeaking: {
      borderColor: "#34d058",
      borderWidth: 2
    },
    callGroupLocalVideo: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    },
    callGroupLocalVideoLabel: {
      position: "absolute",
      left: 10,
      bottom: 10,
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "800",
      textShadowColor: "rgba(0,0,0,0.6)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 8
    },
    callGroupAvatar: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.14)"
    },
    callGroupAvatarText: {
      color: "#ffffff",
      fontSize: 14,
      fontWeight: "900"
    },
    callGroupTileTitle: {
      color: "#ffffff",
      fontSize: 12,
      fontWeight: "800",
      textAlign: "center"
    },
    callGroupTileSub: {
      color: "rgba(255,255,255,0.62)",
      fontSize: 9,
      fontWeight: "700"
    },
    callGroupMediaStateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6
    },
    attachmentPreviewRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12
    },
    attachmentThumb: {
      width: 64,
      height: 64,
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceMuted
    },
    startConversationSheet: {
      width: "100%",
      minHeight: "84%",
      maxHeight: "92%",
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      backgroundColor: theme.colors.glassStrong,
      paddingHorizontal: 18,
      paddingBottom: 22,
      paddingTop: 8,
      gap: 14,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: theme.colors.borderStrong,
      overflow: "hidden",
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.28 : 0.16,
      shadowRadius: 18,
      shadowOffset: {
        width: 0,
        height: -8
      },
      elevation: 14
    },
    startConversationSheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12
    },
    startConversationSheetCancel: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted
    },
    startConversationSheetTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
      flex: 1,
      textAlign: "center"
    },
    startConversationSheetSpacer: {
      width: 36
    },
    startConversationSheetHeaderAction: {
      minWidth: 56,
      height: 36,
      paddingHorizontal: 12,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent
    },
    startConversationSheetHeaderActionDisabled: {
      backgroundColor: theme.colors.surfaceMuted
    },
    startConversationSheetHeaderActionText: {
      color: theme.colors.textInverse,
      fontSize: 14,
      fontWeight: "700"
    },
    startConversationSheetHeaderActionTextDisabled: {
      color: theme.colors.textSoft
    },
    qrScannerSheet: {
      width: "100%",
      maxHeight: "60%",
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      backgroundColor: theme.colors.glassStrong,
      paddingHorizontal: 18,
      paddingBottom: 22,
      paddingTop: 8,
      gap: 14,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: theme.colors.borderStrong,
      overflow: "hidden",
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.28 : 0.16,
      shadowRadius: 18,
      shadowOffset: {
        width: 0,
        height: -8
      },
      elevation: 14
    },
    qrScannerHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12
    },
    qrScannerContent: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 40,
      gap: 20
    },
    qrScannerIconWrap: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentSoft
    },
    qrScannerHint: {
      color: theme.colors.textMuted,
      fontSize: 14
    },
    qrScannerButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: theme.colors.accent,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 24
    },
    qrScannerButtonText: {
      color: theme.colors.textInverse,
      fontSize: 16,
      fontWeight: "700"
    },
    rightDrawerOverlay: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      justifyContent: "flex-end",
      padding: 0
    },
    rightDrawerCard: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      width: "85%",
      maxWidth: 380,
      backgroundColor: theme.colors.glassStrong,
      paddingHorizontal: 20,
      gap: 16,
      borderLeftWidth: 1,
      borderColor: theme.colors.borderStrong,
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.32 : 0.2,
      shadowRadius: 20,
      shadowOffset: {
        width: -6,
        height: 0
      },
      elevation: 12
    },
    rightDrawerHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    rightDrawerTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: "800"
    },
    rightDrawerClose: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted
    },

    /* ─── Group Info Page ─── */
    groupInfoPage: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    groupInfoHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 8,
      paddingVertical: 6,
      minHeight: 52,
      zIndex: 3,
      backgroundColor: theme.colors.background
    },
    chatInfoHeaderTransparent: {
      backgroundColor: "transparent"
    },
    groupInfoHeaderButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center"
    },
    chatInfoHeaderIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center"
    },
    groupInfoHeaderTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "800"
    },
    groupInfoHeaderPlaceholder: {
      width: 40,
      height: 40
    },
    groupInfoScroll: {
      flex: 1
    },
    groupInfoScrollContent: {
      paddingBottom: 40
    },
    /* WhatsApp-style hero (centered avatar + name + subtitle) */
    chatInfoHeroCenter: {
      alignItems: "center",
      paddingTop: 8,
      paddingBottom: 20,
      paddingHorizontal: 24,
      backgroundColor: theme.colors.background
    },
    chatInfoHeroAvatarWrap: {
      position: "relative",
      width: 112,
      height: 112,
      marginBottom: 14
    },
    chatInfoHeroAvatarLarge: {
      width: 112,
      height: 112,
      borderRadius: 56,
      alignItems: "center",
      justifyContent: "center"
    },
    chatInfoHeroAvatarLargeText: {
      color: theme.colors.textInverse,
      fontSize: 40,
      fontWeight: "800"
    },
    chatInfoHeroAvatarBadge: {
      position: "absolute",
      right: -2,
      bottom: -2,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 3,
      borderColor: theme.colors.background
    },
    chatInfoHeroNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      maxWidth: "100%"
    },
    chatInfoHeroNameCenter: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "700",
      textAlign: "center",
      letterSpacing: -0.4
    },
    chatInfoHeroSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      minHeight: 20,
      marginTop: 6,
      textAlign: "center"
    },
    /* Quick action circles row */
    chatInfoQuickActionsRow: {
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "flex-start",
      paddingVertical: 18,
      paddingHorizontal: 16,
      backgroundColor: theme.colors.background
    },
    chatInfoQuickActionItem: {
      alignItems: "center",
      gap: 6,
      minWidth: 64
    },
    chatInfoQuickActionCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentSoft
    },
    chatInfoQuickActionCircleDisabled: {
      backgroundColor: theme.colors.surfaceMuted
    },
    chatInfoQuickActionLabel: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: "600"
    },
    chatInfoQuickActionLabelDisabled: {
      color: theme.colors.textMuted
    },
    /* Section blocks (WhatsApp style: full-width, on surfaceStrong) */
    chatInfoSection: {
      marginTop: 10,
      backgroundColor: theme.colors.background
    },
    chatInfoSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 6
    },
    chatInfoSectionTitle: {
      color: theme.colors.accent,
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.2
    },
    chatInfoSectionMeta: {
      color: theme.colors.textMuted,
      fontSize: 13
    },
    /* About text */
    chatInfoAboutBlock: {
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 16
    },
    chatInfoAboutText: {
      color: theme.colors.text,
      fontSize: 15,
      lineHeight: 21
    },
    chatInfoAboutPlaceholder: {
      color: theme.colors.textMuted,
      fontSize: 15,
      fontStyle: "italic"
    },
    chatInfoAboutMeta: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginTop: 6
    },
    /* List rows (WhatsApp style: icon + label, optional meta/switch/chevron) */
    chatInfoListRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 16,
      minHeight: 56
    },
    chatInfoListRowDivider: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginLeft: 56
    },
    chatInfoListRowIcon: {
      width: 24,
      alignItems: "center",
      justifyContent: "center"
    },
    chatInfoListRowBody: {
      flex: 1,
      gap: 2
    },
    chatInfoListRowTitle: {
      color: theme.colors.text,
      fontSize: 16
    },
    chatInfoListRowSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 13
    },
    chatInfoListRowMeta: {
      color: theme.colors.textMuted,
      fontSize: 14,
      flexShrink: 1
    },
    chatInfoListRowDangerText: {
      color: theme.colors.danger,
      fontSize: 16
    },
    chatInfoListRowAccentText: {
      color: theme.colors.accent,
      fontSize: 16
    },
    /* Compact member rows in main panel */
    chatInfoCompactRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 14,
      minHeight: 60
    },
    chatInfoCompactRowSwipeShell: {
      backgroundColor: theme.colors.background,
      overflow: "hidden"
    },
    chatInfoCompactRowSurface: {
      backgroundColor: theme.colors.background
    },
    chatInfoMemberSwipeRemoveButton: {
      width: 96,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.danger
    },
    chatInfoMemberSwipeRemoveText: {
      color: theme.colors.textInverse,
      fontSize: 13,
      fontWeight: "700"
    },
    chatInfoCompactAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center"
    },
    chatInfoCompactAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 16,
      fontWeight: "800"
    },
    chatInfoCompactName: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 16
    },
    chatInfoCompactMeta: {
      color: theme.colors.textMuted,
      fontSize: 13
    },
    /* Hero card */
    groupInfoHeroCard: {
      borderRadius: 28,
      paddingHorizontal: 18,
      paddingVertical: 18,
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 14,
      shadowColor: theme.colors.shadow,
      shadowOpacity: shadowOpacity,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6
    },
    groupInfoHeroMain: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14
    },
    groupInfoHeroAvatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: "center",
      justifyContent: "center"
    },
    groupInfoHeroAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 28,
      fontWeight: "800"
    },
    groupInfoHeroBody: {
      flex: 1,
      gap: 4
    },
    groupInfoHeroName: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.5
    },
    groupInfoHeroDesc: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18
    },
    groupInfoHeroChevron: {
      paddingLeft: 4
    },
    /* Member grid */
    groupInfoMemberCard: {
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 14
    },
    groupInfoMemberGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12
    },
    groupInfoMemberItem: {
      width: 56,
      alignItems: "center",
      gap: 5
    },
    groupInfoMemberAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center"
    },
    groupInfoMemberAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 18,
      fontWeight: "800"
    },
    groupInfoMemberName: {
      color: theme.colors.text,
      fontSize: 11,
      fontWeight: "600",
      textAlign: "center"
    },
    groupInfoMemberAddBtn: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: theme.colors.borderStrong
    },
    groupInfoMemberSeeAll: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      gap: 6,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border
    },
    groupInfoMemberSeeAllText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: "700"
    },
    /* Settings cells */
    groupInfoSettingsCard: {
      borderRadius: 24,
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: "hidden"
    },
    groupInfoCell: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
      minHeight: 52
    },
    groupInfoCellBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border
    },
    groupInfoCellIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentSoft
    },
    groupInfoCellBody: {
      flex: 1,
      gap: 2
    },
    groupInfoCellLabel: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "600"
    },
    groupInfoCellCaption: {
      color: theme.colors.textMuted,
      fontSize: 12
    },
    groupInfoCellValue: {
      color: theme.colors.textMuted,
      fontSize: 14
    },
    /* Toggle (iOS-style switch placeholder using Pressable) */
    groupInfoToggle: {
      width: 48,
      height: 28,
      borderRadius: 14,
      justifyContent: "center",
      paddingHorizontal: 2
    },
    groupInfoToggleOn: {
      backgroundColor: theme.colors.accent
    },
    groupInfoToggleOff: {
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong
    },
    groupInfoToggleThumb: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: "#FFFFFF",
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2
    },
    groupInfoToggleThumbOn: {
      alignSelf: "flex-end"
    },
    groupInfoToggleThumbOff: {
      alignSelf: "flex-start"
    },
    /* Danger zone */
    groupInfoDangerCard: {
      borderRadius: 24,
      overflow: "hidden"
    },
    groupInfoDangerButton: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 16,
      backgroundColor: theme.colors.dangerSoft,
      borderRadius: 24
    },
    groupInfoDangerButtonText: {
      color: theme.colors.danger,
      fontSize: 16,
      fontWeight: "700"
    },

    /* ─── Sub-panel: Member list ─── */
    groupInfoSubHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingBottom: 10,
      minHeight: 56,
      gap: 12
    },
    groupInfoSubTitle: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "800"
    },
    groupInfoSearchBar: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: theme.colors.inputBg,
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      gap: 8
    },
    groupInfoSearchInput: {
      flex: 1,
      fontSize: 14,
      color: theme.colors.text,
      padding: 0
    },
    groupInfoMemberRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 12
    },
    groupInfoMemberRowAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center"
    },
    groupInfoMemberRowAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 16,
      fontWeight: "800"
    },
    groupInfoMemberRowBody: {
      flex: 1,
      gap: 2
    },
    groupInfoMemberRowName: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "600"
    },
    groupInfoMemberRowRole: {
      color: theme.colors.textMuted,
      fontSize: 12
    },
    groupInfoMemberRowBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: theme.colors.accentSoft
    },
    groupInfoMemberRowBadgeText: {
      color: theme.colors.accentStrong,
      fontSize: 11,
      fontWeight: "700"
    },

    /* ─── Member action sheet ─── */
    groupInfoActionSheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      paddingHorizontal: 16,
      paddingBottom: 34,
      gap: 8
    },
    groupInfoActionGroup: {
      borderRadius: 18,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: "hidden"
    },
    groupInfoActionItem: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border
    },
    groupInfoActionItemLast: {
      borderBottomWidth: 0
    },
    groupInfoActionItemText: {
      color: theme.colors.accent,
      fontSize: 17,
      fontWeight: "600"
    },
    groupInfoActionItemDanger: {
      color: theme.colors.danger
    },
    groupInfoActionCancel: {
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 16,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    groupInfoActionCancelText: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "700"
    },

    /* ─── Sub-panel: Edit profile / announcement / settings ─── */
    groupInfoEditCard: {
      marginHorizontal: 16,
      borderRadius: 24,
      paddingHorizontal: 0,
      paddingVertical: 0,
      backgroundColor: "transparent",
      gap: 14
    },
    groupInfoEditLabel: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "700"
    },
    groupInfoEditInput: {
      fontSize: 15,
      color: theme.colors.text,
      borderRadius: 14,
      backgroundColor: theme.colors.background,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    groupInfoEditTextArea: {
      minHeight: 100,
      textAlignVertical: "top"
    },
    groupInfoEditAnnouncementArea: {
      minHeight: 160,
      textAlignVertical: "top"
    },
    groupInfoSaveButton: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
      borderRadius: 18,
      backgroundColor: theme.colors.accent
    },
    groupInfoSaveButtonDisabled: {
      opacity: 0.5
    },
    groupInfoSaveButtonText: {
      color: theme.colors.textInverse,
      fontSize: 16,
      fontWeight: "700"
    },
    /* Settings panel permission rows */
    groupInfoPermRow: {
      gap: 8
    },
    groupInfoPermLabel: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "700"
    },
    groupInfoPermOptions: {
      flexDirection: "row",
      gap: 8
    },
    groupInfoPermOption: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    groupInfoPermOptionActive: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent
    },
    groupInfoPermOptionText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: "600"
    },
    groupInfoPermOptionTextActive: {
      color: theme.colors.accent,
      fontWeight: "700"
    },
    /* Invite panel */
    groupInfoInviteGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginHorizontal: 16
    },
    groupInfoInviteChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    groupInfoInviteChipSelected: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent
    },
    groupInfoInviteChipText: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "600"
    },
    /* Redesigned invite screen (WhatsApp-style: tinted page + white cards) */
    groupInfoInviteSelectedStrip: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
      gap: 8
    },
    groupInfoInviteSelectedScroll: {
      flexGrow: 0,
      flexShrink: 1
    },
    groupInfoInviteSelectedContent: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 4,
      paddingRight: 8
    },
    groupInfoInviteSelectedItem: {
      width: 40,
      height: 40,
      position: "relative"
    },
    groupInfoInviteSelectedAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center"
    },
    groupInfoInviteSelectedAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 14,
      fontWeight: "700"
    },
    groupInfoInviteSelectedRemoveBadge: {
      position: "absolute",
      top: -2,
      right: -2,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    groupInfoInviteSelectedClear: {
      color: theme.colors.accent,
      fontSize: 13,
      fontWeight: "600",
      paddingHorizontal: 8,
      paddingVertical: 4
    },
    groupInfoInviteSearchWrap: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12
    },
    groupInfoInviteSearchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      height: 42,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    groupInfoInviteSearchInput: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 15,
      paddingVertical: 0,
      paddingHorizontal: 0,
      backgroundColor: "transparent",
      borderWidth: 0
    },
    groupInfoInviteSectionTitle: {
      marginHorizontal: 16,
      marginTop: 4,
      marginBottom: 8,
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: "600",
      letterSpacing: 0.3,
      textTransform: "uppercase"
    },
    groupInfoInviteListCard: {
      marginHorizontal: 16,
      marginBottom: 16,
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: "hidden"
    },
    groupInfoInviteListRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 60,
      gap: 12,
      backgroundColor: "transparent"
    },
    groupInfoInviteListRowDisabled: {
      opacity: 0.5
    },
    groupInfoInviteListAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center"
    },
    groupInfoInviteListAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 16,
      fontWeight: "700"
    },
    groupInfoInviteListMain: {
      flex: 1,
      gap: 2
    },
    groupInfoInviteListTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "600"
    },
    groupInfoInviteListSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 13
    },
    groupInfoInviteListBadge: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
      paddingHorizontal: 4
    },
    groupInfoInviteListDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
      marginLeft: 14 + 44 + 12
    },
    groupInfoInviteStateBlock: {
      paddingVertical: 32,
      alignItems: "center",
      gap: 8
    },
    groupInfoInviteStateText: {
      color: theme.colors.textMuted,
      fontSize: 14
    },
    groupInfoInviteEmpty: {
      marginHorizontal: 16,
      marginBottom: 16,
      paddingVertical: 64,
      paddingHorizontal: 24,
      alignItems: "center",
      gap: 10,
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    groupInfoInviteEmptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4
    },
    groupInfoInviteEmptyTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "600"
    },
    groupInfoInviteEmptyHint: {
      color: theme.colors.textMuted,
      fontSize: 13,
      textAlign: "center"
    },
    groupInfoInviteButton: {
      marginHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
      borderRadius: 18,
      backgroundColor: theme.colors.accent
    },
    groupInfoInviteButtonText: {
      color: theme.colors.textInverse,
      fontSize: 16,
      fontWeight: "700"
    },
    startConversationSheetBack: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted
    },
    startConversationSheetSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginTop: -6
    },
    groupSelectCheckbox: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center"
    },
    groupSelectCheckboxActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent
    },
    groupSelectedSummaryChipRemovable: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: "transparent"
    },
    groupSelectedSummaryChipClose: {
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent
    },
    groupNextFab: {
      position: "absolute",
      right: 18,
      bottom: 18,
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent,
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.4 : 0.25,
      shadowRadius: 12,
      shadowOffset: {
        width: 0,
        height: 4
      },
      elevation: 8
    },
    groupNextFabDisabled: {
      opacity: 0.4
    },
    groupStepSelectedHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    groupStepSelectedHeaderText: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700"
    },
    groupContactListContainer: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceMuted,
      overflow: "hidden"
    },
    groupContactRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 3,
      backgroundColor: "transparent"
    },
    groupContactRowSelected: {
      backgroundColor: theme.colors.accentSoft
    },
    groupContactRowDivider: {
      marginLeft: 44,
      height: 1,
      backgroundColor: theme.colors.border
    },
    groupSelectContent: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 4,
      gap: 12
    },
    groupSelectedStrip: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 48
    },
    groupSelectedStripScroll: {
      flexGrow: 0
    },
    groupSelectedStripContent: {
      alignItems: "center",
      paddingVertical: 4
    },
    groupSelectedAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      marginRight: 8,
      alignItems: "center",
      justifyContent: "center"
    },
    groupSelectedAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 13,
      fontWeight: "700"
    },
    groupSelectedOverflow: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
      marginRight: 8,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    groupSelectedOverflowText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "700"
    },
    groupSelectedEmptyHint: {
      color: theme.colors.textSoft,
      fontSize: 13
    },
    groupSearchBarClean: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      height: 42,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    groupSearchInputClean: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 15,
      paddingVertical: 0,
      paddingHorizontal: 0,
      backgroundColor: "transparent",
      borderWidth: 0
    },
    groupContactListPlain: {
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: "hidden"
    },
    groupContactRowTall: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 56,
      backgroundColor: "transparent"
    },
    groupSearchClearButton: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted
    },
    groupConfigureNameInput: {
      height: 46,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      fontSize: 15,
      color: theme.colors.text
    },
    groupConfigureSectionLabel: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: "600",
      paddingHorizontal: 4,
      letterSpacing: 0.6
    },
    groupContactRowRemove: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center"
    },
    groupContactAvatarLg: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center"
    },
    groupContactAvatarLgText: {
      color: theme.colors.textInverse,
      fontSize: 14,
      fontWeight: "700"
    },
    groupContactRowDividerV2: {
      marginLeft: 66,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border
    },
    groupRemoteSectionLabelV2: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: "600",
      paddingHorizontal: 4,
      marginTop: 4,
      marginBottom: 6,
      letterSpacing: 0.6
    },
    groupContactBody: {
      flex: 1,
      minWidth: 0
    },
    groupContactTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "600"
    },
    groupContactSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginTop: 2
    },
    addContactSheetList: {
      marginHorizontal: 16,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: "hidden"
    },
    addContactSheetItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      minHeight: 64,
      backgroundColor: "transparent"
    },
    addContactSheetItemPressed: {
      backgroundColor: theme.colors.surfaceMuted
    },
    addContactSheetItemDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
      marginLeft: 70
    },
    addContactSheetIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentSoft
    },
    addContactSheetItemBody: {
      flex: 1,
      gap: 2
    },
    addContactSheetItemTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700"
    },
    addContactSheetItemSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 16
    },
    chatMediaSectionHeader: {
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 8,
      backgroundColor: theme.colors.background
    },
    chatMediaSectionHeaderText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
      letterSpacing: 0.5
    },
    chatMediaGridRow: {
      flexDirection: "row",
      paddingHorizontal: 12,
      gap: 4,
      marginBottom: 4
    },
    chatMediaCell: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: 10,
      overflow: "hidden",
      backgroundColor: theme.colors.surfaceMuted,
      position: "relative"
    },
    chatMediaCellPlaceholder: {
      flex: 1,
      aspectRatio: 1
    },
    chatMediaCellImage: {
      width: "100%",
      height: "100%"
    },
    chatMediaVideoOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.08)"
    },
    chatMediaVideoBadge: {
      position: "absolute",
      right: 6,
      bottom: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: "rgba(0,0,0,0.65)"
    },
    chatMediaVideoBadgeText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "600"
    },
    chatMediaFileItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: theme.colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border
    },
    chatMediaFileIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentSoft
    },
    chatMediaFileBody: {
      flex: 1,
      gap: 2
    },
    chatMediaFileTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "600"
    },
    chatMediaFileMeta: {
      color: theme.colors.textMuted,
      fontSize: 12
    },
    chatMediaLoadingWrap: {
      paddingVertical: 32,
      alignItems: "center",
      justifyContent: "center"
    },
    chatMediaEmptyWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingVertical: 48
    },
    chatMediaEmptyText: {
      color: theme.colors.textMuted,
      fontSize: 13
    },
    chatMediaErrorBanner: {
      marginHorizontal: 16,
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: theme.colors.dangerSoft
    },
    chatMediaErrorText: {
      color: theme.colors.danger,
      fontSize: 12
    },
    chatMediaTabBar: {
      flexDirection: "row",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.background
    },
    chatMediaTabItem: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      position: "relative"
    },
    chatMediaTabLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.colors.textMuted
    },
    chatMediaTabLabelActive: {
      color: theme.colors.accent
    },
    chatMediaTabIndicator: {
      position: "absolute",
      left: "25%",
      right: "25%",
      bottom: 0,
      height: 3,
      borderTopLeftRadius: 2,
      borderTopRightRadius: 2,
      backgroundColor: theme.colors.accent
    }
  } as const;
}

import type { AppTheme } from "./theme";

export function baseStyles(theme: AppTheme) {
  const shadowOpacity = theme.mode === "dark" ? 0.28 : 0.12;

  return {
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    screenCanvas: {
      ...Object.freeze({
        position: "absolute" as const,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      })
    },
    backgroundOrbPrimary: {
      position: "absolute",
      top: -80,
      right: -50,
      width: 220,
      height: 220,
      borderRadius: 999,
      backgroundColor: theme.colors.accentMuted
    },
    backgroundOrbSecondary: {
      position: "absolute",
      bottom: 120,
      left: -80,
      width: 240,
      height: 240,
      borderRadius: 999,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(212, 168, 139, 0.08)"
          : "rgba(212, 168, 139, 0.12)"
    },
    heroCard: {
      backgroundColor: theme.colors.glassStrong,
      borderRadius: 32,
      marginHorizontal: 16,
      marginTop: 12,
      padding: 18,
      gap: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: theme.colors.shadow,
      shadowOpacity,
      shadowRadius: 28,
      shadowOffset: {
        width: 0,
        height: 18
      },
      elevation: 8
    },
    heroHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center"
    },
    heroStatus: {
      backgroundColor: theme.colors.accentSoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999
    },
    heroStatusText: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: "700"
    },
    eyebrow: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1.6
    },
    heroTitle: {
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: "800",
      letterSpacing: -0.8
    },
    heroSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 15,
      lineHeight: 22
    },
    heroMeta: {
      color: theme.colors.textSoft,
      fontSize: 13
    },
    /* ====== Auth：全屏 SVG 背景 + 底部半透明表单浮层 ====== */
    authRoot: {
      flex: 1
    },
    authKeyboardShell: {
      flex: 1
    },
    authScroll: {
      flex: 1
    },
    authScrollContent: {
      flexGrow: 1
    },
    authSpacer: {
      flex: 1,
      minHeight: 200
    },
    authFormArea: {
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(15, 17, 21, 0.92)"
          : "rgba(255, 255, 255, 0.94)",
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 24,
      paddingTop: 28,
      paddingBottom: 40,
      gap: 16
    },
    authInputStack: {
      gap: 12
    },
    authInput: {
      borderRadius: 12,
      borderWidth: 0,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 255, 255, 0.08)"
          : "rgba(0, 0, 0, 0.05)",
      color: theme.colors.text,
      fontSize: 15,
      paddingHorizontal: 16,
      paddingVertical: 14
    },
    authButton: {
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4
    },
    authButtonDisabled: {
      opacity: 0.5
    },
    authButtonPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }]
    },
    authButtonLabel: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "700"
    },
    authModeToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5
    },
    authModeHint: {
      color:
        theme.mode === "dark"
          ? "rgba(255, 255, 255, 0.45)"
          : "rgba(0, 0, 0, 0.4)",
      fontSize: 13
    },
    authModeLink: {
      color: theme.colors.accent,
      fontSize: 13,
      fontWeight: "700"
    },
    loadingCard: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    loadingText: {
      color: theme.colors.textMuted,
      fontSize: 15,
      textAlign: "center"
    },
    sectionCard: {
      flex: 1,
      gap: 14
    },
    flexList: {
      flex: 1
    },
    cardList: {
      gap: 12,
      paddingBottom: 152
    },
    sectionHeader: {
      gap: 4
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: -0.3
    },
    sectionCaption: {
      color: theme.colors.textSoft,
      fontSize: 13
    },
    segmentRow: {
      flexDirection: "row",
      gap: 10
    },
    formCard: {
      gap: 12
    },
    formTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "700"
    },
    input: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.text,
      fontSize: 16,
      paddingHorizontal: 16,
      paddingVertical: 14
    },
    buttonBase: {
      minHeight: 52,
      paddingHorizontal: 18,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
      flex: 1
    },
    buttonCompact: {
      minHeight: 38,
      paddingHorizontal: 14,
      flex: 0
    },
    buttonPrimary: {
      backgroundColor: theme.colors.accent,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.24 : 0.16,
      shadowRadius: 16,
      shadowOffset: {
        width: 0,
        height: 10
      },
      elevation: 6
    },
    buttonSecondary: {
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    buttonDanger: {
      backgroundColor: theme.colors.dangerSoft,
      borderWidth: 1,
      borderColor: "rgba(185, 92, 92, 0.18)"
    },
    buttonPressed: {
      opacity: 0.88,
      transform: [{ scale: 0.985 }]
    },
    buttonDisabled: {
      opacity: 0.5
    },
    buttonLabel: {
      color: theme.colors.textInverse,
      fontSize: 16,
      fontWeight: "800"
    },
    buttonLabelSecondary: {
      color: theme.colors.text
    },
    buttonLabelDanger: {
      color: theme.colors.danger
    },
    smallChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    smallChipActive: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: "transparent"
    },
    smallChipDanger: {
      backgroundColor: theme.colors.dangerSoft,
      borderColor: "transparent"
    },
    smallChipText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "700"
    },
    smallChipTextActive: {
      color: theme.colors.accentStrong
    },
    smallChipTextDanger: {
      color: theme.colors.danger
    },
    inlineTabRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8
    },
    inlineActionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8
    },
    emptyState: {
      paddingVertical: 44,
      paddingHorizontal: 18,
      alignItems: "center",
      justifyContent: "center"
    },
    emptyStateText: {
      color: theme.colors.textSoft,
      fontSize: 14,
      textAlign: "center",
      lineHeight: 22
    },
    errorPanel: {
      marginHorizontal: 16,
      marginTop: 12,
      backgroundColor: theme.colors.dangerSoft,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: "rgba(185, 92, 92, 0.14)",
      flexDirection: "row",
      alignItems: "center"
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 13,
      lineHeight: 18,
      flex: 1,
      paddingRight: 8
    },
    errorDismiss: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center"
    },
    errorDismissText: {
      color: theme.colors.danger,
      fontSize: 18,
      lineHeight: 18,
      fontWeight: "600"
    },
    footerStatus: {
      position: "absolute",
      left: 18,
      right: 18,
      bottom: 18,
      backgroundColor: theme.colors.glassStrong,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong
    },
    footerStatusText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "700",
      textAlign: "center"
    },
    iconGlyphWrap: {
      alignItems: "center",
      justifyContent: "center"
    },
    iconGlyph: {
      color: theme.colors.textMuted,
      fontSize: 20,
      fontWeight: "700"
    },
    iconGlyphMono: {
      color: theme.colors.text
    },
    iconGlyphActive: {
      color:
        theme.mode === "light" ? theme.colors.accent : theme.colors.accentStrong
    },
    iconGlyphInverse: {
      color: theme.colors.textInverse
    },
    iconGlyphBack: {
      fontSize: 30,
      lineHeight: 30
    },
    tabButtonIcon: {
      marginBottom: 4
    },
    typingDotsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4
    },
    typingDot: {
      width: 6,
      height: 6,
      borderRadius: 999
    },
    typingDotSmall: {
      width: 5,
      height: 5
    },
    typingDotDark: {
      backgroundColor: theme.colors.textSoft
    },
    typingDotLight: {
      backgroundColor: "rgba(255,255,255,0.9)"
    },
    skeletonScreen: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingHorizontal: 20,
      paddingTop: 22
    },
    skeletonHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 26
    },
    skeletonTitle: {
      width: 148,
      height: 38,
      borderRadius: 16,
      backgroundColor: theme.colors.skeletonStrong
    },
    skeletonHeaderIcons: {
      flexDirection: "row",
      gap: 10
    },
    skeletonCircleSmall: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.colors.skeleton
    },
    skeletonSearchBar: {
      height: 44,
      borderRadius: 16,
      marginBottom: 18,
      backgroundColor: theme.colors.skeleton
    },
    skeletonList: {
      gap: 18
    },
    skeletonChatRow: {
      flexDirection: "row",
      gap: 14,
      alignItems: "center"
    },
    skeletonCircleMedium: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.colors.skeleton
    },
    skeletonChatBody: {
      flex: 1,
      gap: 10
    },
    skeletonChatTopLine: {
      width: "60%",
      height: 14,
      borderRadius: 999,
      backgroundColor: theme.colors.skeletonStrong
    },
    skeletonChatBottomLine: {
      width: "78%",
      height: 12,
      borderRadius: 999,
      backgroundColor: theme.colors.skeleton
    }
  } as const;
}

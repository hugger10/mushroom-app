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
    /* ====== Auth：弧形渐变背景 + 品牌区 + 表单卡片 ====== */
    authRoot: {
      flex: 1,
      backgroundColor: theme.colors.background
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
    /* ---- 背景装饰：多层圆弧叠加出渐变感 + 圆环与泡泡 ---- */
    authArcBack: {
      position: "absolute",
      top: -190,
      left: -40,
      right: -40,
      height: 420,
      borderBottomLeftRadius: 460,
      borderBottomRightRadius: 460,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(0, 168, 132, 0.16)"
          : "rgba(0, 168, 132, 0.20)"
    },
    authArcMid: {
      position: "absolute",
      top: -160,
      left: -20,
      right: -20,
      height: 400,
      borderBottomLeftRadius: 440,
      borderBottomRightRadius: 440,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(0, 168, 132, 0.28)"
          : "rgba(0, 168, 132, 0.42)"
    },
    authArcFront: {
      position: "absolute",
      top: -130,
      left: 0,
      right: 0,
      height: 370,
      borderBottomLeftRadius: 420,
      borderBottomRightRadius: 420,
      backgroundColor:
        theme.mode === "dark" ? "rgba(5, 106, 84, 0.95)" : theme.colors.accent
    },
    authRingLarge: {
      position: "absolute",
      top: 60,
      right: -70,
      width: 210,
      height: 210,
      borderRadius: 999,
      borderWidth: 14,
      borderColor: theme.colors.accent,
      opacity: theme.mode === "dark" ? 0.5 : 0.6
    },
    authRingMedium: {
      position: "absolute",
      top: 150,
      left: -52,
      width: 128,
      height: 128,
      borderRadius: 999,
      borderWidth: 10,
      borderColor: theme.colors.accent,
      opacity: theme.mode === "dark" ? 0.42 : 0.5
    },
    /* ---- 右上「正在输入」聊天气泡：实心气泡 + 三点 + 尾巴 ---- */
    authChatBubble: {
      position: "absolute",
      top: 92,
      right: 36,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      width: 50,
      height: 40,
      borderRadius: 14,
      backgroundColor: theme.colors.accent,
      opacity: theme.mode === "dark" ? 0.75 : 0.9
    },
    authChatBubbleTail: {
      position: "absolute",
      left: 10,
      bottom: -4,
      width: 11,
      height: 11,
      borderRadius: 2,
      backgroundColor: theme.colors.accent,
      opacity: theme.mode === "dark" ? 0.75 : 0.9,
      transform: [{ rotate: "45deg" }]
    },
    /* ---- 左上「收发消息」：空心聊天气泡 + 尾巴 + 消息点 ---- */
    authChatOutlineWrap: {
      position: "absolute",
      top: 148,
      left: 44,
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 7
    },
    authChatOutlineBox: {
      width: 34,
      height: 28
    },
    authChatOutline: {
      width: 34,
      height: 28,
      borderRadius: 10,
      borderWidth: 5,
      borderColor: theme.colors.accent,
      opacity: theme.mode === "dark" ? 0.35 : 0.42
    },
    authChatOutlineTail: {
      position: "absolute",
      right: -5,
      bottom: -7,
      width: 10,
      height: 10,
      borderRadius: 2,
      borderWidth: 5,
      borderColor: theme.colors.accent,
      opacity: theme.mode === "dark" ? 0.35 : 0.42,
      transform: [{ rotate: "45deg" }]
    },
    authChatOutlineDot: {
      width: 9,
      height: 9,
      borderRadius: 999,
      backgroundColor: theme.colors.accent,
      opacity: theme.mode === "dark" ? 0.6 : 0.75
    },
    authChatDot: {
      position: "absolute",
      top: 240,
      right: 118,
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.accent,
      opacity: theme.mode === "dark" ? 0.4 : 0.5
    },
    /* ---- 顶部 logo ---- */
    authLogoWrap: {
      alignItems: "center",
      marginTop: 18,
      marginBottom: 26
    },
    authLogo: {
      width: 76,
      height: 76,
      borderRadius: 999,
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.55 : 0.22,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8
    },
    /* ---- 顶部占位：维持卡片在品牌区移除前的高度 ---- */
    authSpacer: {
      height: 95
    },
    /* ---- 表单卡片 ---- */
    authCard: {
      marginHorizontal: 20,
      borderRadius: 28,
      backgroundColor:
        theme.mode === "dark" ? "rgba(32, 44, 51, 0.96)" : theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 24,
      gap: 16,
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.5 : 0.14,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 16 },
      elevation: 10
    },
    authCardHeader: {
      gap: 5
    },
    authCardTitle: {
      color: theme.colors.text,
      fontSize: 25,
      fontWeight: "800",
      letterSpacing: -0.5
    },
    authCardSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 19
    },
    /* ---- 方法分段控制器 ---- */
    authMethodTabs: {
      flexDirection: "row",
      backgroundColor: theme.colors.inputBg,
      borderRadius: 999,
      padding: 4,
      gap: 4
    },
    authMethodTab: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 9,
      borderRadius: 999
    },
    authMethodTabActive: {
      backgroundColor: theme.colors.surface,
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.5 : 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3
    },
    authMethodTabText: {
      color: theme.colors.textSoft,
      fontSize: 13,
      fontWeight: "600"
    },
    authMethodTabTextActive: {
      color: theme.colors.accent,
      fontWeight: "700"
    },
    /* ---- 输入行 ---- */
    authFieldStack: {
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
    authFieldRow: {
      flexDirection: "row",
      alignItems: "center",
      height: 52,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: "transparent",
      backgroundColor: theme.colors.inputBg,
      paddingHorizontal: 14,
      gap: 10
    },
    authFieldRowFocused: {
      borderColor: theme.colors.accent
    },
    authFieldIcon: {
      color: theme.colors.textSoft
    },
    authFieldInput: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 15,
      paddingVertical: 0
    },
    authPhonePrefix: {
      color: theme.colors.textMuted,
      fontSize: 15,
      fontWeight: "700",
      paddingRight: 10,
      borderRightWidth: 1,
      borderRightColor: theme.colors.divider
    },
    authEyeBtn: {
      padding: 4
    },
    /* ---- 验证码 ---- */
    authCodeBtn: {
      height: 38,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: theme.colors.accentSoft,
      alignItems: "center",
      justifyContent: "center"
    },
    authCodeBtnDisabled: {
      opacity: 0.5
    },
    authCodeBtnText: {
      color: theme.colors.accent,
      fontSize: 13,
      fontWeight: "700"
    },
    /* ---- 主按钮 ---- */
    authButton: {
      height: 50,
      borderRadius: 25,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.colors.accent,
      shadowOpacity: theme.mode === "dark" ? 0.5 : 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 5
    },
    authButtonDisabled: {
      opacity: 0.5
    },
    authButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.985 }]
    },
    authButtonLabel: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "700"
    },
    /* ---- 登录/注册切换 ---- */
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

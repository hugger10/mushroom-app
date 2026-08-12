import { StyleSheet } from "react-native";
import type { AppTheme } from "./theme";

export function listAccountStyles(theme: AppTheme) {
  const shadowOpacity = theme.mode === "dark" ? 0.24 : 0.12;

  return {
    homeShell: {
      flex: 1,
      backgroundColor: "transparent"
    },
    homeContent: {
      flex: 1
    },
    contactsShell: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    contactsOverviewCard: {
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 6,
      paddingHorizontal: 4,
      paddingTop: 8,
      paddingBottom: 6,
      borderRadius: 0,
      backgroundColor: "transparent",
      borderWidth: 0
    },
    contactsOverviewRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12
    },
    contactsOverviewTitle: {
      color: theme.colors.text,
      fontSize: 26,
      fontWeight: "800",
      letterSpacing: -0.8
    },
    contactsOverviewSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 13,
      marginTop: 3
    },
    contactsOverviewChips: {
      flexDirection: "row",
      gap: 8
    },
    contactsOverviewChip: {
      minWidth: 38,
      height: 28,
      borderRadius: 14,
      paddingHorizontal: 10,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center"
    },
    contactsOverviewChipAccent: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accentMuted
    },
    contactsOverviewChipText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "800"
    },
    contactsOverviewChipTextAccent: {
      color: theme.colors.accentStrong
    },
    addressBookPanel: {
      marginHorizontal: 16,
      marginTop: 4,
      marginBottom: 10,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      overflow: "hidden"
    },
    addressBookPanelHeader: {
      minHeight: 52,
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12
    },
    addressBookPanelTitleWrap: {
      flex: 1,
      minWidth: 0
    },
    addressBookPanelTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "800"
    },
    addressBookPanelSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginTop: 2,
      fontWeight: "600"
    },
    addressBookRefreshButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    addressBookRefreshButtonPressed: {
      opacity: 0.72
    },
    addressBookMatchList: {
      borderTopWidth: 0.5,
      borderTopColor: theme.colors.border
    },
    addressBookEmpty: {
      borderTopWidth: 0.5,
      borderTopColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12
    },
    addressBookEmptyText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "600"
    },
    addressBookMatchRow: {
      minHeight: 62,
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.colors.border
    },
    addressBookMatchAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    },
    addressBookMatchBody: {
      flex: 1,
      minWidth: 0,
      marginLeft: 11,
      justifyContent: "center"
    },
    addressBookMatchLocalName: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700"
    },
    addressBookMatchAccountName: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginTop: 2,
      fontWeight: "600"
    },
    addressBookMatchActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginLeft: 10
    },
    addressBookMatchIconButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accentMuted
    },
    addressBookMatchIconButtonPressed: {
      opacity: 0.72
    },
    addressBookMatchSaveButton: {
      minHeight: 34,
      borderRadius: 17,
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.text,
      borderWidth: 1,
      borderColor: theme.colors.text
    },
    addressBookMatchSaveButtonPressed: {
      opacity: 0.72
    },
    addressBookMatchSaveText: {
      color: theme.colors.background,
      fontSize: 12,
      fontWeight: "800"
    },
    contactsScrollContent: {
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 132,
      gap: 14
    },
    contactsHeroCard: {
      borderRadius: 28,
      paddingHorizontal: 20,
      paddingVertical: 20,
      backgroundColor: theme.colors.glassStrong,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 10,
      shadowColor: theme.colors.shadow,
      shadowOpacity,
      shadowRadius: 20,
      shadowOffset: {
        width: 0,
        height: 12
      },
      elevation: 6
    },
    contactsHeroEyebrow: {
      color: theme.colors.textSoft,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.4,
      textTransform: "uppercase"
    },
    contactsHeroTitle: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "800",
      letterSpacing: -0.7
    },
    contactsHeroText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20
    },
    contactsFilterSegment: {
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap"
    },
    contactsList: {
      flex: 1,
      backgroundColor: "transparent"
    },
    contactsFeaturePanel: {
      borderRadius: 24,
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accentMuted,
      overflow: "hidden",
      shadowColor: theme.colors.shadow,
      shadowOpacity,
      shadowRadius: 18,
      shadowOffset: {
        width: 0,
        height: 10
      },
      elevation: 4
    },
    contactsFeatureRow: {
      minHeight: 78,
      paddingHorizontal: 18,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 14
    },
    contactsFeatureBody: {
      flex: 1,
      gap: 4
    },
    contactsFeatureTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "700"
    },
    contactsFeatureSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18
    },
    contactsFeatureBadge: {
      minWidth: 34,
      height: 26,
      borderRadius: 13,
      paddingHorizontal: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.danger
    },
    contactsFeatureBadgeText: {
      color: theme.colors.textInverse,
      fontSize: 12,
      fontWeight: "800"
    },
    contactsFriendsPanel: {
      borderRadius: 24,
      backgroundColor: theme.colors.glassStrong,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: "hidden",
      shadowColor: theme.colors.shadow,
      shadowOpacity,
      shadowRadius: 18,
      shadowOffset: {
        width: 0,
        height: 10
      },
      elevation: 4
    },
    contactsFriendsHeader: {
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.colors.surface
    },
    contactsFriendsTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "800"
    },
    contactsFriendsCount: {
      minWidth: 28,
      height: 24,
      borderRadius: 12,
      paddingHorizontal: 8,
      textAlign: "center",
      lineHeight: 24,
      color: theme.colors.accentStrong,
      fontSize: 12,
      fontWeight: "800",
      backgroundColor: theme.colors.accentSoft
    },
    contactsSection: {
      borderRadius: 28,
      backgroundColor: theme.colors.glassStrong,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: "hidden"
    },
    contactsScrollContentCompact: {
      paddingBottom: 108
    },
    contactsListPanel: {
      backgroundColor: theme.colors.surface,
      borderTopWidth: 0.5,
      borderColor: theme.colors.border
    },
    contactsRow: {
      minHeight: 58,
      paddingHorizontal: 16,
      paddingVertical: 9,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.background
    },
    contactsRowLast: {},
    contactsAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    },
    contactsAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 16,
      fontWeight: "700"
    },
    contactsRowBody: {
      flex: 1,
      minHeight: 40,
      justifyContent: "center",
      marginLeft: 12
    },
    contactsRowTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "500"
    },
    contactsListDivider: {
      marginLeft: 72,
      height: 0.5,
      backgroundColor: theme.colors.border
    },
    contactsNewFriendsIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent
    },
    contactsRowAlertDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.colors.danger,
      marginLeft: 8
    },
    contactRequestsHeader: {
      height: 52,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.colors.border
    },
    contactRequestsBackButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center"
    },
    contactRequestsTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "700"
    },
    contactRequestsHeaderSpacer: {
      width: 32,
      height: 32
    },
    friendRequestRow: {
      minHeight: 68,
      paddingHorizontal: 18,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.surface
    },
    friendRequestBody: {
      flex: 1,
      marginLeft: 12,
      gap: 3
    },
    friendRequestSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 16
    },
    friendRequestActions: {
      flexDirection: "row",
      gap: 8,
      marginLeft: 12
    },
    friendRequestAction: {
      minWidth: 58,
      height: 32,
      borderRadius: 16,
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center"
    },
    friendRequestReject: {
      backgroundColor: theme.colors.surfaceMuted
    },
    friendRequestRejectText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: "700"
    },
    friendRequestAccept: {
      backgroundColor: theme.colors.accent
    },
    friendRequestAcceptText: {
      color: theme.colors.textInverse,
      fontSize: 13,
      fontWeight: "700"
    },
    homeScrollContent: {
      paddingBottom: 80
    },
    homeHeader: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
      backgroundColor: theme.colors.background,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center"
    },
    homeHeaderInner: {
      flex: 1,
      justifyContent: "center"
    },
    homeHeaderHeading: {
      gap: 2
    },
    homeHeaderTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12
    },
    homeHeaderTitle: {
      color: theme.colors.text,
      fontSize: 29,
      fontWeight: "800",
      letterSpacing: -0.8
    },
    homeHeaderSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 15,
      marginTop: 2
    },
    homeHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12
    },
    chatsHero: {
      flex: 1,
      gap: 12
    },
    chatsHeroTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    homeHeaderActionButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.18 : 0.08,
      shadowRadius: 12,
      shadowOffset: {
        width: 0,
        height: 8
      },
      elevation: 4
    },
    homeHeaderActionButtonPressed: {
      backgroundColor: theme.colors.surfaceMuted
    },
    homeHeaderActionButtonInline: {
      width: 40,
      height: 40,
      borderRadius: 20
    },
    homeHeaderPlusIcon: {
      fontSize: 22,
      color: theme.colors.text,
      lineHeight: 22,
      textAlign: "center",
      textAlignVertical: "center"
    },
    homeActionMenuLayer: {
      ...Object.freeze({
        position: "absolute" as const,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      }),
      zIndex: 20
    },
    homeActionMenuBackdrop: {
      ...Object.freeze({
        position: "absolute" as const,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      }),
      backgroundColor: "transparent"
    },
    homeActionMenuCard: {
      position: "absolute",
      top: 56,
      right: 16,
      minWidth: 132,
      maxWidth: 250,
      borderRadius: 18,
      overflow: "hidden",
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      paddingVertical: 4,
      paddingHorizontal: 0,
      gap: 0,
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.3 : 0.16,
      shadowRadius: 18,
      shadowOffset: {
        width: 0,
        height: 12
      },
      elevation: 8
    },
    homeActionMenuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: "transparent"
    },
    homeActionMenuItemPressed: {
      backgroundColor: theme.colors.surfaceMuted
    },
    homeActionMenuIconWrap: {
      width: 24,
      height: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
      borderWidth: 0,
      borderColor: "transparent"
    },
    homeActionMenuIcon: {
      fontSize: 20,
      color: theme.colors.accent
    },
    homeActionMenuTextWrap: {},
    homeActionMenuTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700"
    },
    homeActionMenuCaption: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 17
    },
    homeSearchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 16,
      height: 44,
      borderWidth: 1,
      borderColor: "transparent"
    },
    homeSearchInput: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 15,
      paddingVertical: 0,
      paddingHorizontal: 0,
      backgroundColor: "transparent",
      borderWidth: 0
    },
    homeSearchPlaceholder: {
      flex: 1,
      color: theme.colors.inputPlaceholder,
      fontSize: 15
    },
    searchOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.colors.background,
      zIndex: 100
    },
    searchOverlayHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 6,
      backgroundColor: theme.colors.background
    },
    searchOverlayInputRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 16,
      height: 44,
      borderWidth: 1,
      borderColor: "transparent"
    },
    searchOverlayInput: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 15,
      paddingVertical: 0,
      paddingHorizontal: 0,
      backgroundColor: "transparent",
      borderWidth: 0
    },
    searchOverlayCloseBtn: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 22,
      backgroundColor: theme.colors.surfaceMuted
    },
    searchOverlayContent: {
      flex: 1
    },
    connectionSpinner: {
      position: "absolute",
      left: 0,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6
    },
    connectionSpinnerText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: "500"
    },
    offlineBanner: {
      backgroundColor: theme.colors.dangerSoft,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: "rgba(185, 92, 92, 0.14)",
      alignItems: "center"
    },
    offlineBannerText: {
      color: theme.colors.danger,
      fontSize: 13,
      fontWeight: "600"
    },
    homeSpotlightCard: {
      borderRadius: 30,
      paddingHorizontal: 20,
      paddingVertical: 20,
      backgroundColor: theme.colors.glass,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 18,
      shadowColor: theme.colors.shadow,
      shadowOpacity,
      shadowRadius: 26,
      shadowOffset: {
        width: 0,
        height: 18
      },
      elevation: 8
    },
    homeSpotlightTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12
    },
    homeSpotlightKicker: {
      color: theme.colors.textSoft,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1.8
    },
    homeSpotlightTitle: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "800",
      letterSpacing: -0.8,
      marginTop: 6
    },
    homeSpotlightText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8
    },
    homeSpotlightBadge: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.accentSoft
    },
    homeSpotlightBadgeText: {
      color: theme.colors.accentStrong,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5
    },
    homeSpotlightMetrics: {
      flexDirection: "row",
      gap: 12
    },
    homeSpotlightMetricCard: {
      flex: 1,
      borderRadius: 20,
      padding: 14,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    homeSpotlightMetricValue: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.5
    },
    homeSpotlightMetricLabel: {
      color: theme.colors.textSoft,
      fontSize: 12,
      marginTop: 6
    },
    homeSectionHeading: {
      paddingHorizontal: 4,
      paddingTop: 6
    },
    homeSectionEyebrow: {
      color: theme.colors.textSoft,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1.6
    },
    homeSectionTitle: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.7,
      marginTop: 4
    },
    chatListWrap: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingBottom: 12
    },
    chatsList: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    chatsListContent: {
      paddingBottom: 18
    },
    chatListHeader: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 6,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.colors.surface
    },
    chatListHeaderTitle: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5
    },
    rowCard: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      backgroundColor: "transparent"
    },
    rowCardArchived: {
      opacity: 0.92
    },
    rowMain: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      paddingVertical: 9
    },
    rowAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      overflow: "hidden"
    },
    rowAvatarWrap: {
      position: "relative",
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      borderColor: "transparent",
      borderWidth: 1.5,
      marginRight: 12
    },
    rowAvatarRingOnline: {
      borderColor: theme.colors.accent
    },
    rowAvatarRingRecent: {
      borderColor: theme.colors.presenceRecent
    },
    rowOnlineDotWrap: {
      position: "absolute",
      right: -1,
      bottom: -1
    },
    rowAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 20,
      fontWeight: "600"
    },
    rowBody: {
      flex: 1,
      justifyContent: "center"
    },
    rowHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginBottom: 3
    },
    rowTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "600",
      flex: 1,
      marginRight: 8,
      letterSpacing: -0.2
    },
    rowTime: {
      color: theme.colors.textSoft,
      fontSize: 13,
      fontWeight: "400"
    },
    rowHeaderTrailing: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4
    },
    rowStateIcon: {
      marginTop: 1
    },
    rowTimeUnread: {
      color: theme.colors.textSoft,
      fontSize: 13,
      fontWeight: "400"
    },
    rowSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 18,
      flex: 1
    },
    rowSubtitleMention: {
      color: theme.colors.accent,
      fontWeight: "600"
    },
    rowTypingLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flex: 1,
      minWidth: 0
    },
    rowSubtitleTyping: {
      color: theme.colors.accent,
      fontSize: 14,
      lineHeight: 18,
      fontStyle: "italic",
      flex: 1
    },
    rowMeta: {
      flexDirection: "row",
      gap: 6,
      flexWrap: "wrap",
      alignItems: "center"
    },
    friendFooter: {
      marginTop: 6
    },
    metaPill: {
      backgroundColor: theme.colors.surfaceMuted,
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999
    },
    metaDraft: {
      backgroundColor: theme.colors.accentSoft,
      color: theme.colors.accentStrong,
      fontSize: 11,
      fontWeight: "700",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999
    },
    unreadBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
      marginLeft: 8
    },
    unreadBadgeText: {
      color: theme.colors.textInverse,
      fontSize: 12,
      fontWeight: "600"
    },
    rowDivider: {
      marginLeft: 76,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.divider
    },
    conversationSwipeRow: {
      position: "relative",
      overflow: "hidden",
      backgroundColor: theme.colors.backgroundAlt
    },
    conversationSwipeActionsSurface: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "stretch",
      backgroundColor: theme.colors.backgroundAlt
    },
    conversationSwipeShell: {
      width: "100%",
      backgroundColor: theme.colors.background
    },
    conversationSwipeCard: {
      width: "100%",
      justifyContent: "center",
      backgroundColor: theme.colors.background,
      paddingBottom: StyleSheet.hairlineWidth
    },
    conversationSwipeTrack: {
      height: "100%",
      justifyContent: "center",
      backgroundColor: theme.colors.backgroundAlt
    },
    conversationSwipeTrackLeft: {
      alignItems: "flex-start",
      paddingLeft: 10
    },
    conversationSwipeTrackRight: {
      alignItems: "flex-end",
      paddingRight: 10
    },
    conversationSwipeTray: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      height: "100%"
    },
    conversationSwipeAction: {
      width: 54,
      alignItems: "center",
      justifyContent: "center",
      gap: 3
    },
    conversationSwipeActionCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center"
    },
    conversationSwipeActionLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: "700",
      lineHeight: 12,
      textAlign: "center"
    },
    conversationArchiveEntry: {
      minHeight: 44,
      paddingHorizontal: 16,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 255, 255, 0.035)"
          : "rgba(17, 24, 39, 0.025)",
      borderBottomWidth: 0.5,
      borderBottomColor: theme.colors.border
    },
    conversationArchiveEntryPressed: {
      opacity: 0.7
    },
    conversationArchiveEntryIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted
    },
    conversationArchiveEntryText: {
      flex: 1,
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: "700"
    },
    chatArchiveHeader: {
      minHeight: 64,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
      backgroundColor: theme.colors.background,
      flexDirection: "row",
      alignItems: "center"
    },
    chatArchiveBackButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    chatArchiveBackButtonPressed: {
      opacity: 0.65,
      transform: [{ scale: 0.95 }]
    },
    chatArchiveBackIcon: {
      color: theme.colors.text,
      fontSize: 24
    },
    conversationActionsSheet: {
      marginTop: "auto",
      paddingBottom: 28
    },
    conversationActionsHeader: {
      gap: 4
    },
    conversationActionsTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800"
    },
    conversationActionsSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18
    },
    conversationActionsList: {
      gap: 10
    },
    conversationActionItem: {
      minHeight: 64,
      borderRadius: 20,
      alignItems: "center",
      flexDirection: "row",
      gap: 14,
      justifyContent: "flex-start",
      paddingHorizontal: 16,
      backgroundColor: theme.colors.surfaceMuted
    },
    conversationActionItemIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center"
    },
    conversationActionItemLabel: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700"
    },
    rowStatusDot: {
      width: 9,
      height: 9,
      borderRadius: 999
    },
    rowStatusDotOnline: {
      backgroundColor: theme.colors.success
    },
    rowStatusDotOffline: {
      backgroundColor: theme.colors.textSoft
    },
    rowPreviewStatus: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      minHeight: 22
    },
    accountShell: {
      flex: 1,
      paddingHorizontal: 18,
      paddingTop: 4,
      gap: 14
    },
    accountScrollContent: {
      gap: 14,
      paddingBottom: 132
    },
    accountHeroCard: {
      backgroundColor: theme.colors.glassStrong,
      borderRadius: 30,
      paddingHorizontal: 22,
      paddingVertical: 26,
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: theme.colors.shadow,
      shadowOpacity,
      shadowRadius: 24,
      shadowOffset: {
        width: 0,
        height: 14
      },
      elevation: 6
    },
    accountAvatar: {
      width: 104,
      height: 104,
      borderRadius: 52,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    },
    accountAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 36,
      fontWeight: "800"
    },
    accountName: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.5
    },
    accountSubline: {
      color: theme.colors.textSoft,
      fontSize: 14
    },
    accountSignature: {
      color: theme.colors.textMuted,
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20
    },
    metricGrid: {
      flexDirection: "row",
      gap: 12
    },
    metricCard: {
      flex: 1,
      backgroundColor: theme.colors.glassStrong,
      borderRadius: 22,
      padding: 16,
      gap: 6,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    metricLabel: {
      color: theme.colors.textSoft,
      fontSize: 12
    },
    metricValue: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "800"
    },
    actionGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12
    },
    quickActionCard: {
      width: "31%",
      minWidth: 92,
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 22,
      paddingVertical: 18,
      paddingHorizontal: 12,
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    quickActionLabel: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700",
      textAlign: "center",
      lineHeight: 18
    },
    infoCard: {
      backgroundColor: theme.colors.glassStrong,
      borderRadius: 24,
      padding: 16,
      gap: 12,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    infoText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20
    },
    infoLabel: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700"
    },
    listCard: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 18,
      padding: 14,
      gap: 8,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    listCardSelected: {
      borderColor: theme.colors.accentStrong,
      backgroundColor: theme.colors.accentSoft
    },
    listCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12
    },
    listCardMain: {
      flex: 1,
      gap: 4
    },
    listCardTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "800"
    },
    listCardSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18
    },
    listCardMeta: {
      color: theme.colors.textSoft,
      fontSize: 12,
      lineHeight: 18
    },
    groupSelectMark: {
      minWidth: 52,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center"
    },
    groupSelectMarkActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent
    },
    groupSelectMarkText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "700"
    },
    groupSelectMarkTextActive: {
      color: theme.colors.textInverse
    },
    textAreaInput: {
      minHeight: 88,
      textAlignVertical: "top"
    },
    textAreaInputLarge: {
      minHeight: 120,
      textAlignVertical: "top"
    },
    bottomTabs: {
      flexDirection: "row",
      backgroundColor: theme.colors.surfaceStrong,
      paddingHorizontal: 6,
      paddingTop: 6,
      paddingBottom: 6,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      justifyContent: "space-between",
      alignItems: "center"
    },
    tabButton: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      height: 50,
      borderRadius: 22,
      gap: 3
    },
    tabButtonActive: {},
    tabButtonIconText: {
      fontSize: 20
    },
    tabButtonLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: "600"
    },
    tabButtonLabelActive: {
      color:
        theme.mode === "light" ? theme.colors.accent : theme.colors.accentStrong
    },
    tabBadgeWrap: {
      position: "absolute",
      top: 2,
      right: "22%",
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: theme.colors.danger,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: theme.colors.surface
    },
    tabBadgeText: {
      color: theme.colors.textInverse,
      fontSize: 11,
      fontWeight: "800"
    },
    settingsSectionTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "800"
    },
    settingsOptionCard: {
      backgroundColor: theme.colors.glassStrong,
      borderRadius: 24,
      padding: 16,
      gap: 12,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    settingsOptionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 6
    },
    settingsOptionMain: {
      flex: 1,
      gap: 4
    },
    settingsOptionTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "700"
    },
    settingsOptionSub: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18
    },
    settingsToggleMock: {
      width: 52,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceMuted,
      padding: 3,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    settingsToggleMockActive: {
      backgroundColor: theme.colors.accent
    },
    settingsToggleKnob: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: theme.colors.textInverse
    },
    settingsToggleKnobActive: {
      alignSelf: "flex-end"
    },
    accountSecurityContent: {
      paddingHorizontal: 18,
      paddingBottom: 32,
      paddingTop: 6,
      gap: 14
    },
    accountSecurityHero: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.surfaceStrong,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 12
    },
    accountSecurityHeroIcon: {
      width: 48,
      height: 48,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    accountSecurityHeroIconSafe: {
      backgroundColor:
        theme.mode === "dark" ? "rgba(89, 193, 138, 0.16)" : "#EBFFF4",
      borderColor:
        theme.mode === "dark" ? "rgba(89, 193, 138, 0.22)" : "#CFF4DD"
    },
    accountSecurityHeroIconDanger: {
      backgroundColor:
        theme.mode === "dark" ? "rgba(255, 94, 94, 0.14)" : "#FFF0F0",
      borderColor: theme.mode === "dark" ? "rgba(255, 94, 94, 0.22)" : "#FFD6D6"
    },
    accountSecurityHeroMain: {
      flex: 1,
      gap: 4
    },
    accountSecurityHeroTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: 0
    },
    accountSecurityHeroSub: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18
    },
    accountSecurityListSection: {
      overflow: "hidden",
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    accountSecurityListRow: {
      minHeight: 58,
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 11
    },
    accountSecurityListIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted
    },
    accountSecurityListIconDanger: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        theme.mode === "dark" ? "rgba(255, 94, 94, 0.12)" : "#FFF0F0"
    },
    accountSecurityListTitle: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "600"
    },
    accountSecurityListValue: {
      maxWidth: 118,
      color: theme.colors.textMuted,
      fontSize: 14,
      textAlign: "right"
    },
    accountSecurityListSeparator: {
      height: 0.5,
      marginLeft: 59,
      backgroundColor: theme.colors.border
    },
    accountSecuritySectionLabel: {
      marginTop: 2,
      marginLeft: 4,
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: "700"
    },
    accountSecurityDangerRowTitle: {
      flex: 1,
      color: theme.colors.danger,
      fontSize: 16,
      fontWeight: "600"
    },
    accountSecuritySummaryBar: {
      minHeight: 42,
      borderRadius: 16,
      paddingHorizontal: 14,
      alignItems: "center",
      flexDirection: "row",
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    accountSecuritySummaryText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: "700"
    },
    accountSecuritySection: {
      backgroundColor: theme.colors.surfaceStrong,
      borderRadius: 24,
      padding: 16,
      gap: 12,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    accountSecuritySectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12
    },
    accountSecuritySectionTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800"
    },
    accountSecuritySectionMeta: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: "700"
    },
    accountSecurityActionRow: {
      flexDirection: "row",
      gap: 10
    },
    accountSecurityDangerButton: {
      flex: 1,
      minHeight: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        theme.mode === "dark" ? "rgba(255, 94, 94, 0.14)" : "#FFF0F0",
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(255, 94, 94, 0.2)" : "#FFD6D6"
    },
    accountSecurityDangerButtonText: {
      color: theme.colors.danger,
      fontSize: 13,
      fontWeight: "800"
    },
    accountSecurityEmptyText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20
    },
    accountSecurityDeviceCard: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 18,
      padding: 14,
      gap: 8,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    accountSecurityDeviceHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12
    },
    accountSecurityDeviceIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    accountSecurityDeviceMain: {
      flex: 1,
      gap: 3
    },
    accountSecurityDeviceTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "800"
    },
    accountSecurityDeviceSub: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: "700"
    },
    accountSecurityTag: {
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accentMuted
    },
    accountSecurityTagText: {
      color: theme.colors.accentStrong,
      fontSize: 11,
      fontWeight: "800"
    },
    accountSecurityMetaText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 17
    },
    accountSecurityDeviceActions: {
      flexDirection: "row",
      gap: 8,
      justifyContent: "flex-end",
      paddingTop: 2
    },
    accountSecurityActionButton: {
      minHeight: 32,
      borderRadius: 16,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    accountSecurityActionButtonDanger: {
      minHeight: 32,
      borderRadius: 16,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        theme.mode === "dark" ? "rgba(255, 94, 94, 0.12)" : "#FFF0F0",
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(255, 94, 94, 0.2)" : "#FFD6D6"
    },
    accountSecurityActionText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "800"
    },
    accountSecurityDangerText: {
      color: theme.colors.danger,
      fontSize: 12,
      fontWeight: "800"
    },
    accountSecurityFullButton: {
      minHeight: 46,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accentMuted
    },
    accountSecurityFullButtonText: {
      color: theme.colors.accentStrong,
      fontSize: 14,
      fontWeight: "800"
    },
    accountSecurityFullDangerButton: {
      minHeight: 46,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        theme.mode === "dark" ? "rgba(255, 94, 94, 0.12)" : "#FFF0F0",
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(255, 94, 94, 0.2)" : "#FFD6D6"
    },
    accountSecurityPrivacyRow: {
      paddingHorizontal: 14,
      paddingVertical: 13,
      gap: 10
    },
    accountSecurityPrivacyHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12
    },
    accountSecurityPrivacyMain: {
      flex: 1,
      gap: 3
    },
    accountSecurityPrivacyTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "800"
    },
    accountSecurityPrivacySub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 17
    },
    accountSecurityPrivacyValue: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: "700"
    },
    accountSecurityPrivacyOptions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      paddingTop: 3
    },
    accountSecurityPrivacyChip: {
      minHeight: 32,
      borderRadius: 16,
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    accountSecurityPrivacyChipActive: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accentMuted
    },
    accountSecurityPrivacyChipText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "800"
    },
    accountSecurityPrivacyChipTextActive: {
      color: theme.colors.accentStrong
    },
    accountSecurityEventRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10
    },
    accountSecurityEventDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.accent
    },
    accountSecurityEventMain: {
      flex: 1,
      gap: 2
    },
    accountSecurityEventTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "800"
    },
    accountSecurityEventStatus: {
      fontSize: 12,
      fontWeight: "800"
    },
    accountSecurityEventStatusSuccess: {
      color: theme.colors.success
    },
    accountSecurityEventStatusFailed: {
      color: theme.colors.danger
    },
    notificationSettingsContent: {
      paddingHorizontal: 16,
      paddingBottom: 28
    },
    notificationPermissionBanner: {
      minHeight: 68,
      borderRadius: 12,
      marginBottom: 18,
      paddingVertical: 12,
      paddingLeft: 14,
      paddingRight: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: "#FFF4E5",
      borderWidth: 1,
      borderColor: "#FCD9A8",
      overflow: "hidden"
    },
    notificationPermissionBannerStripe: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
      backgroundColor: "#F59E0B"
    },
    notificationPermissionBannerIcon: {
      width: 28,
      height: 28,
      alignItems: "center",
      justifyContent: "center"
    },
    notificationPermissionBannerMain: {
      flex: 1,
      minWidth: 0,
      gap: 2
    },
    notificationPermissionBannerTitle: {
      color: "#7C2D12",
      fontSize: 14,
      fontWeight: "700"
    },
    notificationPermissionBannerSub: {
      color: "#92400E",
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "500"
    },
    notificationPermissionBannerAction: {
      minWidth: 56,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      backgroundColor: "#F59E0B"
    },
    notificationPermissionBannerActionText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700"
    },
    notificationSettingsSection: {
      overflow: "hidden",
      borderRadius: 22,
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 4
    },
    notificationTimeSheetScroll: {
      maxHeight: 360
    },
    notificationSettingRow: {
      minHeight: 50,
      paddingHorizontal: 16,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 12
    },
    notificationSettingsSeparator: {
      height: 1,
      marginLeft: 16,
      backgroundColor: theme.colors.border
    },
    notificationRowDisabled: {
      opacity: 0.45
    },
    notificationChoiceRow: {
      minHeight: 64,
      paddingHorizontal: 16,
      paddingVertical: 11,
      flexDirection: "row",
      alignItems: "center",
      gap: 12
    },
    notificationValueRow: {
      minHeight: 56,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12
    },
    notificationSettingMain: {
      flex: 1,
      minWidth: 0,
      gap: 3
    },
    notificationSettingTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700"
    },
    notificationSettingSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "600"
    },
    notificationChoiceDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: theme.colors.borderStrong
    },
    notificationValueRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flexShrink: 1,
      minWidth: 0
    },
    notificationValueText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      fontWeight: "700",
      flexShrink: 1
    },
    meScreenContainer: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    meScreenScrollContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 28
    },
    meScreenTopHero: {
      alignItems: "center",
      backgroundColor: "transparent",
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 16,
      marginBottom: 14
    },
    meScreenTopQrButton: {
      position: "absolute",
      top: 12,
      right: 12,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center"
    },
    meScreenTopAvatarWrapper: {
      width: 116,
      height: 116,
      position: "relative",
      alignItems: "center",
      justifyContent: "center"
    },
    meScreenTopAvatarTouch: {
      width: 116,
      height: 116,
      borderRadius: 58
    },
    meScreenTopAvatar: {
      width: 116,
      height: 116,
      borderRadius: 58,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: theme.colors.glassStrong
    },
    meScreenTopAvatarText: {
      fontSize: 50,
      fontWeight: "800",
      color: "#FFFFFF"
    },
    meScreenTopAvatarCameraBadge: {
      position: "absolute",
      right: 4,
      bottom: 4,
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentStrong,
      borderWidth: 2,
      borderColor: theme.colors.background
    },
    meScreenTopNickname: {
      marginTop: 8,
      fontSize: 22,
      fontWeight: "800",
      color: theme.colors.text,
      textAlign: "center"
    },
    meScreenSectionLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.colors.textSoft,
      marginBottom: 8,
      marginLeft: 6,
      letterSpacing: 0.3
    },
    meScreenSection: {
      overflow: "hidden",
      backgroundColor: theme.colors.surfaceStrong,
      borderRadius: 24,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    meScreenMenuItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 13,
      paddingHorizontal: 16
    },
    meScreenMenuLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      minWidth: 0,
      paddingRight: 10
    },
    meScreenMenuIconWrapper: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12
    },
    meScreenMenuIconChip: {
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    meScreenMenuTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.colors.text
    },
    meScreenMenuValueWrap: {
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 1,
      minWidth: 0
    },
    meScreenMenuValue: {
      maxWidth: 180,
      fontSize: 13,
      color: theme.colors.textMuted,
      marginRight: 4,
      textAlign: "right",
      flexShrink: 1
    },
    meScreenLogoutTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.colors.danger
    },
    meScreenLogoutButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
      paddingVertical: 14
    },
    meScreenLogoutIcon: {
      marginRight: 8
    },
    meScreenSeparator: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginLeft: 64
    },
    meScreenVersionText: {
      textAlign: "center",
      fontSize: 12,
      color: theme.colors.textSoft,
      marginTop: 2,
      marginBottom: 4
    },
    meScreenPageLayer: {
      ...Object.freeze({
        position: "absolute" as const,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      }),
      zIndex: 60
    },
    meScreenPageShell: {
      ...Object.freeze({
        position: "absolute" as const,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      }),
      zIndex: 2,
      elevation: 16
    },
    meScreenPage: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    meScreenPageHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 4,
      paddingBottom: 10,
      minHeight: 56
    },
    meScreenPageHeaderButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center"
    },
    meScreenPageTitle: {
      flex: 1,
      textAlign: "center",
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: 0
    },
    meScreenPageHeaderAction: {
      width: 44,
      minHeight: 44,
      alignItems: "flex-end",
      justifyContent: "center"
    },
    meScreenPageHeaderSpacer: {
      width: 44,
      height: 44
    },
    bottomSheetLayer: {
      position: "absolute" as const,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      justifyContent: "flex-end" as const,
      zIndex: 80
    },
    bottomSheetBackdrop: {
      position: "absolute" as const,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: theme.colors.overlay
    },
    bottomSheetBackdropPressable: {
      flex: 1
    },
    bottomSheetContainer: {
      backgroundColor: theme.colors.surfaceStrong,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 16,
      paddingTop: 8,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: "#000",
      shadowOpacity: shadowOpacity,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: -4 },
      elevation: 18
    },
    bottomSheetGrabber: {
      alignSelf: "center" as const,
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.border,
      marginBottom: 10
    },
    bottomSheetTitle: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: "700" as const,
      letterSpacing: 0.4,
      textAlign: "center" as const,
      marginBottom: 8
    },
    bottomSheetOptionList: {
      paddingTop: 4
    },
    bottomSheetGorhomContent: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 24
    },
    bottomSheetGorhomContentFill: {
      // Used together with fixed snapPoints so the inner view fills the sheet
      // height, letting the scroll region expand instead of hugging content.
      flex: 1
    },
    bottomSheetOptionRow: {
      minHeight: 52,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingHorizontal: 4,
      gap: 12
    },
    bottomSheetOptionMain: {
      flex: 1,
      gap: 2
    },
    bottomSheetOptionIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: theme.colors.accentSoft
    },
    bottomSheetOptionLabel: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "600" as const
    },
    bottomSheetOptionDescription: {
      color: theme.colors.textSoft,
      fontSize: 12
    },
    bottomSheetSeparator: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginLeft: 4
    },
    meScreenFullSeparator: {
      height: 1,
      backgroundColor: theme.colors.border
    },
    meScreenEditorScroll: {
      flex: 1
    },
    meScreenEditorCard: {
      overflow: "hidden",
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    meScreenEditorRow: {
      minHeight: 48,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    meScreenEditorRowIcon: {
      marginRight: 12
    },
    meScreenEditorInput: {
      flex: 1,
      minHeight: 42,
      color: theme.colors.textMuted,
      fontSize: 15,
      paddingVertical: 8
    },
    meScreenReadonlyBody: {
      flex: 1,
      gap: 3
    },
    meScreenReadonlyLabel: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: "700"
    },
    meScreenReadonlyValue: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "600"
    },
    meScreenDrawerLayer: {
      ...Object.freeze({
        position: "absolute" as const,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      }),
      zIndex: 30
    },
    meScreenDrawerBackdrop: {
      ...Object.freeze({
        position: "absolute" as const,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      }),
      backgroundColor: theme.colors.overlay
    },
    meScreenDrawerPanel: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      width: "78%",
      maxWidth: 340,
      backgroundColor: theme.colors.surfaceStrong,
      borderLeftWidth: 1,
      borderLeftColor: theme.colors.border,
      paddingHorizontal: 18,
      paddingTop: 58,
      paddingBottom: 24,
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.36 : 0.16,
      shadowRadius: 24,
      shadowOffset: {
        width: -8,
        height: 0
      },
      elevation: 12
    },
    meScreenDrawerHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 18
    },
    meScreenDrawerTitle: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.5
    },
    meScreenDrawerCloseButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted
    },
    meScreenDrawerOptions: {
      gap: 10
    },
    meScreenDrawerOption: {
      minHeight: 54,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    meScreenDrawerOptionSelected: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft
    },
    meScreenDrawerOptionTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700"
    },
    contactsSearchContainer: {
      paddingHorizontal: 16,
      paddingTop: 2,
      paddingBottom: 10,
      backgroundColor: "transparent"
    },
    contactsSearchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.inputBg,
      borderRadius: 16,
      paddingHorizontal: 14,
      minHeight: 46,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    contactsSearchInput: {
      flex: 1,
      height: 42,
      color: theme.colors.text,
      fontSize: 15,
      marginLeft: 6
    },
    contactsSectionHeader: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 4,
      backgroundColor: theme.colors.background
    },
    contactsSectionHeaderText: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: "700"
    },
    contactsNewFriendsIconWrapPlain: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.success
    },

    // --- Function entry rows ---
    funcEntrySection: {
      marginHorizontal: 16,
      marginTop: 0,
      marginBottom: 8,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: "hidden"
    },
    funcEntryRow: {
      minHeight: 52,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.surface
    },
    funcEntryRowPressed: {
      backgroundColor: theme.colors.surfaceMuted
    },
    funcEntryIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center"
    },
    funcEntryBody: {
      flex: 1,
      marginLeft: 12
    },
    funcEntryLabel: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "500"
    },
    funcEntryBadge: {
      minWidth: 22,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 6,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.danger,
      marginRight: 8
    },
    funcEntryBadgeText: {
      color: theme.colors.textInverse,
      fontSize: 11,
      fontWeight: "800"
    },
    funcEntryDivider: {
      marginLeft: 62,
      height: 0.5,
      backgroundColor: theme.colors.border
    },
    funcEntryArrowColor: {
      color: theme.colors.textMuted
    },

    // --- Swipeable actions ---
    swipeActionWrap: {
      width: 80,
      alignSelf: "stretch",
      flexDirection: "row",
      alignItems: "stretch"
    },
    swipeRemarkButton: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent
    },
    swipeRemarkText: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "600"
    },
    swipeUnblockButton: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.success
    },
    swipeUnblockText: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "600"
    },

    // --- Account security blocked users screen ---
    accountSecurityBlockedContent: {
      paddingHorizontal: 0,
      gap: 0
    },
    contactsTopSearchBar: {
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 4,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.surfaceStrong,
      borderRadius: 18,
      paddingHorizontal: 14,
      minHeight: 44,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    contactsTopSearchInput: {
      flex: 1,
      paddingVertical: 0,
      paddingHorizontal: 0,
      marginLeft: 8,
      color: theme.colors.text,
      fontSize: 15,
      lineHeight: 20,
      includeFontPadding: false,
      textAlignVertical: "center"
    },
    storageUsageHero: {
      backgroundColor: theme.colors.surfaceStrong,
      borderRadius: 22,
      paddingVertical: 20,
      paddingHorizontal: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 6
    },
    storageUsageHeroLabel: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.4,
      textTransform: "uppercase"
    },
    storageUsageHeroTotal: {
      color: theme.colors.text,
      fontSize: 32,
      fontWeight: "700",
      letterSpacing: 0
    },
    storageUsageHeroSub: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18
    },
    storageUsageBarTrack: {
      marginTop: 14,
      height: 12,
      borderRadius: 6,
      overflow: "hidden",
      backgroundColor: theme.colors.surfaceMuted,
      flexDirection: "row"
    },
    storageUsageBarSegment: {
      height: "100%"
    },
    storageUsageBarEmpty: {
      flex: 1,
      backgroundColor: theme.colors.surfaceMuted
    },
    storageLegendDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginLeft: 11,
      marginRight: 11
    },
    storageUsageHint: {
      marginLeft: 4,
      color: theme.colors.textSoft,
      fontSize: 12,
      lineHeight: 16
    }
  } as const;
}

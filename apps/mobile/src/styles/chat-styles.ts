import { StyleSheet } from "react-native";
import type { AppTheme } from "./theme";

export function chatStyles(theme: AppTheme) {
  const ownMuted = propsColor(theme, "ownMuted");
  const otherMuted = propsColor(theme, "otherMuted");

  return {
    chatShell: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingTop: 2
    },
    chatHeader: {
      marginHorizontal: 16,
      marginBottom: 2,
      paddingHorizontal: 4,
      paddingVertical: 2,
      flexDirection: "row",
      alignItems: "center",
      gap: 12
    },
    chatHeaderLead: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent"
    },
    backButtonText: {
      fontSize: 24,
      lineHeight: 24
    },
    chatHeaderAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center"
    },
    chatHeaderAvatarWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: "hidden"
    },
    chatHeaderAvatarStatic: {
      opacity: 1
    },
    chatHeaderAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 15,
      fontWeight: "800"
    },
    chatHeaderTextWrap: {
      flex: 1,
      gap: 0,
      paddingTop: 1,
      paddingBottom: 1
    },
    chatHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    chatHeaderActionButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent"
    },
    chatTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800",
      letterSpacing: -0.4
    },
    chatLiveStatus: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6
    },
    chatLiveStatusText: {
      color: theme.colors.textSoft,
      fontSize: 11,
      fontWeight: "600"
    },
    chatLiveStatusTextOnline: {
      color: theme.colors.success
    },
    chatPresenceDot: {
      width: 7,
      height: 7,
      borderRadius: 999
    },
    chatPresenceDotOnline: {
      backgroundColor: theme.colors.success
    },
    chatPresenceDotOffline: {
      backgroundColor: theme.colors.textSoft
    },
    chatTypingWrap: {
      paddingTop: 1
    },
    searchPanel: {
      marginHorizontal: 14,
      marginBottom: 10,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 12,
      gap: 10,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.glass
    },
    searchInput: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.text,
      fontSize: 15,
      paddingHorizontal: 14,
      paddingVertical: 12
    },
    searchFilterRow: {
      gap: 8,
      paddingBottom: 4
    },
    searchResultsList: {
      gap: 8,
      paddingBottom: 4
    },
    searchResultCard: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 18,
      padding: 12,
      gap: 4,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    searchResultCardActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft
    },
    searchResultTitle: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700"
    },
    searchResultMeta: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: "500"
    },
    searchResultBody: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18
    },
    searchHint: {
      color: theme.colors.textSoft,
      fontSize: 13,
      lineHeight: 18,
      paddingBottom: 6
    },
    actionTray: {
      marginHorizontal: 14,
      marginBottom: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.glass
    },
    forwardPanel: {
      marginHorizontal: 14,
      marginBottom: 10,
      maxHeight: 300,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 10,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.glassStrong
    },
    forwardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center"
    },
    forwardTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "800"
    },
    forwardList: {
      flexGrow: 0
    },
    chatMessages: {
      flex: 1,
      overflow: "hidden",
      backgroundColor: theme.mode === "dark" ? "#0B141A" : "#E5DDD5"
    },
    chatMessagesInner: {
      flex: 1
    },
    chatMessagesBackground: {
      flex: 1
    },
    chatMessagesBackgroundImage: {
      opacity: 1
    },
    chatMessagesScroll: {
      flex: 1
    },
    chatMessagesContent: {
      paddingHorizontal: 14,
      paddingTop: 10
    },
    loadingHistoryHint: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 10
    },
    loadingHistoryHintText: {
      fontSize: 12,
      color: theme.colors.textSoft
    },
    noMoreHistoryHint: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12
    },
    noMoreHistoryHintText: {
      fontSize: 12,
      color: theme.colors.textSoft
    },
    chatTimelineBadge: {
      alignSelf: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    chatTimelineBadgeText: {
      color: theme.colors.textSoft,
      fontSize: 13,
      fontWeight: "600"
    },
    messageRow: {
      width: "100%"
    },
    messageRowOwn: {
      alignItems: "flex-end"
    },
    messageRowOther: {
      alignItems: "flex-start"
    },
    messageAvatarRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8
    },
    messageMiniAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2
    },
    messageMiniAvatarText: {
      color: theme.colors.textInverse,
      fontSize: 13,
      fontWeight: "800"
    },
    messageStack: {
      maxWidth: "78%",
      gap: 3
    },
    bubbleBase: {
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
      gap: 3,
      borderWidth: 0
    },
    bubbleMedia: {
      backgroundColor: "transparent",
      paddingHorizontal: 0,
      paddingVertical: 0,
      borderWidth: 0,
      borderColor: "transparent",
      shadowOpacity: 0,
      elevation: 0
    },
    bubbleOwn: {
      alignSelf: "flex-end",
      backgroundColor: theme.colors.bubbleOwn,
      borderColor: "transparent",
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.12 : 0.06,
      shadowRadius: 8,
      shadowOffset: {
        width: 0,
        height: 2
      },
      elevation: 2
    },
    bubbleOther: {
      backgroundColor: theme.colors.bubbleOther,
      borderColor: "transparent",
      shadowColor: theme.colors.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.1 : 0.05,
      shadowRadius: 6,
      shadowOffset: {
        width: 0,
        height: 2
      },
      elevation: 1
    },
    bubbleSelected: {
      borderColor: "#d6b36d"
    },
    // 引用/搜索跳转命中的原始气泡闪烁蒙层：绝对定位覆盖气泡胶囊，
    // 透明度由 MessageBubble 的 reanimated 动画驱动（闪烁 3 次后归零）。
    bubbleHighlightFlash: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 8,
      zIndex: 10,
      backgroundColor: theme.colors.highlightMessage
    },
    bubbleSearchMatch: {
      backgroundColor: theme.colors.accentSoft
    },
    bubbleSearchMatchCurrent: {
      backgroundColor: theme.colors.accentMuted
    },
    searchHighlightText: {
      backgroundColor: theme.colors.searchHighlight,
      color: theme.colors.searchHighlightText
    },
    messageSender: {
      color: otherMuted,
      fontSize: 12,
      fontWeight: "700",
      marginLeft: 4,
      marginBottom: 2
    },
    forwardedText: {
      color: ownMuted,
      fontSize: 12,
      fontWeight: "700"
    },
    replyBlock: {
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.bubbleOwnOverlay,
      backgroundColor: theme.colors.bubbleOwnOverlay,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
      gap: 2
    },
    replyAuthor: {
      color: theme.colors.bubbleOwnText,
      fontSize: 12,
      fontWeight: "700"
    },
    replyText: {
      color: theme.colors.bubbleOwnTextSoft,
      fontSize: 12,
      lineHeight: 16
    },
    imageCard: {
      gap: 0
    },
    inlineImage: {
      // 宽高由 ImageBubbleContent 通过 inline style 注入（基于
      // content.width/height 经 computeImageBubbleSize 计算的真实显示尺寸）；
      // 缺失时 fallback 到 4:3 占位。此处仅提供圆角等通用样式。
      // 默认背景色确保图片加载前不暴露聊天背景图。
      borderRadius: 8,
      overflow: "hidden",
      backgroundColor: theme.mode === "dark" ? "#1c1c1e" : "#e8e8e8"
    },
    mediaFallbackBox: {
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor:
        theme.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      borderWidth: 1,
      borderColor: theme.colors.border
    },
    mediaFallbackText: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: "700"
    },
    fileCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minWidth: 200,
      maxWidth: 260
    },
    fileBubbleWrap: {
      // 包裹文件卡片，作为右下角时间/已读勾（bubbleMetaRow 绝对定位）的定位容器
      position: "relative",
      alignSelf: "flex-start"
    },
    fileIconBox: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center"
    },
    fileIconBoxOwn: {
      backgroundColor: theme.colors.bubbleOwnOverlay
    },
    fileIconBoxOther: {
      backgroundColor: theme.colors.accentSoft
    },
    fileInfoWrap: {
      flex: 1,
      gap: 2
    },
    fileName: {
      fontSize: 14,
      fontWeight: "600",
      lineHeight: 18
    },
    fileMeta: {
      fontSize: 12,
      lineHeight: 16
    },
    videoCard: {
      gap: 0
    },
    videoPreviewBox: {
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        theme.mode === "dark" ? "rgba(255,255,255,0.12)" : "#2c3e50",
      overflow: "hidden"
    },
    videoPreviewVideo: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0
    },
    voiceCard: {
      paddingVertical: 2,
      minWidth: 136
    },
    voiceMessageCard: {
      paddingVertical: 0,
      paddingRight: 34,
      gap: 0
    },
    voiceMessageCardWithReceipt: {
      // 34 + 14(已读勾) + 2(gap)：有已读勾时把预留加宽，
      // 秒数与右下角时间的间距和无勾时保持一致。
      paddingRight: 50
    },
    voiceCardRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    voicePlayButton: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center"
    },
    voicePlayButtonOwn: {
      backgroundColor: theme.colors.bubbleOwnOverlay
    },
    voicePlayButtonOther: {
      backgroundColor: theme.colors.accentSoft
    },
    voiceWaveRow: {
      flexDirection: "row",
      alignItems: "center",
      // 用 space-between 均匀铺满整行：间距统一、位置确定，避免固定 gap
      // 逐根累积小数偏移导致的子像素渲染差异；也能容纳更多柱子而不溢出。
      justifyContent: "space-between",
      flex: 1,
      height: 18,
      paddingRight: 6
    },
    voiceWaveBar: {
      width: 1.5,
      borderRadius: 999,
      minHeight: 3
    },
    voiceWaveBarOwn: {
      backgroundColor: theme.colors.bubbleOwnTextSoft
    },
    voiceWaveBarOther: {
      backgroundColor:
        theme.mode === "dark" ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.15)"
    },
    voiceWaveBarOwnActive: {
      backgroundColor: theme.colors.bubbleOwnText
    },
    voiceWaveBarOtherActive: {
      backgroundColor: theme.colors.accent
    },
    voiceMessageDuration: {
      fontSize: 13,
      fontWeight: "700",
      minWidth: 22,
      textAlign: "left"
    },
    voiceActionPill: {
      minWidth: 52,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      alignItems: "center",
      backgroundColor: theme.colors.bubbleOwnOverlay
    },
    voiceActionPillActive: {
      backgroundColor: theme.mode === "dark" ? "#f7f5ef" : "#dce9ec"
    },
    voiceActionText: {
      color:
        theme.mode === "dark" ? theme.colors.textInverse : theme.colors.text,
      fontSize: 12,
      fontWeight: "800"
    },
    voiceActionTextActive: {
      color: theme.colors.text
    },
    fileKind: {
      color: ownMuted,
      fontSize: 11,
      fontWeight: "800"
    },
    fileCaption: {
      color: ownMuted,
      fontSize: 12
    },
    bubbleTextBase: {
      fontSize: 15,
      lineHeight: 21
    },
    bubbleTextWrap: {
      position: "relative",
      alignSelf: "flex-start"
    },
    bubbleTextMetaSpacer: {
      width: 40,
      height: 1
    },
    bubbleTextMetaSpacerWithReceipt: {
      // 48 + 14(已读勾) + 2(gap)：有已读勾时把气泡撑长，保持
      // 文字与时间簇的间距和无勾时一致，避免挨在一起。
      width: 56,
      height: 1
    },
    bubbleTextOwn: {
      color: theme.colors.bubbleOwnText
    },
    bubbleTextOther: {
      color: theme.colors.text
    },
    messageBadgeError: {
      backgroundColor: theme.colors.dangerSoft,
      color: theme.colors.danger,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      fontSize: 11,
      fontWeight: "700"
    },
    bubbleMetaInlineRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 6,
      alignSelf: "flex-end",
      marginTop: 2
    },
    bubbleMetaInlineRowOther: {
      justifyContent: "flex-start"
    },
    bubbleMetaInlineRowCompact: {
      // 与普通文字消息气泡的右下角时间/已读勾间距保持一致：
      // 已读勾与时间间距、时间与气泡右侧/底部距离均复用文字气泡的
      // bubbleMetaRow（right: -4 / bottom: -1 / gap: 2）几何。
      marginTop: 0,
      gap: 2,
      marginRight: -4,
      marginBottom: -1
    },
    bubbleMetaInlineBase: {
      fontSize: 10,
      lineHeight: 11,
      fontWeight: "600"
    },
    bubbleMetaOverlay: {
      fontSize: 10,
      lineHeight: 11,
      fontWeight: "600"
    },
    bubbleMetaRow: {
      position: "absolute",
      right: -4,
      bottom: -1,
      flexDirection: "row",
      alignItems: "center",
      gap: 2
    },
    bubbleMetaInlineOwn: {
      color: theme.colors.bubbleOwnTextSoft
    },
    bubbleMetaInlineOther: {
      color: theme.colors.textSoft
    },
    // 置顶消息：悬浮于气泡角落的图钉角标（own 左上 / other 右上）
    bubblePinnedWrap: {
      position: "relative"
    },
    bubblePinnedBadge: {
      position: "absolute",
      top: -7,
      width: 18,
      height: 18,
      alignItems: "center",
      justifyContent: "center"
    },
    bubblePinnedBadgeOwn: {
      left: -7
    },
    bubblePinnedBadgeOther: {
      right: -7
    },
    mediaMetaOverlay: {
      position: "absolute",
      right: 4,
      bottom: 3,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3
    },
    mediaMetaText: {
      color: "rgba(255,255,255,0.92)",
      fontSize: 10,
      lineHeight: 13,
      fontWeight: "600"
    },
    mediaMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2
    },
    bubbleMetaBase: {
      fontSize: 10,
      lineHeight: 11,
      fontWeight: "600"
    },
    bubbleMetaOwn: {
      color: ownMuted
    },
    bubbleMetaOther: {
      color: theme.colors.textSoft
    },
    bubbleReceiptRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: 2,
      minHeight: 16
    },
    readReceiptWrap: {
      minWidth: 14,
      height: 14,
      alignItems: "center",
      justifyContent: "center"
    },
    systemMessageWrap: {
      alignSelf: "center",
      maxWidth: "82%",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted
    },
    systemMessageText: {
      color: theme.colors.textSoft,
      fontSize: 12,
      lineHeight: 16
    },
    systemMessageTextDanger: {
      color: theme.colors.danger
    },
    replyPreview: {
      marginHorizontal: 8,
      marginBottom: 0,
      padding: 12,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      backgroundColor: theme.colors.composerPillBg,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 0
    },

    replyPreviewBody: {
      flex: 1,
      gap: 4
    },
    replyPreviewLabel: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: "700"
    },
    replyPreviewText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18
    },
    composerRow: {
      flexDirection: "row" as const,
      alignItems: "flex-end" as const,
      paddingHorizontal: 8,
      paddingTop: 6,
      gap: 8
    },
    composerVoiceTarget: {
      width: 34,
      height: 42,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      position: "relative" as const
    },
    composerVoiceMic: {
      position: "absolute" as const,
      zIndex: 2,
      alignItems: "center" as const,
      justifyContent: "center" as const
    },
    composerTrashTarget: {
      width: 34,
      height: 42,
      alignItems: "center" as const,
      justifyContent: "center" as const
    },
    composerTrashLid: {
      position: "absolute" as const,
      top: 1,
      right: 3,
      transformOrigin: "left center"
    },
    composerPill: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      minHeight: 42,
      maxHeight: 132,
      paddingHorizontal: 6,
      borderRadius: 24,
      backgroundColor: theme.colors.composerPillBg,
      shadowColor: "#000000",
      shadowOpacity: theme.mode === "dark" ? 0 : 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 1 },
      elevation: theme.mode === "dark" ? 0 : 1
    },
    pillIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center" as const,
      justifyContent: "center" as const
    },
    pillInput: {
      flex: 1,
      fontSize: 16,
      lineHeight: 22,
      paddingTop: 9,
      paddingBottom: 9,
      paddingHorizontal: 4,
      color: theme.colors.text,
      backgroundColor: "transparent"
    },
    primaryCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: theme.colors.accent,
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.28,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4
    },
    primaryCircleDisabled: {
      opacity: 0.55
    },
    primaryCircleRecording: {
      backgroundColor: theme.colors.composerPillBg,
      shadowColor: theme.colors.danger,
      borderWidth: 1,
      borderColor: theme.colors.danger
    },
    composerMutedBanner: {
      backgroundColor: theme.colors.dangerSoft,
      paddingVertical: 6,
      paddingHorizontal: 12,
      marginHorizontal: 8,
      marginTop: 6,
      borderRadius: 8
    },
    composerMutedBannerText: {
      color: theme.colors.danger,
      fontSize: 12,
      textAlign: "center"
    },
    announcementBanner: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginHorizontal: 8,
      marginTop: 4,
      marginBottom: 2,
      borderRadius: 10,
      gap: 8
    },
    announcementBannerPressed: {
      opacity: 0.7
    },
    announcementBannerIcon: {
      fontSize: 14
    },
    announcementBannerText: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 13,
      lineHeight: 18
    },
    announcementBannerDismiss: {
      padding: 4,
      borderRadius: 12
    },
    voicePillPressingRow: {
      flexDirection: "row",
      flex: 1,
      alignItems: "center",
      height: 42,
      gap: 6
    },
    voicePillPressingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.success
    },
    voicePillPressingText: {
      color: theme.colors.success,
      fontSize: 13,
      fontWeight: "500"
    },
    voicePillRecordingRow: {
      flexDirection: "row",
      flex: 1,
      alignItems: "center",
      justifyContent: "space-between" as const,
      paddingHorizontal: 10,
      height: 42
    },
    voicePillBarsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      marginLeft: 8
    },
    voicePillBar: {
      width: 3,
      borderRadius: 1.5,
      backgroundColor: theme.colors.danger
    },
    voicePillSwipeHint: {
      color: theme.colors.danger,
      fontSize: 12,
      fontWeight: "500",
      flexShrink: 0
    },
    voicePillHintGroup: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 3,
      flexShrink: 0
    },
    voicePillDuration: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "600"
    },
    attachSheetBackdrop: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.45)"
    },
    attachSheetContainer: {
      position: "absolute" as const,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 24
    },
    attachSheetHandle: {
      alignSelf: "center" as const,
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.border,
      marginBottom: 12
    },
    attachSheetGrid: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      justifyContent: "space-between" as const
    },
    attachSheetItem: {
      width: "30%" as const,
      alignItems: "center" as const,
      paddingVertical: 12,
      gap: 8
    },
    attachSheetItemDisabled: {
      opacity: 0.4
    },
    attachSheetItemIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: theme.colors.accentSoft
    },
    attachSheetItemLabel: {
      fontSize: 12,
      color: theme.colors.text,
      fontWeight: "600" as const
    },
    mentionBackdrop: {
      position: "absolute" as const,
      left: 0,
      right: 0,
      bottom: "100%" as const,
      height: 1200,
      zIndex: 19
    },
    mentionPanel: {
      position: "absolute" as const,
      left: 8,
      right: 8,
      bottom: "100%" as const,
      zIndex: 20,
      marginBottom: 6,
      padding: 6,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: "#000000",
      shadowOpacity: theme.mode === "dark" ? 0.22 : 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4
    },
    mentionOption: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border
    },
    mentionOptionLast: {
      borderBottomWidth: 0
    },
    mentionAvatar: {
      width: 32,
      height: 32,
      borderRadius: 12,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: theme.colors.accentSoft
    },
    mentionAvatarText: {
      color: theme.colors.accentStrong,
      fontSize: 14,
      fontWeight: "900" as const
    },
    mentionOptionBody: {
      flex: 1
    },
    mentionOptionTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "800" as const
    },
    pinnedBanner: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginHorizontal: 8,
      marginTop: 4,
      marginBottom: 2,
      borderRadius: 10,
      gap: 8
    },
    pinnedBannerPressed: {
      opacity: 0.7
    },
    pinnedBannerIcon: {
      width: 16
    },
    pinnedBannerText: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 13,
      lineHeight: 18
    },
    pinnedBannerCount: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentSoft
    },
    pinnedBannerCountText: {
      color: theme.colors.accentStrong,
      fontSize: 12,
      fontWeight: "700"
    },
    pinnedSheetRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 18,
      padding: 12,
      paddingRight: 8,
      gap: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 8
    },
    pinnedSheetRowPressed: {
      opacity: 0.7
    },
    pinnedSheetUnpin: {
      padding: 6,
      borderRadius: 16
    },
    pinnedSheetEmpty: {
      color: theme.colors.textSoft,
      fontSize: 13,
      textAlign: "center",
      paddingVertical: 24
    }
  } as const;
}

function propsColor(theme: AppTheme, tone: "ownMuted" | "otherMuted") {
  if (tone === "ownMuted") {
    return theme.colors.bubbleOwnTextSoft;
  }
  return theme.mode === "dark" ? "#c7c1b6" : "#67727d";
}

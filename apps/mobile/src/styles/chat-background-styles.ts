import { CHAT_BACKGROUND_DARK_OVERLAY } from "./chat-backgrounds";
import type { AppTheme } from "./theme";

export function chatBackgroundStyles(theme: AppTheme) {
  return {
    chatBackgroundScroll: {
      flex: 1
    },
    chatBackgroundContent: {
      paddingHorizontal: 16,
      paddingBottom: 24
    },
    chatBackgroundSectionLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.colors.textSoft,
      marginBottom: 8,
      marginLeft: 6,
      letterSpacing: 0.3
    },
    chatBackgroundPreviewCard: {
      height: 240,
      borderRadius: 20,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 20
    },
    chatBackgroundPreviewInner: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 18,
      justifyContent: "space-between"
    },
    chatBackgroundDarkOverlay: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: CHAT_BACKGROUND_DARK_OVERLAY
    },
    chatBackgroundPreviewBubbleRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8
    },
    chatBackgroundPreviewBubbleOwn: {
      alignSelf: "flex-end"
    },
    chatBackgroundPreviewBubble: {
      maxWidth: "74%",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14
    },
    chatBackgroundPreviewBubbleText: {
      fontSize: 14,
      lineHeight: 19,
      color: "#111b21"
    },
    chatBackgroundPreviewBubbleTextDark: {
      color: "#e9edef"
    },
    chatBackgroundGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 8
    },
    chatBackgroundTile: {
      width: "31%",
      aspectRatio: 0.66,
      borderRadius: 14,
      overflow: "hidden",
      borderWidth: 2,
      borderColor: "transparent"
    },
    chatBackgroundTileSelected: {
      borderColor: theme.colors.accent
    },
    chatBackgroundTileImage: {
      flex: 1
    },
    chatBackgroundTileCheck: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent
    },
    chatBackgroundTileLabel: {
      marginTop: 6,
      fontSize: 12,
      color: theme.colors.textMuted,
      textAlign: "center"
    },
    chatBackgroundTileLabelSelected: {
      color: theme.colors.accent,
      fontWeight: "700"
    }
  } as const;
}

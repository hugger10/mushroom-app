export type AppThemeMode = "light" | "dark";

export type AppTheme = {
  mode: AppThemeMode;
  colors: {
    background: string;
    backgroundAlt: string;
    surface: string;
    surfaceStrong: string;
    surfaceMuted: string;
    glass: string;
    glassStrong: string;
    text: string;
    textMuted: string;
    textSoft: string;
    textInverse: string;
    accent: string;
    accentStrong: string;
    accentSoft: string;
    accentMuted: string;
    presenceRecent: string;
    success: string;
    successSoft: string;
    danger: string;
    dangerSoft: string;
    border: string;
    borderStrong: string;
    divider: string;
    shadow: string;
    overlay: string;
    inputBg: string;
    inputBorder: string;
    inputPlaceholder: string;
    skeleton: string;
    skeletonStrong: string;
    bubbleOwn: string;
    bubbleOther: string;
    bubbleOwnMuted: string;
    bubbleOtherMuted: string;
    bubbleOwnText: string;
    bubbleOwnTextSoft: string;
    bubbleOwnOverlay: string;
    composerPillBg: string;
    composerIconMuted: string;
    composerSurface: string;
    searchHighlight: string;
    searchHighlightText: string;
    /** 引用/搜索跳转后原始气泡的橙色闪烁高亮蒙层。 */
    highlightMessage: string;
  };
  avatarPalette: string[];
};

const lightTheme: AppTheme = {
  mode: "light",
  colors: {
    background: "#FFFFFF",
    backgroundAlt: "#F0F2F5",
    surface: "#FFFFFF",
    surfaceStrong: "#FFFFFF",
    surfaceMuted: "#F0F2F5",
    glass: "rgba(255, 255, 255, 0.8)",
    glassStrong: "rgba(255, 255, 255, 0.95)",
    text: "#111b21",
    textMuted: "#667781",
    textSoft: "#8696a0",
    textInverse: "#FFFFFF",
    accent: "#00a884",
    accentStrong: "#008069",
    accentSoft: "rgba(0, 168, 132, 0.1)",
    accentMuted: "rgba(0, 168, 132, 0.2)",
    presenceRecent: "#9ea3a8",
    success: "#12b76a",
    successSoft: "rgba(18, 183, 106, 0.15)",
    danger: "#EF4444",
    dangerSoft: "rgba(239, 68, 68, 0.15)",
    border: "rgba(148, 163, 184, 0.22)",
    borderStrong: "rgba(100, 116, 139, 0.2)",
    divider: "rgba(148, 163, 184, 0.35)",
    shadow: "rgba(0, 0, 0, 0.05)",
    overlay: "rgba(0, 0, 0, 0.4)",
    inputBg: "#F0F2F5",
    inputBorder: "transparent",
    inputPlaceholder: "#8696a0",
    skeleton: "#F0F2F5",
    skeletonStrong: "#E5E7EB",
    bubbleOwn: "#d9fdd3",
    bubbleOther: "#FFFFFF",
    bubbleOwnMuted: "#c8e6c1",
    bubbleOtherMuted: "#F0F2F5",
    bubbleOwnText: "#111b21",
    bubbleOwnTextSoft: "#667781",
    bubbleOwnOverlay: "rgba(0, 0, 0, 0.06)",
    composerPillBg: "#FFFFFF",
    composerIconMuted: "#54656F",
    composerSurface: "#F0F2F5",
    searchHighlight: "#FFF59D",
    searchHighlightText: "#111b21",
    highlightMessage: "rgba(255, 149, 0, 0.38)"
  },
  avatarPalette: ["#FF3B30", "#FF9500", "#34C759", "#32ADE6", "#5856D6"]
};

const darkTheme: AppTheme = {
  mode: "dark",
  colors: {
    background: "#111b21",
    backgroundAlt: "#1a2228",
    surface: "#1e2c33",
    surfaceStrong: "#202c33",
    surfaceMuted: "#2a3942",
    glass: "rgba(30, 44, 51, 0.75)",
    glassStrong: "rgba(30, 44, 51, 0.9)",
    text: "#e9edef",
    textMuted: "#8696a0",
    textSoft: "#667781",
    textInverse: "#FFFFFF",
    accent: "#00a884",
    accentStrong: "#06cf9c",
    accentSoft: "rgba(0, 168, 132, 0.16)",
    accentMuted: "rgba(0, 168, 132, 0.25)",
    presenceRecent: "#7c858c",
    success: "#22C55E",
    successSoft: "rgba(34, 197, 94, 0.2)",
    danger: "#EF4444",
    dangerSoft: "rgba(239, 68, 68, 0.2)",
    border: "rgba(255, 255, 255, 0.08)",
    borderStrong: "rgba(255, 255, 255, 0.15)",
    divider: "rgba(255, 255, 255, 0.12)",
    shadow: "rgba(0, 0, 0, 0.4)",
    overlay: "rgba(0, 0, 0, 0.7)",
    inputBg: "#2a3942",
    inputBorder: "transparent",
    inputPlaceholder: "#667781",
    skeleton: "#202c33",
    skeletonStrong: "#2a3942",
    bubbleOwn: "#005c4b",
    bubbleOther: "#202c33",
    bubbleOwnMuted: "#025144",
    bubbleOtherMuted: "#2a3942",
    bubbleOwnText: "#e9edef",
    bubbleOwnTextSoft: "#8696a0",
    bubbleOwnOverlay: "rgba(255, 255, 255, 0.15)",
    composerPillBg: "#1F2C34",
    composerIconMuted: "#8696A0",
    composerSurface: "#0B141A",
    searchHighlight: "#B7791F",
    searchHighlightText: "#FFFFFF",
    highlightMessage: "rgba(255, 159, 10, 0.5)"
  },
  avatarPalette: ["#FF453A", "#FF9F0A", "#32D74B", "#64D2FF", "#5E5CE6"]
};

export function getTheme(mode: AppThemeMode) {
  return mode === "dark" ? darkTheme : lightTheme;
}

export function colorFromSeed(seed: string, palette: string[]) {
  const value = seed
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[value % palette.length];
}

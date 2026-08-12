export const MUSHROOM_THEME_MODES = ["light", "dark"] as const;

export type MushroomThemeMode = (typeof MUSHROOM_THEME_MODES)[number];

export const MUSHROOM_THEME_PREFERENCES = [
  "system",
  ...MUSHROOM_THEME_MODES
] as const;

export type MushroomThemePreference =
  (typeof MUSHROOM_THEME_PREFERENCES)[number];

export const MUSHROOM_DEFAULT_THEME_MODE = "light" as const;

export function normalizeMushroomThemeMode(
  value?: string | null
): MushroomThemeMode | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized === "dark") {
    return "dark";
  }
  if (normalized === "light") {
    return "light";
  }

  return null;
}

export function normalizeMushroomThemePreference(
  value?: string | null
): MushroomThemePreference | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized === "system") {
    return "system";
  }

  return normalizeMushroomThemeMode(normalized);
}

export function resolveMushroomTheme(params: {
  preferredTheme?: string | null;
  systemTheme?: string | null;
  defaultTheme?: MushroomThemeMode;
}) {
  const preferredTheme = normalizeMushroomThemePreference(
    params.preferredTheme
  );

  if (preferredTheme === "light" || preferredTheme === "dark") {
    return preferredTheme;
  }

  const systemTheme = normalizeMushroomThemeMode(params.systemTheme);
  if (systemTheme) {
    return systemTheme;
  }

  return params.defaultTheme ?? MUSHROOM_DEFAULT_THEME_MODE;
}

export function getNextMushroomThemePreference(
  currentTheme?: string | null
): MushroomThemePreference {
  switch (normalizeMushroomThemePreference(currentTheme)) {
    case "light":
      return "dark";
    case "dark":
      return "system";
    default:
      return "light";
  }
}

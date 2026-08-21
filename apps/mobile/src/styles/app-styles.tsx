import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { StyleSheet, useColorScheme } from "react-native";
import {
  MUSHROOM_DEFAULT_THEME_MODE,
  getNextMushroomThemePreference,
  normalizeMushroomThemeMode,
  normalizeMushroomThemePreference,
  resolveMushroomTheme,
  type MushroomThemeMode,
  type MushroomThemePreference
} from "@mushroom/shared";
import { baseStyles } from "./base-styles";
import { chatStyles } from "./chat-styles";
import { deviceStorage } from "../data/storage";
import { listAccountStyles } from "./list-account-styles";
import { overlayStyles } from "./overlay-styles";
import { getTheme } from "./theme";
import { chatBackgroundStyles } from "./chat-background-styles";

const lightTheme = getTheme("light");
const darkTheme = getTheme("dark");

const lightStyles = StyleSheet.create({
  ...baseStyles(lightTheme),
  ...listAccountStyles(lightTheme),
  ...chatStyles(lightTheme),
  ...overlayStyles(lightTheme),
  ...chatBackgroundStyles(lightTheme)
});

const darkStyles = StyleSheet.create({
  ...baseStyles(darkTheme),
  ...listAccountStyles(darkTheme),
  ...chatStyles(darkTheme),
  ...overlayStyles(darkTheme),
  ...chatBackgroundStyles(darkTheme)
});

const THEME_STORAGE_KEY = "mushroom.mobile.theme";

type AppThemeContextValue = {
  theme: typeof lightTheme;
  styles: typeof lightStyles;
  themePreference: MushroomThemePreference;
  resolvedTheme: MushroomThemeMode;
  setThemePreference: (themePreference: MushroomThemePreference) => void;
  cycleThemePreference: () => void;
};

const fallbackThemeContext: AppThemeContextValue = {
  theme: lightTheme,
  styles: lightStyles,
  themePreference: "system",
  resolvedTheme: "light",
  setThemePreference: () => undefined,
  cycleThemePreference: () => undefined
};

const AppThemeContext =
  createContext<AppThemeContextValue>(fallbackThemeContext);

function getStoredThemePreference(): MushroomThemePreference {
  return (
    normalizeMushroomThemePreference(
      deviceStorage.getString(THEME_STORAGE_KEY)
    ) ?? "system"
  );
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  const colorScheme = useColorScheme();
  const [themePreference, setThemePreferenceState] =
    useState<MushroomThemePreference>(getStoredThemePreference);

  const systemTheme = normalizeMushroomThemeMode(colorScheme);
  const resolvedTheme = resolveMushroomTheme({
    preferredTheme: themePreference,
    systemTheme,
    defaultTheme: MUSHROOM_DEFAULT_THEME_MODE
  });

  const setThemePreference = useCallback(
    (nextThemePreference: MushroomThemePreference) => {
      setThemePreferenceState(nextThemePreference);

      if (nextThemePreference === "system") {
        deviceStorage.remove(THEME_STORAGE_KEY);
        return;
      }

      deviceStorage.set(THEME_STORAGE_KEY, nextThemePreference);
    },
    []
  );

  const cycleThemePreference = useCallback(() => {
    setThemePreference(getNextMushroomThemePreference(themePreference));
  }, [setThemePreference, themePreference]);

  const contextValue = useMemo<AppThemeContextValue>(
    () => ({
      theme: resolvedTheme === "dark" ? darkTheme : lightTheme,
      styles: resolvedTheme === "dark" ? darkStyles : lightStyles,
      themePreference,
      resolvedTheme,
      setThemePreference,
      cycleThemePreference
    }),
    [cycleThemePreference, resolvedTheme, setThemePreference, themePreference]
  );

  return (
    <AppThemeContext.Provider value={contextValue}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(AppThemeContext);
}

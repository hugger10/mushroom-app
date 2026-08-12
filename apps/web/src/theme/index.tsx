import {
  MUSHROOM_DEFAULT_THEME_MODE,
  getNextMushroomThemePreference,
  normalizeMushroomThemeMode,
  normalizeMushroomThemePreference,
  resolveMushroomTheme,
  type MushroomThemeMode,
  type MushroomThemePreference
} from "@mushroom/shared";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { AppThemeContext, type AppThemeContextValue } from "./theme-context";

const THEME_STORAGE_KEY = "mushroom.web.theme";

function getBrowserSystemTheme(): MushroomThemeMode | null {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return null;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

async function getStoredThemePreference() {
  if (window.electronAPI?.getPreferredTheme) {
    return (
      normalizeMushroomThemePreference(
        await window.electronAPI.getPreferredTheme()
      ) ?? "system"
    );
  }

  return (
    normalizeMushroomThemePreference(
      window.localStorage.getItem(THEME_STORAGE_KEY)
    ) ?? "system"
  );
}

async function persistThemePreference(
  themePreference: MushroomThemePreference
) {
  const persistedValue = themePreference === "system" ? null : themePreference;

  if (window.electronAPI?.setPreferredTheme) {
    await window.electronAPI.setPreferredTheme(persistedValue);
    return;
  }

  if (persistedValue) {
    window.localStorage.setItem(THEME_STORAGE_KEY, persistedValue);
    return;
  }

  window.localStorage.removeItem(THEME_STORAGE_KEY);
}

function applyResolvedTheme(themeMode: MushroomThemeMode) {
  document.documentElement.dataset.theme = themeMode;
  document.documentElement.style.colorScheme = themeMode;
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  const [themePreference, setThemePreferenceState] =
    useState<MushroomThemePreference>("system");
  const [systemTheme, setSystemTheme] = useState<MushroomThemeMode | null>(() =>
    getBrowserSystemTheme()
  );

  useEffect(() => {
    let disposed = false;

    void getStoredThemePreference().then(nextThemePreference => {
      if (!disposed) {
        setThemePreferenceState(nextThemePreference);
      }
    });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (window.electronAPI?.onSystemThemeChanged) {
      void window.electronAPI.getSystemTheme().then(theme => {
        setSystemTheme(normalizeMushroomThemeMode(theme));
      });

      return window.electronAPI.onSystemThemeChanged(theme => {
        setSystemTheme(normalizeMushroomThemeMode(theme));
      });
    }

    if (typeof window.matchMedia !== "function") {
      setSystemTheme(null);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => {
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    };

    updateSystemTheme();

    mediaQuery.addEventListener("change", updateSystemTheme);
    return () => {
      mediaQuery.removeEventListener("change", updateSystemTheme);
    };
  }, []);

  const resolvedTheme = useMemo(
    () =>
      resolveMushroomTheme({
        preferredTheme: themePreference,
        systemTheme,
        defaultTheme: MUSHROOM_DEFAULT_THEME_MODE
      }),
    [systemTheme, themePreference]
  );

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setThemePreference = useCallback(
    async (nextThemePreference: MushroomThemePreference) => {
      setThemePreferenceState(nextThemePreference);
      await persistThemePreference(nextThemePreference);
    },
    []
  );

  const cycleThemePreference = useCallback(() => {
    return setThemePreference(getNextMushroomThemePreference(themePreference));
  }, [setThemePreference, themePreference]);

  const contextValue = useMemo<AppThemeContextValue>(
    () => ({
      themePreference,
      resolvedTheme,
      systemTheme,
      setThemePreference,
      cycleThemePreference
    }),
    [
      cycleThemePreference,
      resolvedTheme,
      setThemePreference,
      systemTheme,
      themePreference
    ]
  );

  return (
    <AppThemeContext.Provider value={contextValue}>
      {children}
    </AppThemeContext.Provider>
  );
}

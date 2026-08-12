import { createContext } from "react";
import type {
  MushroomThemeMode,
  MushroomThemePreference
} from "@mushroom/shared";

export type AppThemeContextValue = {
  themePreference: MushroomThemePreference;
  resolvedTheme: MushroomThemeMode;
  systemTheme: MushroomThemeMode | null;
  setThemePreference: (
    themePreference: MushroomThemePreference
  ) => Promise<void>;
  cycleThemePreference: () => Promise<void>;
};

export const AppThemeContext = createContext<AppThemeContextValue | null>(null);

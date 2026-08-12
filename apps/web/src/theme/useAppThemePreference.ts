import { useContext } from "react";
import { AppThemeContext } from "./theme-context";

export function useAppThemePreference() {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error(
      "useAppThemePreference must be used within AppThemeProvider"
    );
  }

  return context;
}

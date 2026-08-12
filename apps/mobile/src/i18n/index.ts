import {
  MUSHROOM_DEFAULT_LANGUAGE,
  MUSHROOM_LANGUAGE_LABELS,
  getNextMushroomLanguage,
  mushroomI18nResources,
  normalizeMushroomLanguage,
  resolveMushroomLanguage,
  type MushroomSupportedLanguage
} from "@mushroom/shared";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
export { i18n };
import { NativeModules, Platform } from "react-native";
import { useEffect, useState } from "react";
import { deviceStorage } from "../data/storage";

const LANGUAGE_STORAGE_KEY = "mushroom.mobile.language";

function getStoredLanguage() {
  return deviceStorage.getString(LANGUAGE_STORAGE_KEY) ?? null;
}

function getSystemLanguage() {
  const settingsManager = NativeModules.SettingsManager as
    | {
        settings?: {
          AppleLocale?: string;
          AppleLanguages?: string[];
        };
      }
    | undefined;
  const i18nManager = NativeModules.I18nManager as
    | {
        localeIdentifier?: string;
      }
    | undefined;

  if (Platform.OS === "ios") {
    return (
      settingsManager?.settings?.AppleLocale ||
      settingsManager?.settings?.AppleLanguages?.[0] ||
      null
    );
  }

  return i18nManager?.localeIdentifier ?? null;
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: mushroomI18nResources,
    lng: resolveMushroomLanguage({
      preferredLanguage: getStoredLanguage(),
      systemLanguage: getSystemLanguage()
    }),
    fallbackLng: MUSHROOM_DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false
    }
  });
}

export function getCurrentAppLanguage(): MushroomSupportedLanguage {
  return (
    normalizeMushroomLanguage(i18n.resolvedLanguage || i18n.language) ||
    MUSHROOM_DEFAULT_LANGUAGE
  );
}

export async function setAppLanguage(language: MushroomSupportedLanguage) {
  deviceStorage.set(LANGUAGE_STORAGE_KEY, language);
  await i18n.changeLanguage(language);
}

export async function toggleAppLanguage() {
  await setAppLanguage(getNextMushroomLanguage(getCurrentAppLanguage()));
}

export function useAppLanguage() {
  const [language, setLanguage] = useState<MushroomSupportedLanguage>(
    getCurrentAppLanguage()
  );

  useEffect(() => {
    const handleLanguageChanged = (value: string) => {
      setLanguage(
        normalizeMushroomLanguage(value) ?? MUSHROOM_DEFAULT_LANGUAGE
      );
    };

    i18n.on("languageChanged", handleLanguageChanged);

    return () => {
      i18n.off("languageChanged", handleLanguageChanged);
    };
  }, []);

  return {
    language,
    languageLabel: MUSHROOM_LANGUAGE_LABELS[language],
    toggleLanguage: () => toggleAppLanguage()
  };
}

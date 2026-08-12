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
export { i18n };
import { initReactI18next } from "react-i18next";
import { useEffect, useState } from "react";

const LANGUAGE_STORAGE_KEY = "mushroom.web.language";

let initPromise: Promise<typeof i18n> | null = null;

async function getStoredLanguage() {
  if (window.electronAPI?.getPreferredLanguage) {
    return window.electronAPI.getPreferredLanguage();
  }

  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
}

async function persistLanguage(language: MushroomSupportedLanguage) {
  if (window.electronAPI?.setPreferredLanguage) {
    await window.electronAPI.setPreferredLanguage(language);
    return;
  }

  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

async function getSystemLanguage() {
  if (window.electronAPI?.getSystemLanguage) {
    return window.electronAPI.getSystemLanguage();
  }

  return navigator.language || null;
}

export async function initAppI18n() {
  if (i18n.isInitialized) {
    return i18n;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const [preferredLanguage, systemLanguage] = await Promise.all([
      getStoredLanguage(),
      getSystemLanguage()
    ]);

    await i18n.use(initReactI18next).init({
      resources: mushroomI18nResources,
      lng: resolveMushroomLanguage({
        preferredLanguage,
        systemLanguage
      }),
      fallbackLng: MUSHROOM_DEFAULT_LANGUAGE,
      interpolation: {
        escapeValue: false
      }
    });

    return i18n;
  })();

  return initPromise;
}

export function getCurrentAppLanguage(): MushroomSupportedLanguage {
  return (
    normalizeMushroomLanguage(i18n.resolvedLanguage || i18n.language) ||
    MUSHROOM_DEFAULT_LANGUAGE
  );
}

export function getCurrentLanguageLabel() {
  return MUSHROOM_LANGUAGE_LABELS[getCurrentAppLanguage()];
}

export async function setAppLanguage(language: MushroomSupportedLanguage) {
  await persistLanguage(language);
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
    setLanguage: (nextLanguage: MushroomSupportedLanguage) =>
      setAppLanguage(nextLanguage),
    toggleLanguage: () => toggleAppLanguage()
  };
}

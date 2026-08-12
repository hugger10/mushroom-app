import i18n from "i18next";
import {
  MUSHROOM_DEFAULT_LANGUAGE,
  mushroomI18nResources
} from "@mushroom/shared";

if (!i18n.isInitialized) {
  void i18n.init({
    resources: mushroomI18nResources,
    lng: MUSHROOM_DEFAULT_LANGUAGE,
    fallbackLng: MUSHROOM_DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false
    }
  });
}

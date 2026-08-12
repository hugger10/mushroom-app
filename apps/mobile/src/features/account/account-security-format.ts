import type { PrivacyRule } from "@mushroom/shared";
import type { TFunction } from "i18next";

export function formatAccountSecurityTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function getDeviceTypeLabel(t: TFunction, type: number) {
  if (type === 1) {
    return t("me.security.deviceTypes.browser");
  }
  if (type === 2) {
    return t("me.security.deviceTypes.desktop");
  }
  if (type === 3) {
    return t("me.security.deviceTypes.mobile");
  }
  if (type === 4) {
    return t("me.security.deviceTypes.other");
  }
  return t("me.security.deviceTypes.unknown");
}

export function getDeviceStatusLabel(t: TFunction, status: number) {
  if (status === 1) {
    return t("me.security.deviceStatus.active");
  }
  if (status === 2) {
    return t("me.security.deviceStatus.loggedOut");
  }
  if (status === 0) {
    return t("me.security.deviceStatus.disabled");
  }
  return t("me.security.deviceStatus.unknown");
}

const ACTION_KEY_MAP: Record<string, string> = {
  login: "login",
  "login.failed": "loginFailed",
  refresh: "refresh",
  "refresh.failed": "refreshFailed",
  "token.refresh": "refresh",
  "logout.current": "logoutCurrent",
  "logout.device": "logoutDevice",
  "logout.others": "logoutOthers",
  "logout.all": "logoutAll",
  "device.disable": "deviceDisable",
  "device.restore": "deviceRestore",
  "password.change": "passwordChange"
};

export function getSecurityActionLabel(t: TFunction, action: string) {
  const key = ACTION_KEY_MAP[action];
  if (!key) {
    return action;
  }
  return t(`me.security.actions.${key}`);
}

export function getPrivacyRuleLabel(t: TFunction, rule?: PrivacyRule) {
  if (rule === 0) {
    return t("me.security.privacyPage.rules.everyone");
  }
  if (rule === 1) {
    return t("me.security.privacyPage.rules.contactsOnly");
  }
  if (rule === 2) {
    return t("me.security.privacyPage.rules.off");
  }
  return t("me.security.privacyPage.rules.unset");
}

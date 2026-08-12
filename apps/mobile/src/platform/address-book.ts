import * as Contacts from "react-native-contacts";
import type { Contact } from "react-native-contacts";

export type AddressBookPermissionState = "unknown" | "authorized" | "denied";

export interface AddressBookPhoneCandidate {
  phone_e164: string;
  local_display_name: string;
}

export interface AddressBookReadResult {
  permission: AddressBookPermissionState;
  candidates: AddressBookPhoneCandidate[];
}

export function normalizePhoneToE164(
  rawPhone: string,
  defaultCountryCode = "+86"
): string | null {
  const compact = rawPhone.trim().replace(/[\s().-]/g, "");
  if (!compact) {
    return null;
  }

  let normalized = compact;
  if (normalized.startsWith("00")) {
    normalized = `+${normalized.slice(2)}`;
  }

  if (normalized.startsWith("+")) {
    const digits = normalized.slice(1).replace(/\D/g, "");
    const e164 = `+${digits}`;
    return /^\+[1-9]\d{1,14}$/.test(e164) ? e164 : null;
  }

  const digits = normalized.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  const countryCode = defaultCountryCode.trim().replace(/[^\d+]/g, "");
  const normalizedCountryCode = countryCode.startsWith("+")
    ? countryCode
    : `+${countryCode}`;
  const e164 = `${normalizedCountryCode}${digits.replace(/^0+/, "")}`;
  return /^\+[1-9]\d{1,14}$/.test(e164) ? e164 : null;
}

export function extractAddressBookPhoneCandidates(
  contacts: Contact[],
  defaultCountryCode = "+86"
): AddressBookPhoneCandidate[] {
  const seen = new Set<string>();
  const candidates: AddressBookPhoneCandidate[] = [];

  for (const contact of contacts) {
    const localDisplayName =
      contact.displayName?.trim() ||
      [contact.givenName, contact.familyName].filter(Boolean).join(" ").trim();

    for (const phone of contact.phoneNumbers ?? []) {
      const phoneE164 = normalizePhoneToE164(phone.number, defaultCountryCode);
      if (!phoneE164 || seen.has(phoneE164)) {
        continue;
      }

      seen.add(phoneE164);
      candidates.push({
        phone_e164: phoneE164,
        local_display_name: localDisplayName || phoneE164
      });
    }
  }

  return candidates;
}

function getContactsModule() {
  const defaultExport = (Contacts as unknown as { default?: typeof Contacts })
    .default;
  const checkPermissionFn = (
    Contacts as unknown as {
      checkPermission?: () => Promise<string>;
    }
  ).checkPermission;
  const defaultCheckPermissionFn = (
    defaultExport as unknown as {
      checkPermission?: () => Promise<string>;
    }
  )?.checkPermission;
  return {
    checkPermission: checkPermissionFn ?? defaultCheckPermissionFn,
    requestPermission:
      Contacts.requestPermission ?? defaultExport?.requestPermission,
    getAllWithoutPhotos:
      Contacts.getAllWithoutPhotos ?? defaultExport?.getAllWithoutPhotos
  };
}

function normalizePermissionResult(
  raw: string | undefined | null
): AddressBookPermissionState {
  if (raw === "authorized") return "authorized";
  // "undefined"（react-native-contacts 返回的"尚未询问"字符串）/ 空值 → 视为未询问
  if (raw === "undefined" || raw == null || raw === "") return "unknown";
  // "denied" / iOS 的 "restricted"（家长控制等不可恢复状态）/ 其它未知字符串 → 一律按 denied 处理
  return "denied";
}

export async function checkAddressBookPermission(): Promise<AddressBookPermissionState> {
  const { checkPermission } = getContactsModule();
  if (typeof checkPermission !== "function") {
    return "unknown";
  }
  try {
    const result = await checkPermission();
    return normalizePermissionResult(result);
  } catch {
    return "unknown";
  }
}

export async function readAddressBookPhoneCandidates(
  defaultCountryCode = "+86"
): Promise<AddressBookReadResult> {
  const contactsModule = getContactsModule();

  if (typeof contactsModule.requestPermission !== "function") {
    return {
      permission: "unknown",
      candidates: []
    };
  }

  // 先静默检查当前权限（若可用），决定下一步：
  // - authorized：直接放行，不再触发系统弹窗。
  // - denied / restricted：用户已拒绝或受限，不再调用 requestPermission（避免在 Android 非永久拒绝时反复弹窗，符合 Telegram 风格）。
  // - unknown：尚未询问，继续走 requestPermission 触发系统弹窗。
  let currentPermission: AddressBookPermissionState = "unknown";
  if (typeof contactsModule.checkPermission === "function") {
    try {
      currentPermission = normalizePermissionResult(
        await contactsModule.checkPermission()
      );
    } catch {
      currentPermission = "unknown";
    }
  }

  let permission: AddressBookPermissionState;
  if (currentPermission === "authorized") {
    permission = "authorized";
  } else if (currentPermission === "denied") {
    permission = "denied";
  } else {
    permission = normalizePermissionResult(
      await contactsModule.requestPermission()
    );
  }

  if (permission !== "authorized") {
    return {
      permission,
      candidates: []
    };
  }

  if (typeof contactsModule.getAllWithoutPhotos !== "function") {
    return {
      permission: "authorized",
      candidates: []
    };
  }

  const contacts = await contactsModule.getAllWithoutPhotos();
  return {
    permission: "authorized",
    candidates: extractAddressBookPhoneCandidates(contacts, defaultCountryCode)
  };
}

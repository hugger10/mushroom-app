/**
 * Shared profile-field vocabulary used by both the "我的资料" overview
 * (MyProfileScreen) and its dedicated full-screen editors.
 *
 * Each field gets its own editor route, matching the interaction pattern used
 * everywhere else in the app (full-screen sub-panel + header save button).
 */
import {
  EMAIL_MAX_LENGTH,
  NICKNAME_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  SIGNATURE_MAX_LENGTH
} from "@mushroom/shared";

/** Fields edited through a plain text input (single route, field param). */
export type TextProfileField = "nickname" | "email" | "phone" | "signature";

/** Every editable profile field. */
export type ProfileField = TextProfileField | "birthday" | "gender";

export type TextFieldConfig = {
  keyboardType?: "default" | "email-address" | "phone-pad";
  maxLength?: number;
  autoCapitalize?: "sentences" | "none";
  /** Render a multi-line text area (used by signature). */
  multiline?: boolean;
};

export const TEXT_FIELD_CONFIG: Record<TextProfileField, TextFieldConfig> = {
  nickname: {
    maxLength: NICKNAME_MAX_LENGTH,
    autoCapitalize: "sentences"
  },
  email: {
    keyboardType: "email-address",
    maxLength: EMAIL_MAX_LENGTH,
    autoCapitalize: "none"
  },
  phone: {
    keyboardType: "phone-pad",
    maxLength: PHONE_MAX_LENGTH,
    autoCapitalize: "sentences"
  },
  signature: {
    maxLength: SIGNATURE_MAX_LENGTH,
    autoCapitalize: "sentences",
    multiline: true
  }
};

export const GENDER_OPTIONS: ReadonlyArray<{
  value: number;
  labelKey: string;
}> = [
  { value: 1, labelKey: "contacts.profileGenderMale" },
  { value: 2, labelKey: "contacts.profileGenderFemale" },
  { value: 0, labelKey: "me.profile.genderSecret" }
];

export function getProfileFieldLabelKey(field: ProfileField): string {
  const map: Record<ProfileField, string> = {
    nickname: "profile.basic.nickname",
    email: "me.email",
    phone: "me.phone",
    signature: "profile.basic.signature",
    birthday: "me.birthday",
    gender: "me.gender"
  };
  return map[field];
}

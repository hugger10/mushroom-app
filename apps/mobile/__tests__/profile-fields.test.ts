import {
  GENDER_OPTIONS,
  TEXT_FIELD_CONFIG,
  getProfileFieldLabelKey
} from "../src/features/account/profile-fields";

describe("profile-fields shared config", () => {
  test("text field config covers every text field", () => {
    expect(Object.keys(TEXT_FIELD_CONFIG).sort()).toEqual([
      "email",
      "nickname",
      "phone",
      "signature"
    ]);
  });

  test("label keys resolve for every profile field", () => {
    expect(getProfileFieldLabelKey("nickname")).toBe("profile.basic.nickname");
    expect(getProfileFieldLabelKey("email")).toBe("me.email");
    expect(getProfileFieldLabelKey("phone")).toBe("me.phone");
    expect(getProfileFieldLabelKey("signature")).toBe(
      "profile.basic.signature"
    );
    expect(getProfileFieldLabelKey("birthday")).toBe("me.birthday");
    expect(getProfileFieldLabelKey("gender")).toBe("me.gender");
  });

  test("gender options include male, female and secret", () => {
    expect(GENDER_OPTIONS.map(option => option.value)).toEqual([1, 2, 0]);
  });

  test("nickname and email carry the expected input constraints", () => {
    expect(TEXT_FIELD_CONFIG.nickname).toMatchObject({
      maxLength: 32,
      autoCapitalize: "sentences"
    });
    expect(TEXT_FIELD_CONFIG.email).toMatchObject({
      keyboardType: "email-address",
      autoCapitalize: "none"
    });
  });
});

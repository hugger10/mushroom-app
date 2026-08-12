import {
  extractAddressBookPhoneCandidates,
  normalizePhoneToE164
} from "../src/platform/address-book";

describe("address book phone normalization", () => {
  test("normalizes common phone formats to E.164", () => {
    expect(normalizePhoneToE164("13800138000")).toBe("+8613800138000");
    expect(normalizePhoneToE164("+86 138 0013 8000")).toBe("+8613800138000");
    expect(normalizePhoneToE164("0086-138-0013-8000")).toBe("+8613800138000");
    expect(normalizePhoneToE164("not-a-phone")).toBeNull();
  });

  test("extracts unique phone candidates without uploading local names", () => {
    const candidates = extractAddressBookPhoneCandidates([
      {
        recordID: "1",
        displayName: "张三",
        givenName: null,
        familyName: "",
        phoneNumbers: [
          { label: "mobile", number: "+86 138 0013 8000" },
          { label: "mobile", number: "13800138000" }
        ]
      } as never,
      {
        recordID: "2",
        displayName: "Alice",
        givenName: null,
        familyName: "",
        phoneNumbers: [{ label: "mobile", number: "+1 415 123 4567" }]
      } as never
    ]);

    expect(candidates).toEqual([
      {
        phone_e164: "+8613800138000",
        local_display_name: "张三"
      },
      {
        phone_e164: "+14151234567",
        local_display_name: "Alice"
      }
    ]);
  });
});

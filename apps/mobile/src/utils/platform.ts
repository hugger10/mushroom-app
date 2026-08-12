import { Platform } from "react-native";

/**
 * Detect whether the app is running on an Android emulator.
 * Looks at `Platform.constants` fields that emulators typically set
 * to values like "generic", "sdk_gphone", "emulator", etc.
 */
export function isAndroidEmulator(): boolean {
  if (Platform.OS !== "android") {
    return false;
  }

  const constants = Platform.constants as
    | {
        Brand?: string;
        Manufacturer?: string;
        Model?: string;
        Fingerprint?: string;
        Device?: string;
        Product?: string;
      }
    | undefined;

  const identity = [
    constants?.Brand,
    constants?.Manufacturer,
    constants?.Model,
    constants?.Fingerprint,
    constants?.Device,
    constants?.Product
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    identity.includes("generic") ||
    identity.includes("sdk_gphone") ||
    identity.includes("emulator") ||
    identity.includes("android sdk built for") ||
    identity.includes("simulator")
  );
}

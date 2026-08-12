import type { MobilePushProviderId } from "./types";

let activePushProvider: MobilePushProviderId | null = null;

export function getActivePushProvider(): MobilePushProviderId | null {
  return activePushProvider;
}

export function setActivePushProvider(provider: MobilePushProviderId): void {
  activePushProvider = provider;
}

export function clearActivePushProvider(): void {
  activePushProvider = null;
}

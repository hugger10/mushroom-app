import type { createMobileAppController } from "@mushroom/app-core";

type MobileAppController = ReturnType<typeof createMobileAppController>;

let controller: MobileAppController | null = null;

export function registerController(c: MobileAppController): void {
  controller = c;
}

export function getController(): MobileAppController {
  if (!controller) {
    throw new Error(
      "mobileAppController is not registered yet. Did you import services/app-runtime?"
    );
  }
  return controller;
}

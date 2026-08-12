import { createContext, useContext } from "react";

export interface AvatarLightboxContextValue {
  open: (input: { src?: string | null; name?: string | null }) => void;
  close: () => void;
}

export const AvatarLightboxContext =
  createContext<AvatarLightboxContextValue | null>(null);

export function useAvatarLightbox(): AvatarLightboxContextValue {
  const ctx = useContext(AvatarLightboxContext);
  if (!ctx) {
    // Provide a no-op fallback so call sites don't crash if mounted outside
    // the provider (e.g. unit tests or storybook).
    return {
      open: () => {
        /* noop */
      },
      close: () => {
        /* noop */
      }
    };
  }
  return ctx;
}

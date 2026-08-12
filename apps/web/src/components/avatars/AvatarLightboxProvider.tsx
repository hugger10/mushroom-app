import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AvatarLightbox } from "./AvatarLightbox";
import {
  AvatarLightboxContext,
  type AvatarLightboxContextValue
} from "./avatarLightboxContext";

interface AvatarLightboxState {
  visible: boolean;
  src?: string | null;
  name?: string | null;
}

export function AvatarLightboxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AvatarLightboxState>({ visible: false });

  const close = useCallback(() => {
    setState(prev => ({ ...prev, visible: false }));
  }, []);

  const open = useCallback(
    (input: { src?: string | null; name?: string | null }) => {
      setState({ visible: true, src: input.src, name: input.name });
    },
    []
  );

  const value = useMemo<AvatarLightboxContextValue>(
    () => ({ open, close }),
    [open, close]
  );

  return (
    <AvatarLightboxContext.Provider value={value}>
      {children}
      <AvatarLightbox
        open={state.visible}
        src={state.src ?? null}
        name={state.name ?? null}
        onClose={close}
      />
    </AvatarLightboxContext.Provider>
  );
}

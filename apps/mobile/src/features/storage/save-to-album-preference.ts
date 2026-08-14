import { useCallback, useEffect, useState } from "react";
import { deviceStorage } from "../../data/storage";

const STORAGE_KEY = "mushroom.mobile.autoSaveToAlbum";
const DEFAULT_ENABLED = true;

type Listener = (next: boolean) => void;

const listeners = new Set<Listener>();
let cachedEnabled: boolean | null = null;

function readFromStorage(): boolean {
  return deviceStorage.getBoolean(STORAGE_KEY) ?? DEFAULT_ENABLED;
}

function loadCached(): boolean {
  if (cachedEnabled === null) {
    cachedEnabled = readFromStorage();
  }
  return cachedEnabled;
}

export function getAutoSaveToAlbumEnabled(): boolean {
  return loadCached();
}

export function setAutoSaveToAlbumEnabled(enabled: boolean): boolean {
  if (loadCached() === enabled) {
    return enabled;
  }
  cachedEnabled = enabled;
  deviceStorage.set(STORAGE_KEY, enabled);
  for (const listener of listeners) {
    listener(enabled);
  }
  return enabled;
}

export function subscribeAutoSaveToAlbumEnabled(
  listener: Listener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAutoSaveToAlbumEnabled() {
  const [enabled, setEnabled] = useState<boolean>(() =>
    getAutoSaveToAlbumEnabled()
  );

  useEffect(() => {
    return subscribeAutoSaveToAlbumEnabled(next => setEnabled(next));
  }, []);

  const update = useCallback((next: boolean) => {
    setAutoSaveToAlbumEnabled(next);
    setEnabled(next);
  }, []);

  return { enabled, update };
}

import { useCallback, useEffect, useState } from "react";
import { normalizeMediaAutoDownloadPreferences } from "@mushroom/shared";
import { deviceStorage } from "../../data/storage";
import {
  DEFAULT_MEDIA_AUTO_DOWNLOAD_PREFERENCES,
  type MediaAutoDownloadPolicy,
  type MediaAutoDownloadPreferences,
  type MediaCategory
} from "./types";

const STORAGE_KEY = "mushroom.mobile.mediaAutoDownload";

type Listener = (next: MediaAutoDownloadPreferences) => void;

const listeners = new Set<Listener>();
let cachedPreferences: MediaAutoDownloadPreferences | null = null;

function readFromStorage(): MediaAutoDownloadPreferences {
  const raw = deviceStorage.getString(STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_MEDIA_AUTO_DOWNLOAD_PREFERENCES };
  }
  try {
    return normalizeMediaAutoDownloadPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_MEDIA_AUTO_DOWNLOAD_PREFERENCES };
  }
}

function loadCached(): MediaAutoDownloadPreferences {
  if (!cachedPreferences) {
    cachedPreferences = readFromStorage();
  }
  return cachedPreferences;
}

export function getMediaAutoDownloadPreferences(): MediaAutoDownloadPreferences {
  return { ...loadCached() };
}

export function setMediaAutoDownloadPolicy(
  category: MediaCategory,
  policy: MediaAutoDownloadPolicy
): MediaAutoDownloadPreferences {
  const current = loadCached();
  if (current[category] === policy) {
    return { ...current };
  }
  const next: MediaAutoDownloadPreferences = { ...current, [category]: policy };
  cachedPreferences = next;
  deviceStorage.set(STORAGE_KEY, JSON.stringify(next));
  for (const listener of listeners) {
    listener({ ...next });
  }
  return { ...next };
}

export function subscribeMediaAutoDownloadPreferences(
  listener: Listener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMediaAutoDownloadPreferences() {
  const [preferences, setPreferences] = useState<MediaAutoDownloadPreferences>(
    () => getMediaAutoDownloadPreferences()
  );

  useEffect(() => {
    return subscribeMediaAutoDownloadPreferences(next => setPreferences(next));
  }, []);

  const update = useCallback(
    (category: MediaCategory, policy: MediaAutoDownloadPolicy) => {
      const next = setMediaAutoDownloadPolicy(category, policy);
      setPreferences(next);
    },
    []
  );

  return { preferences, update };
}

import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription
} from "react-native";
import AudioRecorderPlayer from "react-native-audio-recorder-player";
import RNFS from "react-native-fs";
import { i18n } from "../i18n";

export type AudioSet = Record<string, unknown>;

export type RecordBackType = {
  currentPosition?: number;
  currentMetering?: number;
};

export type PlayBackType = {
  currentPosition?: number;
  duration?: number;
};

export type PlaybackEndType = Record<string, never>;

type MobileVoiceRecorder = {
  startRecorder: (
    uri?: string,
    audioSets?: AudioSet,
    meteringEnabled?: boolean
  ) => Promise<string>;
  stopRecorder: () => Promise<string>;
  startPlayer: (
    uri?: string,
    httpHeaders?: Record<string, string>
  ) => Promise<string>;
  stopPlayer: () => Promise<string>;
  setSubscriptionDuration: (sec: number) => void;
  addRecordBackListener: (
    callback: (recordingMeta: RecordBackType) => void
  ) => void;
  removeRecordBackListener: () => void;
  addPlayBackListener: (callback: (playbackMeta: PlayBackType) => void) => void;
  removePlayBackListener: () => void;
  addPlaybackEndListener: (
    callback: (playbackEndMeta: PlaybackEndType) => void
  ) => void;
  removePlaybackEndListener: () => void;
};

type AndroidVoiceRecorderNativeModule = {
  startRecorder: (
    uri?: string,
    audioSets?: AudioSet,
    meteringEnabled?: boolean
  ) => Promise<string>;
  stopRecorder: () => Promise<string>;
  startPlayer: (
    uri?: string,
    httpHeaders?: Record<string, string>
  ) => Promise<string>;
  stopPlayer: () => Promise<string>;
  setSubscriptionDuration: (sec: number) => void;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};

const RECORD_PROGRESS_EVENT = "MushroomVoiceRecorderRecordProgress";
const PLAYBACK_PROGRESS_EVENT = "MushroomVoiceRecorderPlaybackProgress";
const PLAYBACK_ENDED_EVENT = "MushroomVoiceRecorderPlaybackEnded";

function createUnsupportedVoiceRecorder(
  message = i18n.t("recorder.unsupported")
): MobileVoiceRecorder {
  const rejectUnsupported = () => Promise.reject(new Error(message));

  return {
    startRecorder: rejectUnsupported,
    stopRecorder: rejectUnsupported,
    startPlayer: rejectUnsupported,
    stopPlayer: rejectUnsupported,
    setSubscriptionDuration() {},
    addRecordBackListener() {},
    removeRecordBackListener() {},
    addPlayBackListener() {},
    removePlayBackListener() {},
    addPlaybackEndListener() {},
    removePlaybackEndListener() {}
  };
}

function createAndroidVoiceRecorder(): MobileVoiceRecorder {
  const nativeModule = NativeModules.MushroomVoiceRecorder as
    | AndroidVoiceRecorderNativeModule
    | undefined;

  if (!nativeModule) {
    return createUnsupportedVoiceRecorder(
      i18n.t("recorder.androidModuleMissing")
    );
  }

  const emitter = new NativeEventEmitter(nativeModule);
  let recordSubscription: EmitterSubscription | null = null;
  let playbackSubscription: EmitterSubscription | null = null;
  let playbackEndSubscription: EmitterSubscription | null = null;

  return {
    startRecorder(uri, audioSets, meteringEnabled) {
      return nativeModule.startRecorder(uri, audioSets, meteringEnabled);
    },
    stopRecorder() {
      return nativeModule.stopRecorder();
    },
    startPlayer(uri, httpHeaders) {
      return nativeModule.startPlayer(uri, httpHeaders);
    },
    stopPlayer() {
      return nativeModule.stopPlayer();
    },
    setSubscriptionDuration(sec) {
      nativeModule.setSubscriptionDuration(sec);
    },
    addRecordBackListener(callback) {
      recordSubscription?.remove();
      recordSubscription = emitter.addListener(RECORD_PROGRESS_EVENT, callback);
    },
    removeRecordBackListener() {
      recordSubscription?.remove();
      recordSubscription = null;
    },
    addPlayBackListener(callback) {
      playbackSubscription?.remove();
      playbackSubscription = emitter.addListener(
        PLAYBACK_PROGRESS_EVENT,
        callback
      );
    },
    removePlayBackListener() {
      playbackSubscription?.remove();
      playbackSubscription = null;
    },
    addPlaybackEndListener(callback) {
      playbackEndSubscription?.remove();
      playbackEndSubscription = emitter.addListener(
        PLAYBACK_ENDED_EVENT,
        callback
      );
    },
    removePlaybackEndListener() {
      playbackEndSubscription?.remove();
      playbackEndSubscription = null;
    }
  };
}

function createFallbackVoiceRecorder(): MobileVoiceRecorder {
  try {
    return AudioRecorderPlayer as unknown as MobileVoiceRecorder;
  } catch {
    return createUnsupportedVoiceRecorder();
  }
}

export const mobileVoiceRecorder: MobileVoiceRecorder =
  Platform.OS === "android"
    ? createAndroidVoiceRecorder()
    : createFallbackVoiceRecorder();

export const MOBILE_VOICE_AUDIO_SET: AudioSet = {
  AudioSourceAndroid: 1,
  OutputFormatAndroid: 2,
  AudioEncoderAndroid: 3,
  AVEncoderAudioQualityKeyIOS: 96,
  AVFormatIDKeyIOS: "aac",
  AVNumberOfChannelsKeyIOS: 1,
  AVSampleRateKeyIOS: 44_100,
  AudioChannels: 1,
  AudioSamplingRate: 44_100,
  AudioEncodingBitRate: 128_000
};

export function ensureLocalFileUri(value: string) {
  if (!value) {
    return value;
  }

  if (/^[a-z]+:\/\//i.test(value)) {
    return value;
  }

  return `file://${value}`;
}

export async function deleteRecordedFile(uri: string) {
  if (!uri || !/^(file:\/\/|\/)/i.test(uri)) {
    return;
  }

  const path = uri.replace(/^file:\/\//i, "");
  try {
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path);
    }
  } catch {
    // Temporary recording cleanup is best effort.
  }
}

export function getVoiceUploadUriCandidates(value: string) {
  if (!value) {
    return [];
  }

  const candidates = new Set<string>();
  candidates.add(value);

  const normalized = ensureLocalFileUri(value);
  if (normalized) {
    candidates.add(normalized);
  }

  if (normalized.startsWith("file://")) {
    candidates.add(normalized.replace(/^file:\/\//, ""));
  }

  return Array.from(candidates).filter(Boolean);
}

export function createVoiceFileName(durationSeconds: number) {
  return `voice-${Date.now()}-${Math.max(1, Math.floor(durationSeconds))}.m4a`;
}

export function normalizeWaveform(samples: number[]) {
  if (samples.length === 0) {
    return [];
  }

  const bucketCount = 20;
  const bucketSize = Math.max(1, Math.ceil(samples.length / bucketCount));
  const normalized = [];

  for (let index = 0; index < bucketCount; index += 1) {
    const start = index * bucketSize;
    const bucket = samples.slice(start, start + bucketSize);
    if (bucket.length === 0) {
      continue;
    }

    const average =
      bucket.reduce((sum, value) => sum + Math.abs(value), 0) / bucket.length;
    normalized.push(Math.max(0.08, Math.min(1, average / 120)));
  }

  return normalized;
}

export function getVoiceMimeType(uri: string) {
  if (/\.wav$/i.test(uri)) {
    return "audio/wav";
  }
  if (/\.aac$/i.test(uri)) {
    return "audio/aac";
  }
  if (/\.mp3$/i.test(uri)) {
    return "audio/mpeg";
  }
  if (/\.m4a$/i.test(uri) || /\.mp4$/i.test(uri)) {
    return "audio/mp4";
  }
  return "audio/mp4";
}

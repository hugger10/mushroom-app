import { Image, Platform } from "react-native";
import { mobileVoiceRecorder } from "./voice-recorder";
import log from "../utils/log";

import incomingRingAsset from "../assets/call-sounds/incoming_ring.wav";
import outgoingRingAsset from "../assets/call-sounds/outgoing_ring.wav";
import connectedAsset from "../assets/call-sounds/call_connected.wav";
import hangupAsset from "../assets/call-sounds/call_hangup.wav";
import busyAsset from "../assets/call-sounds/call_busy.wav";
import rejectedAsset from "../assets/call-sounds/call_rejected.wav";
import timeoutAsset from "../assets/call-sounds/call_timeout.wav";

type MobileCallSoundKey =
  | "incoming"
  | "outgoing"
  | "connected"
  | "hangup"
  | "busy"
  | "rejected"
  | "timeout";

const SOUND_ASSET_BY_KEY: Record<MobileCallSoundKey, number> = {
  incoming: incomingRingAsset,
  outgoing: outgoingRingAsset,
  connected: connectedAsset,
  hangup: hangupAsset,
  busy: busyAsset,
  rejected: rejectedAsset,
  timeout: timeoutAsset
};

class MobileCallSoundPlayer {
  private currentKey: MobileCallSoundKey | null = null;

  private loopEnabled = false;

  private loopTimer: ReturnType<typeof setTimeout> | null = null;

  private playbackListenerAttached = false;

  private playbackGeneration = 0;

  private lastPlayedAtByKey = new Map<MobileCallSoundKey, number>();

  private ensurePlaybackListener() {
    if (this.playbackListenerAttached) {
      return;
    }

    mobileVoiceRecorder.addPlaybackEndListener(() => {
      if (!this.loopEnabled || !this.currentKey) {
        return;
      }

      const generation = this.playbackGeneration;
      this.loopTimer = setTimeout(() => {
        if (
          this.loopEnabled &&
          this.currentKey &&
          generation === this.playbackGeneration
        ) {
          void this.playCurrent();
        }
      }, 120);
    });
    this.playbackListenerAttached = true;
  }

  private clearPlaybackListener() {
    if (!this.playbackListenerAttached) {
      return;
    }
    mobileVoiceRecorder.removePlaybackEndListener();
    this.playbackListenerAttached = false;
  }

  private clearLoopTimer() {
    if (!this.loopTimer) {
      return;
    }
    clearTimeout(this.loopTimer);
    this.loopTimer = null;
  }

  private resolveUri(key: MobileCallSoundKey) {
    const source = Image.resolveAssetSource(SOUND_ASSET_BY_KEY[key]);
    return source?.uri ?? null;
  }

  private async playCurrent() {
    if (!this.currentKey) {
      return;
    }

    const uri = this.resolveUri(this.currentKey);
    if (!uri) {
      return;
    }

    this.ensurePlaybackListener();
    try {
      await mobileVoiceRecorder.startPlayer(uri);
    } catch (error) {
      log.scope("call-sound").warn("failed to play sound", {
        key: this.currentKey,
        platform: Platform.OS,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async playLoop(key: Extract<MobileCallSoundKey, "incoming" | "outgoing">) {
    if (this.currentKey === key && this.loopEnabled) {
      return;
    }

    await this.stopAll();
    this.currentKey = key;
    this.loopEnabled = true;
    this.playbackGeneration += 1;
    await this.playCurrent();
  }

  async playOnce(key: Exclude<MobileCallSoundKey, "incoming" | "outgoing">) {
    const now = Date.now();
    const lastPlayedAt = this.lastPlayedAtByKey.get(key) ?? 0;
    if (now - lastPlayedAt < 180) {
      return;
    }
    this.lastPlayedAtByKey.set(key, now);

    await this.stopAll();
    this.currentKey = key;
    this.loopEnabled = false;
    this.playbackGeneration += 1;
    await this.playCurrent();
  }

  stopLoop() {
    const shouldStopCurrentPlayback = this.loopEnabled;
    this.loopEnabled = false;
    this.playbackGeneration += 1;
    this.clearLoopTimer();
    if (shouldStopCurrentPlayback) {
      this.currentKey = null;
      void mobileVoiceRecorder.stopPlayer().catch(() => {
        // Ignore stop failures when loop audio is already ending.
      });
    }
  }

  async stopAll() {
    this.currentKey = null;
    this.stopLoop();
    this.clearPlaybackListener();
    try {
      await mobileVoiceRecorder.stopPlayer();
    } catch {
      // Ignore stop failures when no sound is playing.
    }
  }
}

export const mobileCallSoundPlayer = new MobileCallSoundPlayer();

import { Image, Platform } from "react-native";
import { mobileVoiceRecorder } from "./voice-recorder";
import log from "../utils/log";

import recordCancelAsset from "../assets/recording-sounds/record_cancel.wav";

// Android: reference the APK `res/raw` resource directly (MediaPlayer-native
// scheme). `Image.resolveAssetSource` would return a drawable-folder path that
// does not exist as a file in release builds.
// iOS: resolve the bundled asset path like the call-sound player does.
const RECORD_CANCEL_URI =
  Platform.OS === "android"
    ? "android.resource://com.outland.mushroom/raw/record_cancel"
    : (Image.resolveAssetSource(recordCancelAsset)?.uri ?? null);

class RecordingSoundPlayer {
  private lastPlayedAt = 0;

  /**
   * Short "drop into trash" confirmation tone, fired once when the slide
   * gesture crosses the cancel threshold. Best-effort: playback failures are
   * swallowed and rapid re-triggers within 300ms are ignored.
   */
  async playRecordCancel() {
    const now = Date.now();
    if (now - this.lastPlayedAt < 300 || !RECORD_CANCEL_URI) {
      return;
    }
    this.lastPlayedAt = now;

    try {
      await mobileVoiceRecorder.stopPlayer();
    } catch {
      // ignore — no prior playback
    }

    try {
      await mobileVoiceRecorder.startPlayer(RECORD_CANCEL_URI);
    } catch (error) {
      log.scope("recording-sound").warn("failed to play record cancel tone", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export const recordingSoundPlayer = new RecordingSoundPlayer();

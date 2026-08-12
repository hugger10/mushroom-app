type CallSoundKey =
  | "incoming"
  | "outgoing"
  | "connected"
  | "hangup"
  | "busy"
  | "rejected"
  | "timeout";

const SOUND_FILE_BY_KEY: Record<CallSoundKey, string> = {
  incoming: "incoming-ring.wav",
  outgoing: "outgoing-ring.wav",
  connected: "call-connected.wav",
  hangup: "call-hangup.wav",
  busy: "call-busy.wav",
  rejected: "call-rejected.wav",
  timeout: "call-timeout.wav"
};

const SOUND_VOLUME_BY_KEY: Record<CallSoundKey, number> = {
  incoming: 0.72,
  outgoing: 0.58,
  connected: 0.65,
  hangup: 0.68,
  busy: 0.62,
  rejected: 0.62,
  timeout: 0.62
};

function resolveSoundUrl(key: CallSoundKey) {
  const baseUrl =
    typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
      ? import.meta.env.BASE_URL
      : "./";
  const relativeUrl = `${baseUrl}call-sounds/${SOUND_FILE_BY_KEY[key]}`;

  if (typeof window === "undefined") {
    return relativeUrl;
  }

  return new URL(relativeUrl, window.location.href).toString();
}

class CallSoundPlayer {
  private loopAudio: HTMLAudioElement | null = null;

  private loopKey: CallSoundKey | null = null;

  private activeOneShotAudios = new Set<HTMLAudioElement>();

  private lastPlayedAtByKey = new Map<CallSoundKey, number>();

  private createAudio(key: CallSoundKey, loop: boolean) {
    const audio = new Audio(resolveSoundUrl(key));
    audio.preload = "auto";
    audio.loop = loop;
    audio.volume = SOUND_VOLUME_BY_KEY[key];
    return audio;
  }

  async playLoop(key: Extract<CallSoundKey, "incoming" | "outgoing">) {
    if (
      this.loopKey === key &&
      this.loopAudio &&
      !this.loopAudio.paused &&
      !this.loopAudio.ended
    ) {
      return;
    }

    this.stopLoop();
    const audio = this.createAudio(key, true);
    this.loopKey = key;
    this.loopAudio = audio;

    try {
      audio.currentTime = 0;
      await audio.play();
    } catch (error) {
      console.warn("Failed to play looping call sound", {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      if (this.loopAudio === audio) {
        this.loopAudio = null;
        this.loopKey = null;
      }
    }
  }

  stopLoop() {
    if (!this.loopAudio) {
      this.loopKey = null;
      return;
    }

    const current = this.loopAudio;
    this.loopAudio = null;
    this.loopKey = null;
    current.pause();
    current.currentTime = 0;
  }

  async playOnce(key: Exclude<CallSoundKey, "incoming" | "outgoing">) {
    const lastPlayedAt = this.lastPlayedAtByKey.get(key) ?? 0;
    const now = Date.now();
    if (now - lastPlayedAt < 180) {
      return;
    }
    this.lastPlayedAtByKey.set(key, now);

    const audio = this.createAudio(key, false);
    this.activeOneShotAudios.add(audio);
    const cleanup = () => {
      audio.pause();
      audio.currentTime = 0;
      this.activeOneShotAudios.delete(audio);
    };

    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });

    try {
      await audio.play();
    } catch (error) {
      cleanup();
      console.warn("Failed to play one-shot call sound", {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  stopAll() {
    this.stopLoop();
    for (const audio of Array.from(this.activeOneShotAudios)) {
      audio.pause();
      audio.currentTime = 0;
      this.activeOneShotAudios.delete(audio);
    }
  }
}

export const callSoundPlayer = new CallSoundPlayer();

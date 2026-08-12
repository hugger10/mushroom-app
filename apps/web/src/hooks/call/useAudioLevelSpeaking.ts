import { useEffect, useState } from "react";

/**
 * Derive a boolean "is speaking" signal from a `MediaStream`'s audio track via
 * the Web Audio API (`AudioContext` + `AnalyserNode`). Used for 1:1 calls,
 * which run over native WebRTC (no LiveKit `activeSpeakers`). Group calls read
 * speaking state directly from LiveKit instead.
 *
 * The RMS level is sampled on `requestAnimationFrame` but the React state is
 * only updated when the debounced speaking decision flips, so re-renders stay
 * cheap. Returns `false` when the stream is null or has no live audio track.
 */
const SPEAKING_RMS_THRESHOLD = 0.045;
// Keep "speaking" latched briefly after the level drops so natural pauses
// between words do not flicker the indicator off.
const SPEAKING_RELEASE_MS = 350;

export function useAudioLevelSpeaking(stream: MediaStream | null): boolean {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!stream) {
      setIsSpeaking(false);
      return undefined;
    }

    const audioTrack = stream
      .getAudioTracks()
      .find(track => track.readyState === "live");
    if (!audioTrack) {
      setIsSpeaking(false);
      return undefined;
    }

    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) {
      setIsSpeaking(false);
      return undefined;
    }

    let cancelled = false;
    let rafId = 0;
    let lastAboveThresholdAt = 0;
    let currentSpeaking = false;

    const audioContext = new AudioContextCtor();
    // The context may start suspended (no user gesture). Resume so the analyser
    // receives samples; ignore failures (analysis simply stays at zero).
    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => {
        // Ignore; speaking detection will report false until resumed.
      });
    }
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buffer = new Uint8Array(analyser.fftSize);

    const tick = () => {
      if (cancelled) {
        return;
      }
      analyser.getByteTimeDomainData(buffer);
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const centered = (buffer[i] - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / buffer.length);

      const now = Date.now();
      if (rms >= SPEAKING_RMS_THRESHOLD) {
        lastAboveThresholdAt = now;
      }
      const nextSpeaking = now - lastAboveThresholdAt < SPEAKING_RELEASE_MS;
      if (nextSpeaking !== currentSpeaking) {
        currentSpeaking = nextSpeaking;
        setIsSpeaking(nextSpeaking);
      }

      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {
        // Ignore disconnect races during teardown.
      }
      void audioContext.close().catch(() => {
        // Ignore close failures; the context is being discarded anyway.
      });
      setIsSpeaking(false);
    };
  }, [stream]);

  return isSpeaking;
}

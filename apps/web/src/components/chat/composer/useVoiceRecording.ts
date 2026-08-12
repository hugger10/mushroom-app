import { useCallback, useEffect, useRef, useState } from "react";
import { message } from "antd";
import { i18n } from "../../../i18n";
import type {
  SendFileMessage,
  TypingActivity,
  VoiceRecordingState
} from "./types";
import { sendFileWithState } from "./fileUpload";
import { getVoiceMimeType } from "./utils";

interface UseVoiceRecordingOptions {
  inputValue: string;
  onSendFileMessage: SendFileMessage;
  onAfterFileSent: () => void;
  sendTypingSignal: (
    active: boolean,
    activity?: TypingActivity
  ) => Promise<void>;
}

export function useVoiceRecording({
  inputValue,
  onSendFileMessage,
  onAfterFileSent,
  sendTypingSignal
}: UseVoiceRecordingOptions) {
  const [voiceRecording, setVoiceRecording] = useState<VoiceRecordingState>({
    active: false,
    elapsedMs: 0
  });
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceStartedAtRef = useRef(0);
  const voiceElapsedTimerRef = useRef<number | null>(null);
  const voicePressingRef = useRef(false);

  const clearVoiceElapsedTimer = useCallback(() => {
    if (voiceElapsedTimerRef.current != null) {
      window.clearInterval(voiceElapsedTimerRef.current);
      voiceElapsedTimerRef.current = null;
    }
  }, []);

  const cleanupVoiceRecording = useCallback(() => {
    clearVoiceElapsedTimer();
    voiceRecorderRef.current = null;
    voicePressingRef.current = false;
    voiceStreamRef.current?.getTracks().forEach(track => track.stop());
    voiceStreamRef.current = null;
    voiceChunksRef.current = [];
    voiceStartedAtRef.current = 0;
    setVoiceRecording({ active: false, elapsedMs: 0 });
    void sendTypingSignal(false, "voice");
  }, [clearVoiceElapsedTimer, sendTypingSignal]);

  const startVoiceRecording = useCallback(async () => {
    if (inputValue.trim() || voiceRecording.active) {
      return;
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      message.error(i18n.t("recorder.unsupportedEnvironment"));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!voicePressingRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      const mimeType = getVoiceMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      voiceStreamRef.current = stream;
      voiceRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      voiceStartedAtRef.current = Date.now();
      setVoiceRecording({ active: true, elapsedMs: 0 });
      void sendTypingSignal(true, "voice");
      recorder.addEventListener("dataavailable", event => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      });
      recorder.start();
      voiceElapsedTimerRef.current = window.setInterval(() => {
        setVoiceRecording({
          active: true,
          elapsedMs: Date.now() - voiceStartedAtRef.current
        });
      }, 160);
    } catch (error) {
      cleanupVoiceRecording();
      const errorMessage =
        error instanceof Error ? error.message : i18n.t("recorder.startFailed");
      message.error(errorMessage);
    }
  }, [
    cleanupVoiceRecording,
    inputValue,
    sendTypingSignal,
    voiceRecording.active
  ]);

  const beginVoiceRecording = useCallback(() => {
    voicePressingRef.current = true;
    void startVoiceRecording();
  }, [startVoiceRecording]);

  const stopVoiceRecordingAndSend = useCallback(async () => {
    const recorder = voiceRecorderRef.current;
    const startedAt = voiceStartedAtRef.current;
    voicePressingRef.current = false;
    if (!recorder || !voiceRecording.active || !startedAt) {
      return;
    }

    clearVoiceElapsedTimer();
    const durationMs = Date.now() - startedAt;
    const durationSeconds = Math.max(1, Math.floor(durationMs / 1000));

    await new Promise<void>(resolve => {
      recorder.addEventListener(
        "stop",
        () => {
          resolve();
        },
        { once: true }
      );
      recorder.stop();
    });

    const chunks = [...voiceChunksRef.current];
    const recordedMimeType =
      recorder.mimeType ||
      chunks[0]?.type ||
      getVoiceMimeType() ||
      "audio/webm";
    const extension = recordedMimeType.includes("mp4")
      ? "m4a"
      : recordedMimeType.includes("ogg")
        ? "ogg"
        : "webm";
    cleanupVoiceRecording();

    if (durationMs < 1000) {
      message.info(i18n.t("recorder.tooShort"));
      return;
    }

    const voiceFile = new File(
      [new Blob(chunks, { type: recordedMimeType })],
      `voice-${Date.now()}-${durationSeconds}.${extension}`,
      { type: recordedMimeType }
    );
    const sent = await sendFileWithState(voiceFile, onSendFileMessage, {
      kind: "voice_message",
      durationSeconds,
      waveform: []
    });
    if (sent) {
      onAfterFileSent();
    }
  }, [
    cleanupVoiceRecording,
    clearVoiceElapsedTimer,
    onAfterFileSent,
    onSendFileMessage,
    voiceRecording.active
  ]);

  const cancelVoiceRecording = useCallback(() => {
    const recorder = voiceRecorderRef.current;
    voicePressingRef.current = false;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    cleanupVoiceRecording();
  }, [cleanupVoiceRecording]);

  useEffect(() => {
    return () => {
      cleanupVoiceRecording();
    };
  }, [cleanupVoiceRecording]);

  return {
    beginVoiceRecording,
    cancelVoiceRecording,
    stopVoiceRecordingAndSend,
    voiceRecording
  };
}

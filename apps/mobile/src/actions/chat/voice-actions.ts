import { isFileMessageContent, type Message } from "@mushroom/shared";
import { Linking } from "react-native";
import {
  mobileAppController,
  uploadMobileFile
} from "../../services/app-runtime";
import {
  MOBILE_VOICE_AUDIO_SET,
  createVoiceFileName,
  getVoiceUploadUriCandidates,
  getVoiceMimeType,
  mobileVoiceRecorder,
  normalizeWaveform,
  deleteRecordedFile
} from "../../platform/voice-recorder";
import {
  downloadMobileMediaCache,
  resolveMobileMediaCache
} from "../../platform/media-cache";
import type { MobileAppState } from "../../app/controller/useMobileAppState";
import type { createMessageActions } from "./message-actions";
import { i18n } from "../../i18n";

type MessageActions = ReturnType<typeof createMessageActions>;

export function createVoiceActions(params: {
  state: MobileAppState;
  ensureMediaPermission: (kind: "microphone" | "camera") => Promise<boolean>;
  messageActions: MessageActions;
}) {
  const { state, ensureMediaPermission, messageActions } = params;

  async function uploadVoiceRecording(options: {
    recordedUri: string;
    durationSeconds: number;
  }) {
    const candidates = getVoiceUploadUriCandidates(options.recordedUri);
    const durationMs = Math.max(0, Math.round(options.durationSeconds * 1000));
    let lastError: unknown = null;

    for (const candidate of candidates) {
      try {
        return await uploadMobileFile({
          uri: candidate,
          name: createVoiceFileName(options.durationSeconds),
          type: getVoiceMimeType(candidate),
          durationMs,
          category: "voice"
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(i18n.t("messageActions.voiceUploadFailed"));
  }

  async function startVoiceRecording() {
    if (!state.activeConversation || state.voiceRecordingActive) {
      return;
    }

    const granted = await ensureMediaPermission("microphone");
    if (!granted) {
      state.setError(i18n.t("messageActions.micPermissionRequired"));
      return;
    }

    state.voiceMeteringSamplesRef.current = [];
    state.setComposerToolsVisible(false);
    state.setVoiceRecordingActive(true);
    void messageActions.updateTypingState(true, "voice");

    try {
      mobileVoiceRecorder.setSubscriptionDuration(0.12);
      mobileVoiceRecorder.addRecordBackListener(meta => {
        const metering = Number(meta.currentMetering || 0);
        state.voiceMeteringSamplesRef.current = [
          ...state.voiceMeteringSamplesRef.current,
          Number.isFinite(metering) ? metering : 0
        ].slice(-120);
      });

      await mobileVoiceRecorder.startRecorder(
        undefined,
        MOBILE_VOICE_AUDIO_SET,
        true
      );
    } catch (currentError) {
      mobileVoiceRecorder.removeRecordBackListener();
      state.setVoiceRecordingActive(false);
      void messageActions.updateTypingState(false, "voice");
      state.setError(
        currentError instanceof Error
          ? currentError.message
          : String(currentError ?? "")
      );
      state.setStatus(i18n.t("messageActions.recordStartFailed"));
    }
  }

  async function stopVoiceRecordingAndSend(durationMs: number) {
    if (!state.activeConversation || !state.voiceRecordingActive) {
      return;
    }

    state.setVoiceRecordingActive(false);
    mobileVoiceRecorder.removeRecordBackListener();
    void messageActions.updateTypingState(false, "voice");

    const durationSeconds = Math.floor(durationMs / 1000);

    try {
      const recordedUri = await mobileVoiceRecorder.stopRecorder();
      if (durationMs < 1000) {
        return;
      }

      state.setPending(true);

      await new Promise<void>(resolve => {
        setTimeout(() => resolve(), 160);
      });
      const uploaded = await uploadVoiceRecording({
        recordedUri,
        durationSeconds
      });
      const optimisticMessage =
        await mobileAppController.createOptimisticVoiceMessage({
          clientConversationId: state.activeConversation.client_conversation_id,
          attachment: {
            uploadId: uploaded.upload_id,
            name: uploaded.originalname,
            url: uploaded.url,
            size: uploaded.size,
            mimeType: uploaded.mime_type,
            durationSeconds,
            waveform: normalizeWaveform(state.voiceMeteringSamplesRef.current)
          },
          replyToClientMessageId: state.replyTargetId
        });

      state.setReplyTargetId(null);
      state.setSelectedMessageId(null);
      await messageActions.sendPreparedMessage(optimisticMessage, "");
    } catch (currentError) {
      state.setError(
        currentError instanceof Error
          ? currentError.message
          : String(currentError ?? "")
      );
      state.setStatus(i18n.t("messageActions.voiceSendFailed"));
    } finally {
      state.setPending(false);
    }
  }

  async function cancelVoiceRecording() {
    if (!state.voiceRecordingActive) {
      return;
    }

    state.setVoiceRecordingActive(false);
    mobileVoiceRecorder.removeRecordBackListener();
    void messageActions.updateTypingState(false, "voice");
    try {
      const recordedUri = await mobileVoiceRecorder.stopRecorder();
      await deleteRecordedFile(recordedUri);
    } catch {
      // Ignore recorder stop errors during cancellation.
    }
  }

  async function handleToggleVoicePlayback(message: Message) {
    if (!isFileMessageContent(message.content) || !("url" in message.content)) {
      return;
    }

    if (state.voicePlayingMessageId === message.client_message_id) {
      await mobileVoiceRecorder.stopPlayer();
      mobileVoiceRecorder.removePlayBackListener();
      mobileVoiceRecorder.removePlaybackEndListener();
      state.setVoicePlayingMessageId(null);
      state.setVoicePlayingPositionMs(0);
      return;
    }

    mobileVoiceRecorder.removePlayBackListener();
    mobileVoiceRecorder.removePlaybackEndListener();
    await mobileVoiceRecorder.stopPlayer().catch(() => {});

    try {
      state.setVoicePlayingMessageId(message.client_message_id);
      state.setVoicePlayingPositionMs(0);
      state.setStatus("");
      const cacheInput = {
        username: state.snapshot?.auth.user?.username ?? "unknown",
        remoteUrl: message.content.url,
        category: "voice" as const,
        messageId: message.server_message_id || message.client_message_id,
        uploadId: message.content.upload_id,
        originalName: message.content.name,
        mimeType: message.content.mime_type,
        size: message.content.size
      };
      const cached = await resolveMobileMediaCache(cacheInput).catch(
        () => null
      );
      let playableUri: string;
      if (cached?.status === "ready") {
        playableUri = cached.localUri;
      } else {
        try {
          playableUri = (await downloadMobileMediaCache(cacheInput)).localUri;
        } catch (downloadErr) {
          state.setVoicePlayingMessageId(null);
          state.setVoicePlayingPositionMs(0);
          state.setError(
            downloadErr instanceof Error
              ? downloadErr.message
              : String(downloadErr ?? "")
          );
          state.setStatus(i18n.t("messageActions.voiceDownloadFailed"));
          return;
        }
      }

      await mobileVoiceRecorder.startPlayer(playableUri);
      mobileVoiceRecorder.setSubscriptionDuration(0.15);
      mobileVoiceRecorder.addPlayBackListener(meta => {
        state.setVoicePlayingMessageId(message.client_message_id);
        state.setVoicePlayingPositionMs(Number(meta.currentPosition || 0));
      });
      mobileVoiceRecorder.addPlaybackEndListener(() => {
        state.setVoicePlayingMessageId(null);
        state.setVoicePlayingPositionMs(0);
        mobileVoiceRecorder.removePlayBackListener();
        mobileVoiceRecorder.removePlaybackEndListener();
      });
    } catch (currentError) {
      state.setVoicePlayingMessageId(null);
      state.setVoicePlayingPositionMs(0);
      mobileVoiceRecorder.removePlayBackListener();
      mobileVoiceRecorder.removePlaybackEndListener();

      try {
        const fallback = await resolveMobileMediaCache({
          username: state.snapshot?.auth.user?.username ?? "unknown",
          remoteUrl: message.content.url,
          category: "voice",
          messageId: message.server_message_id || message.client_message_id,
          uploadId: message.content.upload_id,
          originalName: message.content.name,
          mimeType: message.content.mime_type,
          size: message.content.size
        });
        const fallbackUri =
          fallback?.status === "ready" ? fallback.localUri : null;
        await Linking.openURL(fallbackUri || message.content.url);
      } catch {
        state.setError(
          currentError instanceof Error
            ? currentError.message
            : String(currentError ?? "")
        );
        state.setStatus(i18n.t("messageActions.voicePlayFailed"));
      }
    }
  }

  return {
    startVoiceRecording,
    stopVoiceRecordingAndSend,
    cancelVoiceRecording,
    handleToggleVoicePlayback
  };
}

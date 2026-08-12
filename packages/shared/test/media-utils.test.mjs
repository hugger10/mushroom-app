import test from "node:test";
import assert from "node:assert/strict";
import {
  formatMediaDuration,
  formatFileSize,
  getConversationContentPreview,
  getFileMessageKindLabel,
  getMessageSummaryText,
  isAudioFileMessageContent,
  isFileMessageContent,
  isImageFileMessageContent,
  isVoiceMessageContent,
  isVideoFileMessageContent
} from "../dist/index.mjs";

test("file message helpers detect media kinds by file extension fallback", () => {
  const image = {
    type: 2,
    name: "preview.webp",
    url: "https://example.com/preview.webp",
    size: 2048
  };
  const video = {
    type: 2,
    name: "demo.mov",
    url: "https://example.com/demo.mov",
    size: 4096
  };
  const audio = {
    type: 2,
    name: "voice.flac",
    url: "https://example.com/voice.flac",
    size: 1024
  };

  assert.equal(isFileMessageContent(image), true);
  assert.equal(isImageFileMessageContent(image), true);
  assert.equal(isVideoFileMessageContent(video), true);
  assert.equal(isAudioFileMessageContent(audio), true);
});

test("file message helpers prefer mime type when file name is ambiguous", () => {
  const image = {
    type: 2,
    name: "attachment.bin",
    url: "https://example.com/attachment.bin",
    size: 2048,
    mime_type: "image/jpeg"
  };
  const video = {
    type: 2,
    name: "stream.dat",
    url: "https://example.com/stream.dat",
    size: 4096,
    mime_type: "video/webm"
  };
  const audio = {
    type: 2,
    name: "clip.raw",
    url: "https://example.com/clip.raw",
    size: 1024,
    mime_type: "audio/aac"
  };

  assert.equal(isImageFileMessageContent(image), true);
  assert.equal(isVideoFileMessageContent(video), true);
  assert.equal(isAudioFileMessageContent(audio), true);
});

test("audio webm attachments are not classified as video", () => {
  const voice = {
    type: 2,
    kind: "voice_message",
    name: "voice-123.webm",
    url: "https://example.com/voice-123.webm",
    size: 1024,
    mime_type: "audio/webm",
    duration_seconds: 4
  };

  assert.equal(isVideoFileMessageContent(voice), false);
  assert.equal(isAudioFileMessageContent(voice), true);
  assert.equal(isVoiceMessageContent(voice), true);
});

test("message summary and kind label stay aligned for file content", () => {
  const genericFile = {
    type: 2,
    name: "spec.pdf",
    url: "https://example.com/spec.pdf",
    size: 8192,
    mime_type: "application/pdf"
  };

  assert.equal(getFileMessageKindLabel(genericFile).length > 0, true);
  assert.equal(getMessageSummaryText(genericFile).includes("spec.pdf"), true);
});

test("voice message helpers recognize recorded audio payloads", () => {
  const voiceMessage = {
    type: 2,
    kind: "voice_message",
    name: "voice-123.m4a",
    url: "https://example.com/voice-123.m4a",
    size: 2048,
    mime_type: "audio/m4a",
    duration_seconds: 12,
    waveform: [0.2, 0.5, 0.8]
  };

  assert.equal(isAudioFileMessageContent(voiceMessage), true);
  assert.equal(isVoiceMessageContent(voiceMessage), true);
  assert.equal(getFileMessageKindLabel(voiceMessage), "语音");
  assert.equal(getMessageSummaryText(voiceMessage), "[语音] 00:12");
});

test("conversation preview formats group file messages with sender prefix", () => {
  const preview = getConversationContentPreview({
    type: 2,
    mention_unread_count: 0,
    draft: "",
    display_name: "Design Review",
    last_message_content: {
      type: 2,
      name: "moodboard.png",
      url: "https://example.com/moodboard.png",
      size: 4096,
      mime_type: "image/png"
    }
  });

  assert.equal(preview.startsWith("Design Review:"), true);
  assert.equal(preview.length > "Design Review:".length, true);
});

test("formatFileSize handles bytes, kilobytes, and megabytes", () => {
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(999), "999 B");
  assert.equal(formatFileSize(1536), "1.50 KB");
  assert.equal(formatFileSize(10 * 1024 * 1024), "10.0 MB");
});

test("formatMediaDuration normalizes seconds", () => {
  assert.equal(formatMediaDuration(0), "00:00");
  assert.equal(formatMediaDuration(9), "00:09");
  assert.equal(formatMediaDuration(73), "01:13");
});

import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { CloseCircleOutlined } from "@ant-design/icons";
import type { VoiceRecordingState } from "./types";

interface VoiceRecordingPillProps {
  voiceRecording: VoiceRecordingState;
  onCancel: () => void;
}

export function VoiceRecordingPill({
  voiceRecording,
  onCancel
}: VoiceRecordingPillProps) {
  const { t } = useTranslation();
  return (
    <div className="im-composer-recording-pill">
      <Button
        className="im-composer-recording-cancel"
        type="text"
        size="small"
        icon={<CloseCircleOutlined />}
        onClick={onCancel}
        aria-label={t("recorder.cancelRecording")}
      />
      <div className="im-composer-recording-visual">
        <span className="im-composer-voice-dot" />
        <span className="im-composer-recording-bars" aria-hidden="true">
          {Array.from({ length: 16 }).map((_, index) => (
            <span
              key={index}
              className="im-composer-recording-bar"
              style={{ animationDelay: `${index * 0.06}s` }}
            />
          ))}
        </span>
      </div>
      <span className="im-composer-recording-duration">
        {Math.max(0, Math.floor(voiceRecording.elapsedMs / 1000))}"
      </span>
    </div>
  );
}

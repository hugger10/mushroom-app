import { useCallTimer } from "./useCallTimer";
import type { CallUiSession } from "../../../types/chat";

function WaitingDots() {
  return (
    <span className="im-call-waiting-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

/**
 * 通话状态文案。ringing 阶段在文案后附带等待动画点。
 */
export function CallStatusText({
  callSession
}: {
  callSession: CallUiSession;
}) {
  const callTimerText = useCallTimer(callSession);

  if (callSession.phase === "ringing") {
    return (
      <>
        {callTimerText}
        <WaitingDots />
      </>
    );
  }

  return <>{callTimerText}</>;
}

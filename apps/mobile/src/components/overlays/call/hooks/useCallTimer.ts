import { useEffect, useState } from "react";
import type { MobileCallUiSession } from "../../../../types/app";
import { formatCallDuration, getCallPhaseLabel } from "../utils/callDuration";

export function useCallTimer(callSession: MobileCallUiSession | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!callSession || callSession.phase !== "ongoing") {
      return undefined;
    }

    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [callSession]);

  if (!callSession) {
    return "";
  }

  if (callSession.phase !== "ongoing") {
    return getCallPhaseLabel(callSession);
  }

  const anchor = Date.parse(
    callSession.session.answered_at || callSession.session.started_at
  );
  if (!Number.isFinite(anchor)) {
    return "00:00";
  }

  return formatCallDuration((now - anchor) / 1000);
}

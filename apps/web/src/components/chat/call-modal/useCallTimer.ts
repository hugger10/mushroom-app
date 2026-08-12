import { useEffect, useState } from "react";
import type { CallUiSession } from "../../../types/chat";
import {
  formatCallDuration,
  getCallTimerAnchor,
  getPhaseLabel
} from "./callModalUtils";

/**
 * 通话计时文案：ongoing 阶段每秒刷新已通话时长，其余阶段返回阶段标签。
 */
export function useCallTimer(callSession: CallUiSession | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!callSession || callSession.phase !== "ongoing") {
      return undefined;
    }

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [callSession]);

  if (!callSession) {
    return "";
  }

  if (callSession.phase !== "ongoing") {
    return getPhaseLabel(callSession);
  }

  const anchor = Date.parse(getCallTimerAnchor(callSession));
  if (!Number.isFinite(anchor)) {
    return "00:00";
  }

  return formatCallDuration((now - anchor) / 1000);
}

import { callSoundPlayer } from "../../utils/callSoundPlayer";

export function playTerminalCallSound(
  messageClassify: "call.busy" | "call.rejected" | "call.timeout" | "call.ended"
) {
  if (messageClassify === "call.busy") {
    void callSoundPlayer.playOnce("busy");
    return;
  }
  if (messageClassify === "call.rejected") {
    void callSoundPlayer.playOnce("rejected");
    return;
  }
  if (messageClassify === "call.timeout") {
    void callSoundPlayer.playOnce("timeout");
    return;
  }
  void callSoundPlayer.playOnce("hangup");
}

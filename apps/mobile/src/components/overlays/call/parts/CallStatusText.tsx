import { Text, View } from "react-native";
import { useAppTheme } from "../../../../styles/app-styles";
import type { MobileCallUiSession } from "../../../../types/app";
import { useCallTimer } from "../hooks/useCallTimer";
import { WaitingDots } from "./WaitingDots";

export function CallStatusText(props: { callSession: MobileCallUiSession }) {
  const { styles } = useAppTheme();
  const callTimerText = useCallTimer(props.callSession);

  return (
    <View style={styles.callStatusLine}>
      <Text style={styles.callTimerText}>{callTimerText}</Text>
      {props.callSession.phase === "ringing" ? <WaitingDots /> : null}
    </View>
  );
}

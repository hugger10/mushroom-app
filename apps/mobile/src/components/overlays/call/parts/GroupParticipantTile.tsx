import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { RTCView } from "@livekit/react-native-webrtc";
import { useAppTheme } from "../../../../styles/app-styles";
import { AppAvatar } from "../../../ui";

/**
 * A single remote participant tile in the group-call grid. When the
 * participant publishes a live video track (`streamUrl` set and camera on) it
 * renders the real `RTCView`; otherwise it falls back to an avatar placeholder
 * with mic/camera status icons. `tileStyle` carries the parent-computed width
 * (responsive column count) and `isSpeaking` drives the active-speaker ring.
 */
export function GroupParticipantTile(props: {
  displayName: string;
  avatarUrl?: string | null;
  streamUrl: string | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSpeaking?: boolean;
  tileStyle?: StyleProp<ViewStyle>;
}) {
  const { styles } = useAppTheme();
  const showVideo = Boolean(props.streamUrl) && props.videoEnabled;
  const speakingStyle = props.isSpeaking ? styles.callGroupTileSpeaking : null;

  if (showVideo && props.streamUrl) {
    return (
      <View
        style={[styles.callGroupLocalVideoTile, props.tileStyle, speakingStyle]}
      >
        <RTCView
          streamURL={props.streamUrl}
          objectFit="cover"
          style={styles.callGroupLocalVideo}
        />
        <Text style={styles.callGroupLocalVideoLabel} numberOfLines={1}>
          {props.displayName}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.callGroupTile, props.tileStyle, speakingStyle]}>
      <AppAvatar
        label={props.displayName}
        imageUrl={props.avatarUrl}
        style={styles.callGroupAvatar}
        textStyle={styles.callGroupAvatarText}
      />
      <Text style={styles.callGroupTileTitle} numberOfLines={1}>
        {props.displayName}
      </Text>
      <View style={styles.callGroupMediaStateRow}>
        <Ionicons
          name={props.audioEnabled ? "mic" : "mic-off"}
          size={12}
          color="rgba(255,255,255,0.78)"
        />
        <Ionicons
          name={props.videoEnabled ? "videocam" : "videocam-off"}
          size={12}
          color="rgba(255,255,255,0.78)"
        />
      </View>
    </View>
  );
}

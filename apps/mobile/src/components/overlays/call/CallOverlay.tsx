import {
  CALL_MEDIA_TYPE_VIDEO,
  CALL_SCOPE_DIRECT,
  CALL_SCOPE_GROUP
} from "@mushroom/shared";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { RTCView, RTCPIPView } from "@livekit/react-native-webrtc";
import { useAppTheme } from "../../../styles/app-styles";
import { addPipModeChangeListener } from "../../../platform/pip";
import type {
  MobileCallUiSession,
  MobileGroupCallParticipantMedia
} from "../../../types/app";
import { AppAvatar } from "../../ui";
import { CallCircleButton } from "./parts/CallCircleButton";
import { CallStatusText } from "./parts/CallStatusText";
import { CallVideoPlaceholder } from "./parts/CallVideoPlaceholder";
import { GroupParticipantTile } from "./parts/GroupParticipantTile";

export function CallOverlay(props: {
  callSession: MobileCallUiSession | null;
  localCallStreamUrl: string | null;
  remoteCallStreamUrl: string | null;
  callIceInfo: {
    ice_servers: Array<unknown>;
    ttl_seconds: number;
  } | null;
  callRoomInfo: {
    room_name: string;
    max_participants: number;
    server_url: string;
  } | null;
  groupParticipantMedia?: MobileGroupCallParticipantMedia[];
  groupLocalSpeaking?: boolean;
  currentUserId?: number | null;
  /**
   * user_id → { nickname, avatarUrl } for the group being called, so remote
   * tiles can render real names/avatars instead of "用户 {id}" placeholders.
   */
  groupMemberDisplayMap?: Map<
    number,
    { nickname: string; avatarUrl: string | null }
  >;
  onEndCall: () => void;
  onClose: () => void;
  onToggleLocalMedia: (kind: "audio" | "video") => void;
  onRejectCall: () => void;
  onAcceptCall: () => void;
}) {
  const { t } = useTranslation();
  const { styles } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const slideAnim = useRef(new Animated.Value(48)).current;
  const [showRemoteAsMain, setShowRemoteAsMain] = useState(true);
  // True while the app is in a system Picture-in-Picture window (Android).
  // Drives a compact, video-only layout that hides chrome/controls.
  const [isInPipMode, setIsInPipMode] = useState(false);
  // When the group-call grid exceeds the visible-tile cap, the extra tiles
  // collapse into a "+N" tile. Tapping it expands the full grid.
  const [showAllRemoteTiles, setShowAllRemoteTiles] = useState(false);

  useEffect(() => {
    return addPipModeChangeListener(setIsInPipMode);
  }, []);

  // Reset the expanded group-call grid when a new call starts so the previous
  // call's expansion state does not leak into the next session.
  useEffect(() => {
    setShowAllRemoteTiles(false);
  }, [props.callSession?.call_id]);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: props.callSession ? 0 : 48,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [props.callSession, slideAnim]);

  useEffect(() => {
    setShowRemoteAsMain(Boolean(props.remoteCallStreamUrl));
  }, [props.remoteCallStreamUrl]);

  if (!props.callSession) {
    return null;
  }

  const callSession = props.callSession;
  const isIncomingRinging =
    callSession.direction === "incoming" && callSession.phase === "ringing";
  const canHangUp =
    callSession.phase === "ringing" || callSession.phase === "ongoing";
  const showVideoStage =
    callSession.call_scope === CALL_SCOPE_DIRECT &&
    callSession.media_type === CALL_MEDIA_TYPE_VIDEO;
  const showGroupStage = callSession.call_scope === CALL_SCOPE_GROUP;
  const mainStreamUrl =
    showRemoteAsMain && props.remoteCallStreamUrl
      ? props.remoteCallStreamUrl
      : props.localCallStreamUrl;
  const previewStreamUrl =
    showRemoteAsMain && props.remoteCallStreamUrl
      ? props.localCallStreamUrl
      : props.remoteCallStreamUrl;
  const canSwitchVideo = Boolean(
    props.localCallStreamUrl && props.remoteCallStreamUrl
  );

  // Group-call grid: prefer the live LiveKit participant media (real remote
  // audio/video from the SFU). Fall back to the server-authoritative
  // participant list (signaling-only placeholders) while the room is still
  // connecting or peers have not published media yet.
  const groupMedia = props.groupParticipantMedia ?? [];
  const hasLiveGroupMedia = groupMedia.length > 0;
  const groupRoomStatusText = props.callRoomInfo
    ? hasLiveGroupMedia
      ? t("ui.callOverlay.connected", { count: groupMedia.length })
      : t("ui.callOverlay.joinedRoom", {
          roomName: props.callRoomInfo.room_name
        })
    : t("ui.callOverlay.preparingRoom");

  // Resolve a participant's display info (nickname + avatar) from the
  // conversation member map so tiles never show bare "用户 {id}" / no avatar.
  const memberMap = props.groupMemberDisplayMap ?? new Map();
  const resolveMemberDisplay = (userId: number | null) => {
    if (userId === null || userId === undefined) {
      return { nickname: "", avatarUrl: null };
    }
    return (
      memberMap.get(Number(userId)) ?? {
        nickname: t("chatMessage.unknownUser", { id: userId }),
        avatarUrl: null
      }
    );
  };

  // Normalize remote participants into a deduped tile list. `participants`
  // (and LiveKit identities) are device-scoped — a user signed in on several
  // devices yields several entries — so we group by `user_id` and keep one
  // tile per person, preferring the device with live video / active speech.
  // Large groups are capped in the grid below, mirroring WhatsApp/WeChat.
  const buildRemoteTiles = (
    source:
      | MobileGroupCallParticipantMedia[]
      | MobileCallUiSession["participants"]
  ) => {
    const byUser = new Map<
      number,
      {
        key: string;
        displayName: string;
        avatarUrl: string | null;
        streamUrl: string | null;
        audioEnabled: boolean;
        videoEnabled: boolean;
        isSpeaking: boolean;
      }
    >();
    const push = (
      userId: number | null,
      tile: typeof byUser extends Map<number, infer T> ? T : never
    ) => {
      if (userId === null || userId === undefined) {
        return;
      }
      const existing = byUser.get(Number(userId));
      if (!existing) {
        byUser.set(Number(userId), tile);
        return;
      }
      const rank = (candidate: typeof tile) =>
        (candidate.isSpeaking ? 8 : 0) +
        (candidate.streamUrl && candidate.videoEnabled ? 4 : 0) +
        (candidate.videoEnabled ? 2 : 0);
      if (rank(tile) > rank(existing)) {
        byUser.set(Number(userId), tile);
      }
    };

    for (const participant of source) {
      if ("participant_identity" in participant) {
        const media = participant as MobileGroupCallParticipantMedia;
        const display = resolveMemberDisplay(media.user_id);
        const hasMapEntry =
          media.user_id !== null &&
          media.user_id !== undefined &&
          memberMap.has(Number(media.user_id));
        push(media.user_id, {
          key: media.participant_identity,
          displayName: hasMapEntry
            ? display.nickname
            : media.display_name || display.nickname,
          avatarUrl: display.avatarUrl,
          streamUrl: media.stream_url,
          audioEnabled: media.audio_enabled,
          videoEnabled: media.video_enabled,
          isSpeaking: media.is_speaking
        });
      } else {
        const callParticipant = participant;
        const isSelf =
          Number(callParticipant.user_id) === Number(props.currentUserId);
        if (isSelf) {
          continue;
        }
        const display = resolveMemberDisplay(callParticipant.user_id);
        push(callParticipant.user_id, {
          key: `${callParticipant.user_id}:${callParticipant.device_id}`,
          displayName: display.nickname,
          avatarUrl: display.avatarUrl,
          streamUrl: null,
          audioEnabled: callParticipant.audio_enabled !== false,
          videoEnabled: callParticipant.video_enabled === true,
          isSpeaking: false
        });
      }
    }

    // Active speakers first, then live-video tiles, then alphabetical.
    return Array.from(byUser.values()).sort((left, right) => {
      const leftRank =
        (left.isSpeaking ? 8 : 0) +
        (left.streamUrl && left.videoEnabled ? 4 : 0);
      const rightRank =
        (right.isSpeaking ? 8 : 0) +
        (right.streamUrl && right.videoEnabled ? 4 : 0);
      if (leftRank !== rightRank) {
        return rightRank - leftRank;
      }
      return left.displayName.localeCompare(right.displayName, "zh-Hans");
    });
  };

  const remoteTilesData = hasLiveGroupMedia
    ? buildRemoteTiles(groupMedia)
    : buildRemoteTiles(callSession.participants);

  // Adaptive grid: cap the number of visible tiles so a huge group call does
  // not flood the screen. The local tile always renders; the rest collapse
  // into a single "+N" tile. Tapping the overflow tile expands the grid.
  const MAX_VISIBLE_REMOTE_TILES = 6;
  const hiddenRemoteCount = Math.max(
    remoteTilesData.length - MAX_VISIBLE_REMOTE_TILES,
    0
  );
  const visibleRemoteTiles = showAllRemoteTiles
    ? remoteTilesData
    : remoteTilesData.slice(0, MAX_VISIBLE_REMOTE_TILES);
  const canExpand = hiddenRemoteCount > 0 && !showAllRemoteTiles;

  const totalTiles = visibleRemoteTiles.length + 1 + (canExpand ? 1 : 0);
  const columns = totalTiles <= 1 ? 1 : totalTiles <= 4 ? 2 : 3;
  const groupGridGap = 10;
  const groupGridContentWidth = windowWidth - 32;
  // Explicit pixel dimensions (not aspect-ratio %) so the tile always has a
  // resolved height inside the flex-wrap + gap grid.
  const tileWidth =
    columns === 1
      ? groupGridContentWidth
      : (groupGridContentWidth - groupGridGap * (columns - 1)) / columns;
  const tileStyle: ViewStyle = {
    width: tileWidth,
    height: columns === 1 ? Math.max(tileWidth * 0.75, 240) : tileWidth * 0.75
  };

  const remoteTiles = visibleRemoteTiles.map(tile => (
    <GroupParticipantTile
      key={tile.key}
      displayName={tile.displayName}
      avatarUrl={tile.avatarUrl}
      streamUrl={tile.streamUrl}
      audioEnabled={tile.audioEnabled}
      videoEnabled={tile.videoEnabled}
      isSpeaking={tile.isSpeaking}
      tileStyle={tileStyle}
    />
  ));

  const callControls = (
    <View style={styles.callFloatingControls}>
      {isIncomingRinging ? (
        <>
          <CallCircleButton
            icon="call"
            label={t("ui.callOverlay.reject")}
            tone="danger"
            onPress={props.onRejectCall}
          />
          <CallCircleButton
            icon="call"
            label={t("ui.callOverlay.accept")}
            tone="accept"
            onPress={props.onAcceptCall}
          />
        </>
      ) : canHangUp ? (
        <>
          {showVideoStage ? (
            <>
              <CallCircleButton
                icon={
                  callSession.local_audio_enabled === false ? "mic-off" : "mic"
                }
                label={t("ui.callOverlay.toggleMic")}
                active={callSession.local_audio_enabled !== false}
                onPress={() => props.onToggleLocalMedia("audio")}
              />
              <CallCircleButton
                icon={
                  callSession.local_video_enabled === false
                    ? "videocam-off"
                    : "videocam"
                }
                label={t("ui.callOverlay.toggleCamera")}
                active={callSession.local_video_enabled !== false}
                onPress={() => props.onToggleLocalMedia("video")}
              />
            </>
          ) : null}
          {showGroupStage && callSession.phase === "ongoing" ? (
            <>
              <CallCircleButton
                icon={
                  callSession.local_audio_enabled === false ? "mic-off" : "mic"
                }
                label={t("ui.callOverlay.toggleMic")}
                active={callSession.local_audio_enabled !== false}
                onPress={() => props.onToggleLocalMedia("audio")}
              />
              <CallCircleButton
                icon={
                  callSession.local_video_enabled === false
                    ? "videocam-off"
                    : "videocam"
                }
                label={t("ui.callOverlay.toggleCamera")}
                active={callSession.local_video_enabled !== false}
                onPress={() => props.onToggleLocalMedia("video")}
              />
            </>
          ) : null}
          <CallCircleButton
            icon="call"
            label={
              callSession.phase === "ongoing"
                ? t("ui.callOverlay.hangUp")
                : t("ui.callOverlay.cancelCall")
            }
            tone="danger"
            onPress={props.onEndCall}
          />
        </>
      ) : (
        <CallCircleButton
          icon="close"
          label={t("common.close")}
          onPress={props.onClose}
        />
      )}
    </View>
  );

  return (
    <Animated.View
      style={[
        styles.callScreenOverlay,
        {
          transform: [{ translateY: slideAnim }]
        }
      ]}
    >
      <View style={styles.callScreen}>
        {showGroupStage ? (
          <View style={styles.callGroupStage}>
            <View style={styles.callGroupHeader}>
              <Text style={styles.callPeerName}>
                {callSession.conversation_label}
              </Text>
              <CallStatusText callSession={callSession} />
              <Text style={styles.callGroupRoomText}>
                {groupRoomStatusText}
              </Text>
            </View>

            <ScrollView
              style={styles.callGroupScroll}
              contentContainerStyle={styles.callGroupScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {props.localCallStreamUrl &&
              callSession.media_type === CALL_MEDIA_TYPE_VIDEO &&
              callSession.local_video_enabled !== false ? (
                <View
                  style={[
                    styles.callGroupLocalVideoTile,
                    tileStyle,
                    props.groupLocalSpeaking
                      ? styles.callGroupTileSpeaking
                      : null
                  ]}
                >
                  <RTCView
                    streamURL={props.localCallStreamUrl}
                    mirror
                    objectFit="cover"
                    style={styles.callGroupLocalVideo}
                  />
                  <Text style={styles.callGroupLocalVideoLabel}>
                    {t("ui.callOverlay.me")}
                  </Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.callGroupTile,
                    tileStyle,
                    props.groupLocalSpeaking
                      ? styles.callGroupTileSpeaking
                      : null
                  ]}
                >
                  <AppAvatar
                    label={t("ui.callOverlay.me")}
                    imageUrl={null}
                    style={styles.callGroupAvatar}
                    textStyle={styles.callGroupAvatarText}
                  />
                  <Text style={styles.callGroupTileTitle}>
                    {t("ui.callOverlay.me")}
                  </Text>
                  <Text style={styles.callGroupTileSub}>
                    {callSession.local_participation_mode || "receive_only"}
                  </Text>
                  <View style={styles.callGroupMediaStateRow}>
                    <Ionicons
                      name={
                        callSession.local_audio_enabled === false
                          ? "mic-off"
                          : "mic"
                      }
                      size={12}
                      color="rgba(255,255,255,0.78)"
                    />
                    <Ionicons
                      name={
                        callSession.local_video_enabled === false
                          ? "videocam-off"
                          : "videocam"
                      }
                      size={12}
                      color="rgba(255,255,255,0.78)"
                    />
                  </View>
                </View>
              )}
              {remoteTiles}
              {canExpand ? (
                <Pressable
                  style={[
                    styles.callGroupTile,
                    tileStyle,
                    styles.callGroupMoreTile
                  ]}
                  onPress={() => setShowAllRemoteTiles(true)}
                  testID="group-call-more-tile"
                >
                  <Ionicons
                    name="people"
                    size={26}
                    color="rgba(255,255,255,0.85)"
                  />
                  <Text style={styles.callGroupTileTitle}>
                    {t("ui.callOverlay.memberCount", {
                      count: hiddenRemoteCount
                    })}
                  </Text>
                  <Text style={styles.callGroupTileSub}>
                    {t("ui.callOverlay.expand")}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
            {callControls}
          </View>
        ) : showVideoStage ? (
          <View style={styles.callVideoStage}>
            {mainStreamUrl ? (
              <RTCPIPView
                streamURL={mainStreamUrl}
                mirror={mainStreamUrl === props.localCallStreamUrl}
                objectFit="cover"
                style={styles.callRemoteVideo}
                // iOS-only: render the main (typically remote) video into a
                // system PiP window when the app backgrounds during a video
                // call. Android PiP is driven natively via MainActivity instead.
                iosPIP={{
                  enabled: true,
                  startAutomatically: true,
                  preferredSize: { width: 16, height: 9 }
                }}
              />
            ) : (
              <CallVideoPlaceholder
                label={callSession.conversation_label}
                imageUrl={callSession.conversation_avatar_url}
              />
            )}

            {!isInPipMode ? (
              <View style={styles.callTopOverlay}>
                <Text style={styles.callPeerName}>
                  {callSession.conversation_label}
                </Text>
                <CallStatusText callSession={callSession} />
              </View>
            ) : null}

            {!isInPipMode && previewStreamUrl ? (
              <Pressable
                style={styles.callLocalPreview}
                onPress={() =>
                  canSwitchVideo && setShowRemoteAsMain(value => !value)
                }
              >
                <RTCView
                  mirror={previewStreamUrl === props.localCallStreamUrl}
                  zOrder={1}
                  streamURL={previewStreamUrl}
                  objectFit="cover"
                  style={styles.callLocalVideo}
                />
              </Pressable>
            ) : null}

            {!isInPipMode ? callControls : null}
          </View>
        ) : (
          <View style={styles.callAudioHero}>
            {props.remoteCallStreamUrl ? (
              <RTCView
                streamURL={props.remoteCallStreamUrl}
                objectFit="cover"
                style={styles.callHiddenAudioStream}
              />
            ) : null}
            <AppAvatar
              label={callSession.conversation_label}
              imageUrl={callSession.conversation_avatar_url}
              style={styles.callAudioAvatar}
              textStyle={styles.callAudioAvatarText}
            />
            <Text style={styles.callAudioHeroTitle}>
              {callSession.conversation_label}
            </Text>
            <View style={styles.callAudioStatusLine}>
              <CallStatusText callSession={callSession} />
            </View>
            {callControls}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

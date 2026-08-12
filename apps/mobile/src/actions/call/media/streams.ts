import type { MediaStream } from "@livekit/react-native-webrtc";
import type { CallIceServerConfig } from "@mushroom/shared";
import { mobileServerApi } from "../../../services/app-runtime";
import type { MobileAppState } from "../../../app/controller/useMobileAppState";

export type IceServerList = CallIceServerConfig[];

export function disposeStream(
  stream: MediaStream | null,
  options: { stopTracks: boolean }
) {
  if (!stream) {
    return;
  }

  if (options.stopTracks) {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Ignore track stop failures during teardown.
      }
    }
  }
}

export function createStreamReplacers(state: MobileAppState) {
  function replaceLocalCallStream(stream: MediaStream | null) {
    const current = state.localCallStreamRef.current;
    if (current && current !== stream) {
      disposeStream(current, { stopTracks: true });
    }

    state.localCallStreamRef.current = stream;
    state.setLocalCallStreamUrl(stream ? stream.toURL() : null);
  }

  function replaceRemoteCallStream(stream: MediaStream | null) {
    const current = state.remoteCallStreamRef.current;
    if (current && current !== stream) {
      disposeStream(current, { stopTracks: false });
    }

    state.remoteCallStreamRef.current = stream;
    state.setRemoteCallStreamUrl(stream ? stream.toURL() : null);
  }

  return { replaceLocalCallStream, replaceRemoteCallStream };
}

export function createIceServerResolver(state: MobileAppState) {
  return async function resolveIceServers(): Promise<IceServerList> {
    if (state.callIceInfo?.ice_servers?.length) {
      return state.callIceInfo.ice_servers;
    }

    try {
      const result = await mobileServerApi.getCallIceConfig();
      state.setCallIceInfo(result.data);
      return result.data.ice_servers;
    } catch {
      return [{ urls: ["stun:stun.l.google.com:19302"] }];
    }
  };
}

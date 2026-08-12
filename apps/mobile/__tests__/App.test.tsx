/**
 * @format
 */

import React from "react";
import ReactTestRenderer from "react-test-renderer";
import { View } from "react-native";
import App from "../main";

jest.mock("react-native-vector-icons/Ionicons", () => "Ionicons");
jest.mock("react-native-vector-icons/FontAwesome", () => "FontAwesome");

jest.mock("@react-native-clipboard/clipboard", () => ({
  setString: jest.fn(),
  getString: jest.fn().mockResolvedValue("")
}));

const mockReact = React;
const mockView = View;

jest.mock("@livekit/react-native-webrtc", () => {
  return {
    RTCView: (props: Record<string, unknown>) =>
      mockReact.createElement(mockView, props),
    mediaDevices: {
      getUserMedia: jest.fn().mockResolvedValue(null)
    },
    MediaStream: jest.fn(),
    MediaStreamTrack: jest.fn(),
    RTCPeerConnection: jest.fn(),
    RTCIceCandidate: jest.fn(),
    RTCSessionDescription: jest.fn(),
    registerGlobals: jest.fn()
  };
});

jest.mock("@livekit/react-native", () => ({
  registerGlobals: jest.fn(),
  AudioSession: {
    startAudioSession: jest.fn().mockResolvedValue(undefined),
    stopAudioSession: jest.fn().mockResolvedValue(undefined)
  }
}));

const mockSnapshot = {
  auth: {
    accessToken: null,
    refreshToken: null,
    user: null,
    profile: null
  },
  checkpoints: {
    contacts: null,
    conversations: null,
    messageStates: null
  },
  data: {
    contacts: [],
    conversations: [],
    messagesByConversation: {}
  },
  metrics: {
    syncedContacts: 0,
    syncedConversations: 0,
    syncedMessages: 0,
    syncedMessageStates: 0,
    completedAt: null,
    syncing: false
  }
};

jest.mock("../src/services/app-runtime", () => ({
  mobileApiBaseUrl: "http://127.0.0.1:9100",
  mobileWsUrl: "ws://127.0.0.1:9100/ws",
  mobileAppController: {
    bootstrap: jest.fn().mockResolvedValue(undefined),
    snapshot: jest.fn().mockResolvedValue(mockSnapshot),
    subscribe: jest.fn(listener => {
      listener(mockSnapshot);
      return jest.fn();
    }),
    login: jest.fn(),
    register: jest.fn(),
    refreshAuth: jest.fn(),
    refreshProfile: jest.fn(),
    syncNow: jest.fn(),
    logout: jest.fn(),
    updateProfile: jest.fn(),
    getManagedDevices: jest.fn().mockResolvedValue({
      current_device_id: "rn-test",
      devices: []
    }),
    getSecurityEvents: jest.fn().mockResolvedValue({
      events: []
    }),
    disableDevice: jest.fn(),
    restoreDevice: jest.fn(),
    logoutManagedDevice: jest.fn(),
    logoutOtherDevices: jest.fn(),
    logoutAllManagedDevices: jest.fn(),
    setActiveConversation: jest.fn(),
    saveConversationDraft: jest.fn(),
    createOptimisticTextMessage: jest.fn(),
    createOptimisticAttachmentMessage: jest.fn(),
    createOptimisticPendingAttachmentMessage: jest.fn(),
    patchAttachmentUploaded: jest.fn(),
    markAttachmentUploadFailed: jest.fn(),
    markAttachmentUploadRetrying: jest.fn(),
    createOptimisticVoiceMessage: jest.fn(),
    createOptimisticForwardMessage: jest.fn(),
    confirmMessageAck: jest.fn(),
    failMessageSend: jest.fn(),
    getConversationByPeerId: jest.fn().mockResolvedValue(null),
    toggleFavoriteMessage: jest.fn(),
    togglePinMessage: jest.fn(),
    recallMessage: jest.fn(),
    clearConversationMessages: jest.fn(),
    searchMessages: jest.fn().mockResolvedValue([]),
    listAttachmentMessages: jest.fn().mockResolvedValue([]),
    deleteContact: jest.fn(),
    blockUser: jest.fn(),
    unblockUser: jest.fn(),
    addGroupMembers: jest.fn(),
    removeGroupMember: jest.fn(),
    updateGroupMemberRole: jest.fn(),
    updateGroupMemberMute: jest.fn(),
    transferGroupOwner: jest.fn(),
    updateGroupProfile: jest.fn(),
    updateGroupAnnouncement: jest.fn(),
    updateGroupSettings: jest.fn(),
    leaveConversation: jest.fn(),
    disbandConversation: jest.fn()
  },
  uploadMobileFile: jest.fn(),
  uploadMobileAvatarFile: jest.fn(),
  updateMobilePushRegistration: jest.fn(),
  registerCurrentMobileDevice: jest.fn().mockResolvedValue(undefined),
  ensureMobileFreshAccessToken: jest.fn().mockResolvedValue(null),
  getMobilePushDeviceState: jest.fn().mockReturnValue(null),
  mobileDeviceId: "rn-test-device",
  mobileDeviceInfo: {
    device_id: "rn-test-device",
    platform: "ios",
    model: "test"
  },
  mobileServerApi: {
    getUserProfile: jest.fn().mockResolvedValue({
      data: {
        id: 2,
        username: "bob",
        nickname: "Bob",
        avatar_url: null,
        signature: "",
        gender: 0
      }
    }),
    getUsersPresence: jest.fn().mockResolvedValue({
      data: []
    }),
    getCallIceConfig: jest.fn(),
    getCallRoomConfig: jest.fn(),
    searchUsers: jest.fn().mockResolvedValue({
      data: []
    }),
    createDirectConversation: jest.fn().mockResolvedValue({
      data: null
    }),
    createConversation: jest.fn().mockResolvedValue({
      data: {
        id: "server-conversation-new"
      }
    })
  },
  mobileRealtimeClient: {
    addStatusListener: jest.fn(listener => {
      listener({
        status: "idle",
        attempt: 0,
        maxAttempts: 5
      });
      return jest.fn();
    }),
    addMessageListener: jest.fn(() => jest.fn()),
    connect: jest.fn(),
    disconnect: jest.fn(),
    sendChatMessage: jest.fn(),
    sendMessage: jest.fn()
  }
}));

jest.mock("react-native-audio-recorder-player", () => ({
  __esModule: true,
  default: {
    setSubscriptionDuration: jest.fn(),
    addRecordBackListener: jest.fn(),
    removeRecordBackListener: jest.fn(),
    startRecorder: jest.fn(),
    stopRecorder: jest.fn().mockResolvedValue("file:///tmp/test.m4a"),
    addPlayBackListener: jest.fn(),
    removePlayBackListener: jest.fn(),
    addPlaybackEndListener: jest.fn(),
    removePlaybackEndListener: jest.fn(),
    startPlayer: jest.fn(),
    stopPlayer: jest.fn().mockResolvedValue("stopped")
  },
  AudioEncoderAndroidType: {
    AAC: 3
  },
  AudioSourceAndroidType: {
    MIC: 1
  },
  AVEncoderAudioQualityIOSType: {
    high: 96
  },
  OutputFormatAndroidType: {
    MPEG_4: 2
  }
}));

jest.mock("react-native-permissions", () => ({
  PERMISSIONS: {
    IOS: {
      MICROPHONE: "ios.permission.MICROPHONE",
      CAMERA: "ios.permission.CAMERA"
    },
    ANDROID: {
      RECORD_AUDIO: "android.permission.RECORD_AUDIO",
      CAMERA: "android.permission.CAMERA"
    }
  },
  RESULTS: {
    GRANTED: "granted",
    LIMITED: "limited"
  },
  check: jest.fn().mockResolvedValue("granted"),
  request: jest.fn().mockResolvedValue("granted")
}));

test("renders correctly", async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
  });
});

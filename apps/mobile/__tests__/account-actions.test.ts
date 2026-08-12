jest.mock("../src/services/app-runtime", () => {
  const helpers = jest.requireActual("./helpers/mobile-test-helpers");
  return helpers.mobileAppModuleMock;
});

jest.mock("../src/platform/native-pickers", () => ({
  pickAvatarImage: jest.fn().mockResolvedValue(null)
}));

jest.mock("../src/platform/address-book", () => ({
  readAddressBookPhoneCandidates: jest.fn()
}));

import { Alert } from "react-native";
import { readAddressBookPhoneCandidates } from "../src/platform/address-book";
import {
  openMobileSQLiteForUser,
  closeActiveMobileSQLiteConnection
} from "../src/data/sqlite-connection";
import { createAccountSessionActions } from "../src/actions/account/account-session-actions";
import { createContactActions } from "../src/actions/account/contact-actions";
import { createGroupActions } from "../src/actions/account/group-actions";
import {
  createMockConversation,
  createMockDevice,
  createMockState,
  createRunAction,
  mobileAppControllerMock,
  mobileRealtimeClientMock,
  mobileServerApiMock,
  resetMobileMocks
} from "./helpers/mobile-test-helpers";

const readAddressBookPhoneCandidatesMock =
  readAddressBookPhoneCandidates as jest.Mock;

describe("mobile account and group actions", () => {
  beforeEach(() => {
    resetMobileMocks();
    // 部分 action（如 refreshAddressBookMatches）会触达 SQLite，需要先绑定用户连接。
    closeActiveMobileSQLiteConnection();
    openMobileSQLiteForUser("test-user");
    readAddressBookPhoneCandidatesMock.mockResolvedValue({
      permission: "authorized",
      candidates: []
    });
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => {
    closeActiveMobileSQLiteConnection();
    jest.restoreAllMocks();
  });

  test("refreshMeData populates devices and security events", async () => {
    const state = createMockState();
    const runAction = createRunAction(state);
    mobileAppControllerMock.getManagedDevices.mockResolvedValue({
      current_device_id: "device-1",
      devices: [createMockDevice({ device_id: "device-2" })]
    });
    mobileAppControllerMock.getSecurityEvents.mockResolvedValue({
      events: [{ id: 1, action: "login" }]
    });
    mobileAppControllerMock.getPrivacySettings.mockResolvedValue({
      settings: {
        discoverable_by_username: 1,
        discoverable_by_phone: 2,
        message_permission: 1
      }
    });
    const actions = createAccountSessionActions({ state, runAction });

    await actions.refreshMeData();

    expect(state.devices).toEqual([
      expect.objectContaining({ device_id: "device-2" })
    ]);
    expect(state.securityEvents).toEqual([{ id: 1, action: "login" }]);
    expect(state.privacySettings).toEqual({
      discoverable_by_username: 1,
      discoverable_by_phone: 2,
      message_permission: 1
    });
    expect(state.devicesLoading).toBe(false);
    expect(state.status.text).toBe("账号资料、设备与安全动态已刷新");
    // refreshMeData runs as a background auto-refresh when the user lands on
    // the "Me" tab — it must stay `silent` so it does not flash a toast.
    expect(state.status.level).toBe("silent");
  });

  test("handleUpdatePrivacySetting persists one privacy rule", async () => {
    const state = createMockState();
    const runAction = createRunAction(state);
    mobileAppControllerMock.updatePrivacySettings.mockResolvedValue({
      settings: {
        discoverable_by_username: 0,
        discoverable_by_phone: 1,
        message_permission: 2
      }
    });
    const actions = createAccountSessionActions({ state, runAction });

    await actions.handleUpdatePrivacySetting("message_permission", 2);

    expect(mobileAppControllerMock.updatePrivacySettings).toHaveBeenCalledWith({
      message_permission: 2
    });
    expect(state.privacySettings).toEqual({
      discoverable_by_username: 0,
      discoverable_by_phone: 1,
      message_permission: 2
    });
    expect(state.status.text).toBe("");
  });

  test("handleChangePassword calls account security API and refreshes data", async () => {
    const state = createMockState();
    const runAction = createRunAction(state);
    const actions = createAccountSessionActions({ state, runAction });

    await actions.handleChangePassword({
      currentPassword: "123456",
      newPassword: "654321"
    });

    expect(mobileAppControllerMock.changePassword).toHaveBeenCalledWith({
      current_password: "123456",
      new_password: "654321"
    });
    expect(mobileAppControllerMock.getManagedDevices).toHaveBeenCalled();
    expect(mobileAppControllerMock.getSecurityEvents).toHaveBeenCalledWith(20);
    expect(state.status.text).toBe("密码已修改，其他设备需要重新登录");
  });

  test("handleSaveProfile validates nickname and persists trimmed profile", async () => {
    const invalidState = createMockState({
      profileForm: {
        nickname: "   ",
        email: "",
        phone: "",
        birthday: "",
        signature: "hello"
      }
    });
    const invalidRunAction = createRunAction(invalidState);
    const invalidActions = createAccountSessionActions({
      state: invalidState,
      runAction: invalidRunAction
    });

    const invalidSaved = await invalidActions.handleSaveProfile();

    expect(invalidSaved).toBe(false);
    expect(invalidState.error).toBe("昵称不能为空。");
    expect(invalidRunAction).not.toHaveBeenCalled();

    const state = createMockState({
      profileForm: {
        nickname: "  Alice  ",
        email: "  alice@example.test  ",
        phone: "  13800138000  ",
        birthday: "  1990-01-02  ",
        signature: "  hi  "
      }
    });
    const runAction = createRunAction(state);
    const actions = createAccountSessionActions({ state, runAction });

    const saved = await actions.handleSaveProfile();

    expect(saved).toBe(true);
    expect(mobileAppControllerMock.updateProfile).toHaveBeenCalledWith({
      nickname: "Alice",
      email: "alice@example.test",
      phone: "13800138000",
      birthday: "1990-01-02",
      signature: "hi"
    });
    expect(state.status.text).toBe("资料已保存");
  });

  test("handleSaveProfile accepts a patch from field editors", async () => {
    const state = createMockState({
      profileForm: {
        nickname: "Alice",
        email: "",
        phone: "",
        birthday: "",
        signature: ""
      }
    });
    const runAction = createRunAction(state);
    const actions = createAccountSessionActions({ state, runAction });

    // Field editors pass the freshly typed value so the server sync never
    // depends on React state timing inside the shared profile form.
    const saved = await actions.handleSaveProfile({ nickname: "Bob" });

    expect(saved).toBe(true);
    expect(mobileAppControllerMock.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ nickname: "Bob" })
    );
  });

  test("resetToLoggedOutState clears volatile mobile UI state", () => {
    const state = createMockState({
      activeConversationId: "conversation-2",
      composerText: "draft",
      replyTargetId: "reply-1",
      selectedMessageId: "selected-1",
      forwardingMessageId: "forward-1",
      searchKeyword: "report",
      searchResults: [{ id: 1 }],
      workspaceSearchVisible: true,
      workspaceSearchKeyword: "global",
      attachmentCenterVisible: true,
      previewImageUrl: "https://example.test/photo.jpg",
      previewImageName: "photo.jpg",
      highlightedMessageId: "message-3",
      groupManageVisible: true,
      devices: [createMockDevice()],
      securityEvents: [{ id: 1 }],
      privacySettings: {
        discoverable_by_username: 0,
        discoverable_by_phone: 1,
        message_permission: 1
      },
      voicePlayingMessageId: "voice-1",
      voicePlayingPositionMs: 1200,
      voiceRecordingActive: true,
      voiceRecordingElapsedMs: 2200,
      voiceRecordingWaveform: [0.2, 0.4]
    });
    const runAction = createRunAction(state);
    const actions = createAccountSessionActions({ state, runAction });

    actions.resetToLoggedOutState();

    expect(state.activeConversationId).toBeNull();
    expect(state.composerText).toBe("");
    expect(state.replyTargetId).toBeNull();
    expect(state.selectedMessageId).toBeNull();
    expect(state.forwardingMessageId).toBeNull();
    expect(state.searchKeyword).toBe("");
    expect(state.searchResults).toEqual([]);
    expect(state.attachmentCenterVisible).toBe(false);
    expect(state.previewImageUrl).toBeNull();
    expect(state.highlightedMessageId).toBeNull();
    expect(state.devices).toEqual([]);
    expect(state.securityEvents).toEqual([]);
    expect(state.privacySettings).toBeNull();
    expect(state.voicePlayingMessageId).toBeNull();
    expect(state.voicePlayingPositionMs).toBe(0);
    expect(state.voiceRecordingActive).toBe(false);
    expect(state.dismissCallSessionNow).toHaveBeenCalledTimes(1);
    expect(state.tab).toBe("chats");
  });

  test("logout and device management branch correctly for current device", async () => {
    const state = createMockState();
    const runAction = createRunAction(state);
    const actions = createAccountSessionActions({ state, runAction });
    const currentDevice = createMockDevice({
      device_id: "device-1",
      is_current_device: true
    });

    await actions.handleLogoutAllDevices();
    await actions.handleDisableDevice(currentDevice);
    await actions.handleLogoutManagedDevice(currentDevice);

    expect(
      mobileAppControllerMock.logoutAllManagedDevices
    ).toHaveBeenCalledTimes(1);
    // WS 断开改由 mobileAppController.logout → onUserUnbound → teardownActiveSession
    // 兜底；UI 层不再直接调用 disconnect，以避免登出过程中 ConnectionBanner 闪现。
    expect(mobileRealtimeClientMock.disconnect).not.toHaveBeenCalled();
    expect(mobileAppControllerMock.logout).toHaveBeenCalledTimes(3);
  });

  test("restore device refreshes me data after restore succeeds", async () => {
    const state = createMockState();
    const runAction = createRunAction(state);
    mobileAppControllerMock.getManagedDevices.mockResolvedValue({
      current_device_id: "device-1",
      devices: [createMockDevice({ device_id: "device-2" })]
    });
    const actions = createAccountSessionActions({ state, runAction });

    await actions.handleRestoreDevice(
      createMockDevice({ device_id: "device-2" })
    );

    expect(mobileAppControllerMock.restoreDevice).toHaveBeenCalledWith(
      "device-2"
    );
    expect(mobileAppControllerMock.getManagedDevices).toHaveBeenCalled();
  });

  test("refreshAddressBookMatches shows permission and empty-match feedback", async () => {
    const state = createMockState();
    const runAction = createRunAction(state);
    const actions = createContactActions({ state, runAction });

    readAddressBookPhoneCandidatesMock.mockResolvedValueOnce({
      permission: "denied",
      candidates: []
    });
    await actions.refreshAddressBookMatches();

    expect(Alert.alert).toHaveBeenCalledWith(
      "需要通讯录权限",
      "请在系统设置中允许访问通讯录，用于匹配已注册用户。",
      expect.any(Array)
    );
    expect(state.addressBookPermission).toBe("denied");
    expect(state.addressBookMatches).toEqual([]);
    expect(mobileServerApiMock.matchContacts).not.toHaveBeenCalled();

    (Alert.alert as jest.Mock).mockClear();
    readAddressBookPhoneCandidatesMock.mockResolvedValueOnce({
      permission: "authorized",
      candidates: [
        {
          phone_e164: "+8613800138000",
          local_display_name: "Alice"
        }
      ]
    });
    await actions.refreshAddressBookMatches();

    expect(mobileServerApiMock.matchContacts).toHaveBeenCalledWith({
      phones: ["+8613800138000"]
    });
    // 主流 IM 风格：无新匹配时不弹窗。
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(state.addressBookPermission).toBe("authorized");
    expect(state.addressBookMatches).toEqual([]);
  });

  test("group role checks and group profile validation behave correctly", async () => {
    const activeConversation = createMockConversation({
      type: 2,
      client_conversation_id: "group-1"
    });
    const state = createMockState({
      activeConversation,
      currentGroupMember: {
        user_id: 1,
        role: 2
      },
      snapshot: {
        auth: {
          user: {
            userId: 1
          }
        }
      },
      groupNameDraft: "   "
    });
    const runAction = createRunAction(state);
    const closeConversationDetail = jest.fn();
    const actions = createGroupActions({
      state,
      runAction,
      closeConversationDetail
    });

    expect(actions.canManageGroupMember(2, 1)).toBe(true);
    expect(actions.canManageGroupMember(2, 2)).toBe(false);
    expect(actions.canManageGroupMember(1, 0)).toBe(false);

    await actions.handleSaveGroupProfile();
    expect(state.error).toBe("群名称不能为空。");
    expect(runAction).not.toHaveBeenCalled();
  });

  test("group actions validate selection and dispatch mutations", async () => {
    const activeConversation = createMockConversation({
      type: 2,
      client_conversation_id: "group-2"
    });
    const state = createMockState({
      activeConversation,
      groupNameDraft: "研发群",
      groupDescriptionDraft: "移动端",
      groupAnnouncementDraft: "今晚发版",
      groupMuteAll: true,
      groupInvitePermission: "admins_only",
      groupProfileEditPermission: "owner_only",
      selectedAddMemberIds: []
    });
    const runAction = createRunAction(state);
    const closeConversationDetail = jest.fn();
    const actions = createGroupActions({
      state,
      runAction,
      closeConversationDetail
    });

    await actions.handleAddSelectedMembers();
    expect(state.error).toBe("请先选择要邀请的联系人。");

    state.setSelectedAddMemberIds([2, 3]);
    await actions.handleSaveGroupProfile();
    await actions.handleSaveGroupAnnouncement();
    await actions.handleSaveGroupSettings();
    await actions.handleAddSelectedMembers();
    await actions.handleToggleGroupMemberRole(2, 1);
    await actions.handleUpdateGroupMemberMute(2, 60);

    expect(mobileAppControllerMock.updateGroupProfile).toHaveBeenCalledWith(
      "group-2",
      {
        name: "研发群",
        description: "移动端"
      }
    );
    expect(
      mobileAppControllerMock.updateGroupAnnouncement
    ).toHaveBeenCalledWith("group-2", "今晚发版");
    expect(mobileAppControllerMock.updateGroupSettings).toHaveBeenCalledWith(
      "group-2",
      {
        mute_all: true,
        invite_permission: "admins_only",
        profile_edit_permission: "owner_only"
      }
    );
    expect(mobileAppControllerMock.addGroupMembers).toHaveBeenCalledWith(
      "group-2",
      [2, 3]
    );
    expect(mobileAppControllerMock.updateGroupMemberRole).toHaveBeenCalledWith(
      "group-2",
      2,
      1
    );
    expect(mobileAppControllerMock.updateGroupMemberMute).toHaveBeenCalledWith(
      "group-2",
      2,
      60
    );
  });

  test("group destructive actions confirm before mutating", async () => {
    const activeConversation = createMockConversation({
      type: 2,
      client_conversation_id: "group-3"
    });
    const state = createMockState({
      activeConversation
    });
    const runAction = createRunAction(state);
    const closeConversationDetail = jest.fn();
    const actions = createGroupActions({
      state,
      runAction,
      closeConversationDetail
    });

    actions.handleRemoveGroupMember(2, "Bob");
    let buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    await buttons[1].onPress();

    actions.handleTransferGroupOwner(3, "Carol");
    buttons = (Alert.alert as jest.Mock).mock.calls[1][2];
    await buttons[1].onPress();

    actions.handleLeaveActiveGroup();
    buttons = (Alert.alert as jest.Mock).mock.calls[2][2];
    await buttons[1].onPress();

    expect(mobileAppControllerMock.removeGroupMember).toHaveBeenCalledWith(
      "group-3",
      2
    );
    expect(mobileAppControllerMock.transferGroupOwner).toHaveBeenCalledWith(
      "group-3",
      3
    );
    expect(mobileAppControllerMock.leaveConversation).toHaveBeenCalledWith(
      "group-3"
    );
    expect(closeConversationDetail).toHaveBeenCalledTimes(1);
  });
});

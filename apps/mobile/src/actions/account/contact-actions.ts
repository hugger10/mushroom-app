import { Alert, Linking } from "react-native";
import type {
  ContactListItem,
  UserProfile,
  UserSearchMode,
  UserSearchResult
} from "@mushroom/shared";
import log from "../../utils/log";
import {
  readAddressBookPhoneCandidates,
  type AddressBookPhoneCandidate
} from "../../platform/address-book";
import {
  replaceAddressBookMatchCache,
  type AddressBookMatchCacheEntry
} from "../../data/address-book-match-cache";
import {
  mobileAppController,
  mobileServerApi
} from "../../services/app-runtime";
import type { RunAction } from "../action-types";
import type { MobileAppState } from "../../app/controller/useMobileAppState";
import { getReadableErrorMessage } from "../../utils/error-message";
import { i18n } from "../../i18n";

export function createContactActions(params: {
  state: MobileAppState;
  runAction: RunAction;
}) {
  const { state, runAction } = params;

  async function handleBlockUser(
    userId: number,
    _displayName?: string
  ): Promise<void> {
    // 确认弹窗已在调用方（PeerProfileScreen）中处理，此处直接执行屏蔽。
    // 返回 runAction 的 Promise，让上层 UI（如 PeerProfileScreen.blockActionPending）
    // 能在网络请求真正完成后再解除按钮禁用；避免 fire-and-forget 导致 UI 防抖失效。
    await runAction("", () => mobileAppController.blockUser(userId), "");
  }

  function handleBlockContact(contact: ContactListItem): Promise<void> {
    return handleBlockUser(
      contact.user_id,
      contact.nickname || contact.username || undefined
    );
  }

  function handleUnblockContact(contact: ContactListItem): Promise<void> {
    return handleUnblockUser(
      contact.user_id,
      contact.nickname || contact.username || undefined
    );
  }

  async function handleUnblockUser(
    userId: number,
    displayName?: string
  ): Promise<void> {
    const _label =
      displayName?.trim() || i18n.t("display.unknownUser", { id: userId });
    // 返回 runAction 的 Promise，让上层 UI 能等到网络完成再解除禁用。
    await runAction("", () => mobileAppController.unblockUser(userId), "");
  }

  async function handleUpdateContactRemark(input: {
    userId: number;
    remarkName: string;
  }) {
    await runAction(
      "",
      () =>
        mobileAppController.updateContact(input.userId, {
          remark_name: input.remarkName.trim() || undefined
        }),
      ""
    );
  }

  function handleDeleteContact(userId: number, _displayName?: string) {
    // 确认弹窗已在调用方（PeerProfileScreen）中处理，此处直接执行删除
    void runAction("", () => mobileAppController.deleteContact(userId), "");
  }

  async function searchUsers(
    keyword: string,
    options?: { mode?: UserSearchMode }
  ): Promise<UserSearchResult[]> {
    const result = await mobileServerApi.searchUsers({
      keyword: keyword.trim(),
      default_country_code: "+86",
      mode: options?.mode
    });
    return result.data;
  }

  async function lookupContactByPhone(input: {
    phoneE164: string;
    defaultCountryCode?: string;
  }): Promise<{
    matched: boolean;
    phoneE164: string;
    user: UserSearchResult | null;
  }> {
    const result = await mobileServerApi.lookupContactByPhone({
      phone_e164: input.phoneE164,
      default_country_code: input.defaultCountryCode
    });
    return {
      matched: result.data.matched,
      phoneE164: result.data.phone_e164,
      user: result.data.user ?? null
    };
  }

  async function addContact(input: {
    userId: number;
    remarkName?: string;
    source?: string;
  }) {
    state.setPending(true);
    state.setError("");
    try {
      await mobileServerApi.saveContact({
        contact_user_id: input.userId,
        remark_name: input.remarkName,
        source: input.source ?? "manual"
      });
      await mobileAppController.syncNow();
    } catch (currentError) {
      const readableError = getReadableErrorMessage(currentError);
      state.setError(readableError);
      state.setStatus(readableError);
      throw currentError;
    } finally {
      state.setPending(false);
    }
  }

  async function getUserProfile(userId: number): Promise<UserProfile> {
    const result = await mobileServerApi.getUserProfile(userId);
    return result.data;
  }

  async function startDirectConversation(userId: number) {
    await mobileServerApi.createDirectConversation({
      target_user_id: userId
    });
    await mobileAppController.syncNow();
  }

  async function performAddressBookMatch(options: {
    silent: boolean;
    isCancelled?: () => boolean;
  }) {
    const isCancelled = () => options.isCancelled?.() === true;
    const { permission, candidates } = await readAddressBookPhoneCandidates();
    if (isCancelled()) return;
    state.setAddressBookPermission(permission);

    if (permission !== "authorized") {
      if (isCancelled()) return;
      await replaceAddressBookMatchCache([]);
      if (isCancelled()) return;
      state.setAddressBookMatches([]);
      // 仅在用户主动触发刷新时，对 denied 状态做引导（跳系统设置）。
      // 静默刷新（启动 / 后台回前台）保持安静，由 UI 卡片自行展示授权引导。
      if (!options.silent && permission === "denied") {
        Alert.alert(
          i18n.t("accountActions.contactPermissionTitle"),
          i18n.t("accountActions.contactPermissionMessage"),
          [
            { text: i18n.t("common.cancel"), style: "cancel" },
            {
              text: i18n.t("accountActions.goToSettings"),
              onPress: () => Linking.openSettings()
            }
          ]
        );
      }
      return;
    }

    if (candidates.length === 0) {
      if (isCancelled()) return;
      await replaceAddressBookMatchCache([]);
      if (isCancelled()) return;
      state.setAddressBookMatches([]);
      // 主流 IM (Telegram/WhatsApp) 风格：无可匹配号码时静默处理，不弹窗。
      return;
    }

    const existingContactUserIds = new Set(
      (state.availableContacts ?? []).map(contact => Number(contact.user_id))
    );
    const candidateByPhone = new Map(
      candidates.map(candidate => [candidate.phone_e164, candidate])
    );
    const matchedResult = await mobileServerApi.matchContacts({
      phones: candidates.map(candidate => candidate.phone_e164)
    });
    if (isCancelled()) return;
    const matchedAt = new Date().toISOString();
    const nextMatches = matchedResult.data.matched_users
      .filter(user => !existingContactUserIds.has(Number(user.user_id || 0)))
      .map(user =>
        toAddressBookMatchEntry(
          user,
          candidateByPhone.get(user.phone_e164),
          matchedAt
        )
      )
      .filter((entry): entry is AddressBookMatchCacheEntry => entry !== null);

    if (isCancelled()) return;
    await replaceAddressBookMatchCache(nextMatches);
    if (isCancelled()) return;
    state.setAddressBookMatches(nextMatches);
    // 主流 IM 风格：刷新成功后无新匹配时不弹窗。
  }

  async function refreshAddressBookMatches(options?: {
    silent?: boolean;
    isCancelled?: () => boolean;
  }) {
    const silent = options?.silent === true;
    const isCancelled = options?.isCancelled;
    state.setAddressBookSyncing(true);
    try {
      if (silent) {
        // 静默刷新：不显示进度文案、不显示成功 toast、错误也只静默吞掉。
        // 通过 isCancelled 守卫避免 in-flight 请求 resolve 时把过期数据写入 state / SQLite 缓存（例如登出途中）。
        try {
          await performAddressBookMatch({ silent: true, isCancelled });
        } catch (error) {
          if (__DEV__) {
            log.scope("address-book").warn("silent refresh failed", error);
          }
        }
      } else {
        await runAction(
          "",
          () => performAddressBookMatch({ silent: false, isCancelled }),
          ""
        );
      }
    } finally {
      state.setAddressBookSyncing(false);
    }
  }

  async function saveAddressBookContact(entry: AddressBookMatchCacheEntry) {
    await runAction(
      "",
      async () => {
        await mobileServerApi.saveContact({
          contact_user_id: entry.matched_user_id,
          remark_name: entry.local_display_name,
          source: "phone_book"
        });
        await mobileAppController.syncNow();
        const nextMatches = state.addressBookMatches.filter(
          item => item.matched_user_id !== entry.matched_user_id
        );
        await replaceAddressBookMatchCache(nextMatches);
        state.setAddressBookMatches(nextMatches);
      },
      ""
    );
  }

  return {
    handleBlockUser,
    handleBlockContact,
    handleUnblockContact,
    handleUnblockUser,
    handleUpdateContactRemark,
    handleDeleteContact,
    searchUsers,
    lookupContactByPhone,
    addContact,
    getUserProfile,
    startDirectConversation,
    refreshAddressBookMatches,
    saveAddressBookContact
  };
}

function toAddressBookMatchEntry(
  user: {
    phone_e164: string;
    user_id: number;
    nickname: string;
    username: string;
    avatar_url?: string | null;
  },
  candidate: AddressBookPhoneCandidate | undefined,
  matchedAt: string
): AddressBookMatchCacheEntry | null {
  if (!candidate) {
    return null;
  }

  return {
    phone_e164: user.phone_e164,
    local_display_name: candidate.local_display_name,
    matched_user_id: Number(user.user_id),
    nickname: user.nickname,
    username: user.username,
    avatar_url: user.avatar_url ?? null,
    matched_at: matchedAt
  };
}

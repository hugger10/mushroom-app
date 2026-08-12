import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { ContactListItem, UserSearchResult } from "@mushroom/shared";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import { useTranslation } from "react-i18next";
import { AppAvatar, EmptyState } from "../../../components/ui";
import { AccountPageShell } from "../../account/AccountPageShell";
import { useAppTheme } from "../../../styles/app-styles";
import { colorFromSeed } from "../../../styles/theme";
import type { AppStackParamList } from "../../../types/navigation";
import {
  useGroupSelection,
  useStartConversation
} from "../context/StartConversationContext";

const MAX_SELECTED_AVATARS = 8;

type DisplayPerson = {
  user_id: number;
  username: string;
  nickname?: string;
  avatar_url?: string;
};

export function StartGroupSelectScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const ctx = useStartConversation();
  const selection = useGroupSelection();

  const [groupKeyword, setGroupKeyword] = useState("");
  const [groupSearching, setGroupSearching] = useState(false);
  const [groupSearched, setGroupSearched] = useState(false);
  const [errorText, setErrorText] = useState("");
  const groupSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const groupSearchReqIdRef = useRef(0);

  // Reset selection state when this screen first mounts so users always start
  // a fresh group from the entry. Configure step keeps the same selection.
  const didResetRef = useRef(false);
  useEffect(() => {
    if (didResetRef.current) return;
    didResetRef.current = true;
    selection.reset();
  }, [selection]);

  useEffect(() => {
    return () => {
      if (groupSearchTimerRef.current) {
        clearTimeout(groupSearchTimerRef.current);
      }
    };
  }, []);

  async function runGroupSearch(rawKeyword?: string) {
    const nextKeyword = (rawKeyword ?? groupKeyword).trim();
    if (!nextKeyword) {
      groupSearchReqIdRef.current += 1;
      selection.setGroupRemoteResults([]);
      setGroupSearched(false);
      setGroupSearching(false);
      return;
    }
    const reqId = ++groupSearchReqIdRef.current;
    setGroupSearching(true);
    try {
      const nextResults = await ctx.onSearchUsers(nextKeyword);
      if (reqId !== groupSearchReqIdRef.current) {
        return;
      }
      selection.setGroupRemoteResults(nextResults);
      setGroupSearched(true);
    } catch (error) {
      if (reqId !== groupSearchReqIdRef.current) {
        return;
      }
      setErrorText(
        error instanceof Error
          ? error.message
          : String(error ?? t("startConversation.searchFailed"))
      );
    } finally {
      if (reqId === groupSearchReqIdRef.current) {
        setGroupSearching(false);
      }
    }
  }

  function scheduleGroupSearch(nextKeyword: string) {
    if (groupSearchTimerRef.current) {
      clearTimeout(groupSearchTimerRef.current);
      groupSearchTimerRef.current = null;
    }
    const trimmedNext = nextKeyword.trim();
    if (!trimmedNext) {
      groupSearchReqIdRef.current += 1;
      selection.setGroupRemoteResults([]);
      setGroupSearched(false);
      setGroupSearching(false);
      return;
    }
    setGroupSearching(true);
    setGroupSearched(false);
    groupSearchTimerRef.current = setTimeout(() => {
      void runGroupSearch(trimmedNext);
    }, 350);
  }

  function handleNext() {
    if (selection.selectedContactIds.length === 0) {
      setErrorText(t("createGroup.membersRequired"));
      return;
    }
    setErrorText("");
    navigation.navigate("StartGroupConfigure");
  }

  function handleToggle(userId: number) {
    selection.toggleContact(userId);
    if (errorText) {
      setErrorText("");
    }
  }

  const rightAction = (
    <Pressable
      testID="group-next-button"
      onPress={handleNext}
      disabled={
        selection.selectedContactIds.length === 0 ||
        ctx.availableContacts.length === 0
      }
      style={({ pressed }) => [
        styles.startConversationSheetHeaderAction,
        selection.selectedContactIds.length === 0
          ? styles.startConversationSheetHeaderActionDisabled
          : null,
        { opacity: pressed ? 0.7 : 1 }
      ]}
    >
      <Text
        style={[
          styles.startConversationSheetHeaderActionText,
          selection.selectedContactIds.length === 0
            ? styles.startConversationSheetHeaderActionTextDisabled
            : null
        ]}
      >
        {t("createGroup.next")}
      </Text>
    </Pressable>
  );

  const trimmed = groupKeyword.trim().toLowerCase();
  const filteredLocal = useMemo(() => {
    if (!trimmed) return ctx.availableContacts;
    return ctx.availableContacts.filter(c => {
      const nick = (c.nickname || "").toLowerCase();
      const uname = (c.username || "").toLowerCase();
      const remark = (c.remark_name || "").toLowerCase();
      return (
        nick.includes(trimmed) ||
        uname.includes(trimmed) ||
        remark.includes(trimmed)
      );
    });
  }, [ctx.availableContacts, trimmed]);

  const localIds = useMemo(
    () => new Set(ctx.availableContacts.map(c => Number(c.user_id))),
    [ctx.availableContacts]
  );
  const remoteOnly = useMemo(() => {
    if (!trimmed) return [];
    return selection.groupRemoteResults.filter(
      r => !localIds.has(Number(r.user_id))
    );
  }, [selection.groupRemoteResults, localIds, trimmed]);

  // Build a lookup for selected user display info from both local contacts
  // and remote search results.
  const selectedPeople: DisplayPerson[] = useMemo(() => {
    const map = new Map<number, DisplayPerson>();
    ctx.availableContacts.forEach((c: ContactListItem) => {
      map.set(Number(c.user_id), {
        user_id: Number(c.user_id),
        username: c.username,
        nickname: c.nickname,
        avatar_url: c.avatar_url
      });
    });
    selection.groupRemoteResults.forEach((r: UserSearchResult) => {
      const id = Number(r.user_id);
      if (!map.has(id)) {
        map.set(id, {
          user_id: id,
          username: r.username,
          nickname: r.nickname,
          avatar_url: r.avatar_url
        });
      }
    });
    return selection.selectedContactIds.map(id => {
      const found = map.get(Number(id));
      if (found) return found;
      return { user_id: Number(id), username: String(id) };
    });
  }, [
    ctx.availableContacts,
    selection.groupRemoteResults,
    selection.selectedContactIds
  ]);

  const visibleSelected = selectedPeople.slice(0, MAX_SELECTED_AVATARS);
  const overflowCount = Math.max(
    0,
    selectedPeople.length - MAX_SELECTED_AVATARS
  );

  function renderRow(
    keyPrefix: string,
    userId: number,
    username: string,
    nickname: string | undefined,
    avatarUrl: string | undefined,
    showDivider: boolean
  ) {
    const selected = selection.selectedContactIds.includes(userId);
    const avatarSeed = nickname || username || String(userId);
    return (
      <View key={`${keyPrefix}:${userId}`}>
        {showDivider ? <View style={styles.groupContactRowDividerV2} /> : null}
        <Pressable
          testID={`group-contact-option:${userId}`}
          style={[
            styles.groupContactRowTall,
            selected ? styles.groupContactRowSelected : null
          ]}
          onPress={() => handleToggle(userId)}
        >
          <View
            style={[
              styles.groupSelectCheckbox,
              selected ? styles.groupSelectCheckboxActive : null
            ]}
          >
            {selected ? (
              <Ionicons
                name="checkmark"
                size={14}
                color={theme.colors.textInverse}
              />
            ) : null}
          </View>
          <AppAvatar
            label={avatarSeed}
            imageUrl={avatarUrl}
            style={[
              styles.groupContactAvatarLg,
              {
                backgroundColor: colorFromSeed(avatarSeed, theme.avatarPalette)
              }
            ]}
            textStyle={styles.groupContactAvatarLgText}
          />
          <View style={styles.groupContactBody}>
            <Text numberOfLines={1} style={styles.groupContactTitle}>
              {nickname || username}
            </Text>
            <Text numberOfLines={1} style={styles.groupContactSubtitle}>
              @{username}
            </Text>
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <AccountPageShell
      title={t("startConversation.addGroupMembersTitle")}
      onBack={() => navigation.goBack()}
      rightAction={rightAction}
      testID="start-group-select-screen"
    >
      <View style={styles.groupSelectContent}>
        {/* Top: selected member avatar strip */}
        <View style={styles.groupSelectedStrip}>
          {selectedPeople.length === 0 ? (
            <Text style={styles.groupSelectedEmptyHint}>
              {t("startConversation.selectContactsHint")}
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.groupSelectedStripScroll}
              contentContainerStyle={styles.groupSelectedStripContent}
              keyboardShouldPersistTaps="handled"
            >
              {visibleSelected.map(p => {
                const seed = p.nickname || p.username || String(p.user_id);
                return (
                  <Pressable
                    key={`selected:${p.user_id}`}
                    testID={`group-selected-avatar:${p.user_id}`}
                    onPress={() => handleToggle(p.user_id)}
                    hitSlop={4}
                  >
                    <AppAvatar
                      label={seed}
                      imageUrl={p.avatar_url}
                      style={[
                        styles.groupSelectedAvatar,
                        {
                          backgroundColor: colorFromSeed(
                            seed,
                            theme.avatarPalette
                          )
                        }
                      ]}
                      textStyle={styles.groupSelectedAvatarText}
                    />
                  </Pressable>
                );
              })}
              {overflowCount > 0 ? (
                <View style={styles.groupSelectedOverflow}>
                  <Text style={styles.groupSelectedOverflowText}>
                    +{overflowCount}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>

        {errorText ? (
          <Text style={styles.overlayErrorText}>{errorText}</Text>
        ) : null}

        {/* Search */}
        <View style={styles.groupSearchBarClean}>
          <Ionicons name="search" size={16} color={theme.colors.textSoft} />
          <TextInput
            value={groupKeyword}
            onChangeText={value => {
              setGroupKeyword(value);
              if (errorText) {
                setErrorText("");
              }
              scheduleGroupSearch(value);
            }}
            placeholder={t("startConversation.searchPlaceholder")}
            placeholderTextColor={theme.colors.inputPlaceholder}
            style={styles.groupSearchInputClean}
            maxLength={SEARCH_KEYWORD_MAX_LENGTH}
            returnKeyType="search"
            testID="group-contact-search-input"
            onSubmitEditing={() => {
              void runGroupSearch();
            }}
          />
          {groupSearching ? (
            <ActivityIndicator size="small" color={theme.colors.textSoft} />
          ) : groupKeyword.length > 0 ? (
            <Pressable
              testID="group-contact-search-clear"
              onPress={() => {
                setGroupKeyword("");
                scheduleGroupSearch("");
              }}
              hitSlop={6}
              style={styles.groupSearchClearButton}
            >
              <Ionicons name="close" size={14} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {/* List */}
        <ScrollView
          style={styles.flexList}
          keyboardShouldPersistTaps="handled"
          testID="group-contact-list"
        >
          {filteredLocal.length === 0 && remoteOnly.length === 0 ? (
            trimmed ? (
              groupSearching ? (
                <EmptyState label={t("startConversation.searching")} />
              ) : groupSearched ? (
                <EmptyState label={t("startConversation.noUsersFound")} />
              ) : (
                <EmptyState label={t("startConversation.searching")} />
              )
            ) : (
              <EmptyState label={t("startConversation.noContactsToAdd")} />
            )
          ) : (
            <>
              {filteredLocal.length > 0 ? (
                <View style={styles.groupContactListPlain}>
                  {filteredLocal.map((contact, index) =>
                    renderRow(
                      "group-contact",
                      Number(contact.user_id),
                      contact.username,
                      contact.nickname,
                      contact.avatar_url,
                      index > 0
                    )
                  )}
                </View>
              ) : null}
              {remoteOnly.length > 0 ? (
                <>
                  <Text style={styles.groupRemoteSectionLabelV2}>
                    {t("startConversation.moreUsers")}
                  </Text>
                  <View style={styles.groupContactListPlain}>
                    {remoteOnly.map((user: UserSearchResult, index) =>
                      renderRow(
                        "group-contact-remote",
                        Number(user.user_id),
                        user.username,
                        user.nickname,
                        user.avatar_url,
                        index > 0
                      )
                    )}
                  </View>
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </AccountPageShell>
  );
}

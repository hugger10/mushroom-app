import type { ContactListItem, UserSearchResult } from "@mushroom/shared";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppAvatar } from "../../../components/ui";
import { useAppTheme } from "../../../styles/app-styles";
import { colorFromSeed } from "../../../styles/theme";
import type { AppStackParamList } from "../../../types/navigation";
import { useGroupManage } from "../context/GroupManageContext";
import { SubPanelHeader } from "../../../components/ui/SubPanelHeader";

function fallbackDisplayName(
  user: {
    user_id: number | string;
    nickname?: string | null;
    username?: string | null;
  },
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return (
    user.nickname ||
    user.username ||
    t("groupInfo.unknownUser", { id: Number(user.user_id) })
  );
}

type RowPerson = {
  user_id: number | string;
  username?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
};

export function GroupInfoInviteScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const props = useGroupManage();

  const {
    candidateAddFriends,
    existingMemberIds,
    selectedAddMemberIds,
    selectedStrangerProfiles,
    onSearchUsers,
    onToggleSelectedAddMember,
    onToggleSelectedStranger,
    onAddSelectedMembers,
    pending
  } = props;

  const [keyword, setKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchReqIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      searchReqIdRef.current += 1;
    };
  }, []);

  const contactIdSet = useMemo(
    () => new Set(candidateAddFriends.map(c => Number(c.user_id))),
    [candidateAddFriends]
  );

  const runSearch = useCallback(
    async (rawKeyword: string) => {
      const nextKeyword = rawKeyword.trim();
      const reqId = ++searchReqIdRef.current;
      setSearching(true);
      setSearchError("");
      try {
        const next = await onSearchUsers(nextKeyword);
        if (reqId !== searchReqIdRef.current) return;
        setSearchResults(next);
        setSearched(true);
      } catch (error) {
        if (reqId !== searchReqIdRef.current) return;
        setSearchError(
          error instanceof Error
            ? error.message
            : String(error ?? t("groupInfo.searchFailed"))
        );
      } finally {
        if (reqId === searchReqIdRef.current) {
          setSearching(false);
        }
      }
    },
    [onSearchUsers]
  );

  const scheduleSearch = useCallback(
    (nextKeyword: string) => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      const trimmed = nextKeyword.trim();
      if (!trimmed) {
        searchReqIdRef.current += 1;
        setSearchResults([]);
        setSearched(false);
        setSearching(false);
        setSearchError("");
        return;
      }
      searchTimerRef.current = setTimeout(() => {
        void runSearch(trimmed);
      }, 350);
    },
    [runSearch]
  );

  useEffect(() => {
    const staleIds = selectedAddMemberIds.filter(id =>
      existingMemberIds.has(Number(id))
    );
    if (staleIds.length === 0) return;
    for (const id of staleIds) {
      const stranger = selectedStrangerProfiles.find(
        p => Number(p.user_id) === Number(id)
      );
      if (stranger) {
        onToggleSelectedStranger(stranger);
      } else {
        onToggleSelectedAddMember(Number(id));
      }
    }
  }, [
    existingMemberIds,
    selectedAddMemberIds,
    selectedStrangerProfiles,
    onToggleSelectedAddMember,
    onToggleSelectedStranger
  ]);

  const isResultExistingMember = (userId: number) =>
    existingMemberIds.has(Number(userId));

  const handleToggleStranger = (user: UserSearchResult) => {
    const uid = Number(user.user_id);
    if (isResultExistingMember(uid)) return;
    if (contactIdSet.has(uid)) {
      onToggleSelectedAddMember(uid);
      return;
    }
    onToggleSelectedStranger(user);
  };

  const handleToggleContact = (contact: ContactListItem) => {
    onToggleSelectedAddMember(Number(contact.user_id));
  };

  const handleClearAllSelected = () => {
    const idsSnapshot = [...selectedAddMemberIds];
    const strangerMap = new Map(
      selectedStrangerProfiles.map(p => [Number(p.user_id), p])
    );
    for (const id of idsSnapshot) {
      const stranger = strangerMap.get(Number(id));
      if (stranger) {
        onToggleSelectedStranger(stranger);
      } else {
        onToggleSelectedAddMember(Number(id));
      }
    }
  };

  const selectedItems: Array<{
    kind: "contact" | "stranger";
    person: RowPerson;
  }> = useMemo(() => {
    const out: Array<{ kind: "contact" | "stranger"; person: RowPerson }> = [];
    for (const c of candidateAddFriends) {
      if (selectedAddMemberIds.includes(Number(c.user_id))) {
        out.push({ kind: "contact", person: c });
      }
    }
    for (const s of selectedStrangerProfiles) {
      if (selectedAddMemberIds.includes(Number(s.user_id))) {
        out.push({ kind: "stranger", person: s });
      }
    }
    return out;
  }, [candidateAddFriends, selectedStrangerProfiles, selectedAddMemberIds]);

  const totalSelected = selectedAddMemberIds.length;
  const keywordTrimmed = keyword.trim();
  const showSearchMode = keywordTrimmed.length > 0;

  const renderPersonRow = (params: {
    keyId: string;
    person: RowPerson;
    selected: boolean;
    disabled?: boolean;
    badge?: string;
    onPress: () => void;
    showDivider: boolean;
  }) => {
    const { keyId, person, selected, disabled, badge, onPress, showDivider } =
      params;
    const displayName = fallbackDisplayName(person, t);
    const avatarSeed =
      person.nickname || person.username || String(person.user_id);
    return (
      <View key={keyId}>
        <Pressable
          onPress={onPress}
          disabled={disabled || pending}
          style={[
            styles.groupInfoInviteListRow,
            disabled ? styles.groupInfoInviteListRowDisabled : null
          ]}
        >
          <AppAvatar
            label={avatarSeed}
            imageUrl={person.avatar_url ?? undefined}
            style={[
              styles.groupInfoInviteListAvatar,
              {
                backgroundColor: colorFromSeed(avatarSeed, theme.avatarPalette)
              }
            ]}
            textStyle={styles.groupInfoInviteListAvatarText}
          />
          <View style={styles.groupInfoInviteListMain}>
            <Text numberOfLines={1} style={styles.groupInfoInviteListTitle}>
              {displayName}
            </Text>
            {person.username ? (
              <Text
                numberOfLines={1}
                style={styles.groupInfoInviteListSubtitle}
              >
                @{person.username}
              </Text>
            ) : null}
          </View>
          {badge ? (
            <Text style={styles.groupInfoInviteListBadge}>{badge}</Text>
          ) : selected ? (
            <Ionicons
              name="checkmark-circle"
              size={22}
              color={theme.colors.accent}
            />
          ) : (
            <Ionicons
              name="ellipse-outline"
              size={22}
              color={theme.colors.textSoft}
            />
          )}
        </Pressable>
        {showDivider ? (
          <View style={styles.groupInfoInviteListDivider} />
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.groupInfoPage, { flex: 1 }]}>
      <SubPanelHeader
        title={t("groupInfo.inviteTitle")}
        onBack={() => navigation.goBack()}
      />

      {/* Selected horizontal strip */}
      {totalSelected > 0 ? (
        <View style={styles.groupInfoInviteSelectedStrip}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.groupInfoInviteSelectedScroll}
            contentContainerStyle={styles.groupInfoInviteSelectedContent}
            keyboardShouldPersistTaps="handled"
          >
            {selectedItems.map(({ kind, person }) => {
              const seed =
                person.nickname || person.username || String(person.user_id);
              return (
                <Pressable
                  key={`sel:${kind}:${person.user_id}`}
                  onPress={() => {
                    if (kind === "contact") {
                      onToggleSelectedAddMember(Number(person.user_id));
                    } else {
                      const stranger = selectedStrangerProfiles.find(
                        p => Number(p.user_id) === Number(person.user_id)
                      );
                      if (stranger) onToggleSelectedStranger(stranger);
                    }
                  }}
                  style={styles.groupInfoInviteSelectedItem}
                  hitSlop={4}
                >
                  <AppAvatar
                    label={seed}
                    imageUrl={person.avatar_url ?? undefined}
                    style={[
                      styles.groupInfoInviteSelectedAvatar,
                      {
                        backgroundColor: colorFromSeed(
                          seed,
                          theme.avatarPalette
                        )
                      }
                    ]}
                    textStyle={styles.groupInfoInviteSelectedAvatarText}
                  />
                  <View style={styles.groupInfoInviteSelectedRemoveBadge}>
                    <Ionicons
                      name="close"
                      size={12}
                      color={theme.colors.textMuted}
                    />
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable onPress={handleClearAllSelected} hitSlop={6}>
            <Text style={styles.groupInfoInviteSelectedClear}>
              {t("groupInfo.clear")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Search bar */}
      <View style={styles.groupInfoInviteSearchWrap}>
        <View style={styles.groupInfoInviteSearchBar}>
          <Ionicons name="search" size={16} color={theme.colors.textSoft} />
          <TextInput
            value={keyword}
            onChangeText={value => {
              setKeyword(value);
              scheduleSearch(value);
            }}
            placeholder={t("groupInfo.searchPlaceholder")}
            placeholderTextColor={theme.colors.inputPlaceholder}
            style={styles.groupInfoInviteSearchInput}
            maxLength={SEARCH_KEYWORD_MAX_LENGTH}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {keyword.length > 0 ? (
            <Pressable
              onPress={() => {
                setKeyword("");
                scheduleSearch("");
              }}
              hitSlop={8}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={theme.colors.textSoft}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.groupInfoScroll}
        contentContainerStyle={{
          paddingBottom: totalSelected > 0 ? 120 : 24
        }}
        keyboardShouldPersistTaps="handled"
      >
        {searchError ? (
          <Text
            style={[
              styles.overlayErrorText,
              { marginHorizontal: 16, marginBottom: 8 }
            ]}
          >
            {searchError}
          </Text>
        ) : null}

        {showSearchMode ? (
          <>
            <Text style={styles.groupInfoInviteSectionTitle}>
              {t("groupInfo.searchResults")}
              {searchResults.length > 0 ? ` (${searchResults.length})` : ""}
            </Text>
            <View style={styles.groupInfoInviteListCard}>
              {searching ? (
                <View style={styles.groupInfoInviteStateBlock}>
                  <Text style={styles.groupInfoInviteStateText}>
                    {t("groupInfo.searching")}
                  </Text>
                </View>
              ) : searchResults.length > 0 ? (
                searchResults.map((user, idx) => {
                  const uid = Number(user.user_id);
                  const isExisting = isResultExistingMember(uid);
                  const selected = selectedAddMemberIds.includes(uid);
                  return renderPersonRow({
                    keyId: `inv-s:${uid}`,
                    person: user,
                    selected,
                    disabled: isExisting,
                    badge: isExisting
                      ? t("groupInfo.alreadyInGroup")
                      : undefined,
                    onPress: () => handleToggleStranger(user),
                    showDivider: idx < searchResults.length - 1
                  });
                })
              ) : searched ? (
                <View style={styles.groupInfoInviteStateBlock}>
                  <Text style={styles.groupInfoInviteStateText}>
                    {t("groupInfo.noUsersFound")}
                  </Text>
                </View>
              ) : (
                <View style={styles.groupInfoInviteStateBlock}>
                  <Text style={styles.groupInfoInviteStateText}>
                    {t("groupInfo.searchHint")}
                  </Text>
                </View>
              )}
            </View>
          </>
        ) : candidateAddFriends.length > 0 ? (
          <>
            <Text style={styles.groupInfoInviteSectionTitle}>
              {t("groupInfo.contactsCount", {
                count: candidateAddFriends.length
              })}
            </Text>
            <View style={styles.groupInfoInviteListCard}>
              {candidateAddFriends.map((contact, idx) => {
                const uid = Number(contact.user_id);
                const selected = selectedAddMemberIds.includes(uid);
                return renderPersonRow({
                  keyId: `inv:${uid}`,
                  person: contact,
                  selected,
                  onPress: () => handleToggleContact(contact),
                  showDivider: idx < candidateAddFriends.length - 1
                });
              })}
            </View>
          </>
        ) : (
          <View style={styles.groupInfoInviteEmpty}>
            <View style={styles.groupInfoInviteEmptyIcon}>
              <Ionicons
                name="people-outline"
                size={32}
                color={theme.colors.textSoft}
              />
            </View>
            <Text style={styles.groupInfoInviteEmptyTitle}>
              {t("groupInfo.noInvitableContacts")}
            </Text>
            <Text style={styles.groupInfoInviteEmptyHint}>
              {t("groupInfo.noInvitableHint")}
            </Text>
          </View>
        )}
      </ScrollView>

      {totalSelected > 0 ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16),
            backgroundColor: theme.colors.background,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border
          }}
        >
          <Pressable
            style={[
              styles.groupInfoInviteButton,
              { marginHorizontal: 0 },
              pending ? styles.groupInfoSaveButtonDisabled : null
            ]}
            onPress={onAddSelectedMembers}
            disabled={pending}
          >
            <Text style={styles.groupInfoInviteButtonText}>
              {t("groupInfo.inviteButton", { count: totalSelected })}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

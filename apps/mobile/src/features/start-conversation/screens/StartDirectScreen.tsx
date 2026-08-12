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
import type { UserSearchResult } from "@mushroom/shared";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import { useTranslation } from "react-i18next";
import { AppAvatar, EmptyState } from "../../../components/ui";
import { AccountPageShell } from "../../account/AccountPageShell";
import { useAppTheme } from "../../../styles/app-styles";
import { colorFromSeed } from "../../../styles/theme";
import type { AppStackParamList } from "../../../types/navigation";
import { useStartConversation } from "../context/StartConversationContext";

export function StartDirectScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const ctx = useStartConversation();

  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [startingUserId, setStartingUserId] = useState<number | null>(null);
  const [openingUserId, setOpeningUserId] = useState<number | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchReqIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  async function runSearch(rawKeyword?: string) {
    const nextKeyword = (rawKeyword ?? keyword).trim();
    if (!nextKeyword) {
      searchReqIdRef.current += 1;
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    const reqId = ++searchReqIdRef.current;
    setLoading(true);
    setErrorText("");
    try {
      const nextResults = await ctx.onSearchUsers(nextKeyword);
      if (reqId !== searchReqIdRef.current) {
        return;
      }
      setResults(nextResults);
      setSearched(true);
    } catch (error) {
      if (reqId !== searchReqIdRef.current) {
        return;
      }
      setErrorText(
        error instanceof Error
          ? error.message
          : String(error ?? t("startConversation.searchFailed"))
      );
    } finally {
      if (reqId === searchReqIdRef.current) {
        setLoading(false);
      }
    }
  }

  function scheduleSearch(nextKeyword: string) {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    const trimmedNext = nextKeyword.trim();
    if (!trimmedNext) {
      searchReqIdRef.current += 1;
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setSearched(false);
    searchTimerRef.current = setTimeout(() => {
      void runSearch(trimmedNext);
    }, 350);
  }

  async function handleAdd(userId: number) {
    setStartingUserId(userId);
    setErrorText("");
    try {
      await ctx.onStartDirectConversation(userId);
      navigation.goBack();
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : String(error ?? t("startConversation.startChatFailed"))
      );
    } finally {
      setStartingUserId(null);
    }
  }

  async function handleOpenChat(userId: number) {
    setOpeningUserId(userId);
    setErrorText("");
    try {
      await ctx.onOpenChatByUserId(userId);
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : String(error ?? t("startConversation.openChatFailed"))
      );
    } finally {
      setOpeningUserId(null);
    }
  }

  const trimmed = keyword.trim().toLowerCase();
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
    return results.filter(r => !localIds.has(Number(r.user_id)));
  }, [results, localIds, trimmed]);

  function renderActionButton(
    userId: number,
    isKnown: boolean,
    canOpen: boolean
  ) {
    if (isKnown || canOpen) {
      // Whole row is tappable; no extra button needed.
      return null;
    }
    const adding = startingUserId === userId;
    return (
      <Pressable
        testID={`contact-search-start-chat:${userId}`}
        disabled={adding}
        onPress={() => {
          void handleAdd(userId);
        }}
        style={({ pressed }) => [
          styles.friendSearchResultMiniButton,
          styles.friendSearchResultMiniButtonPrimary,
          adding ? styles.friendSearchResultMiniButtonDisabled : null,
          pressed ? { opacity: 0.85 } : null
        ]}
      >
        {adding ? (
          <ActivityIndicator size="small" color={theme.colors.textInverse} />
        ) : (
          <Text
            style={[
              styles.friendSearchResultMiniButtonLabel,
              styles.friendSearchResultMiniButtonLabelPrimary
            ]}
          >
            {t("startConversation.addAndChat")}
          </Text>
        )}
      </Pressable>
    );
  }

  function renderRow(
    keyPrefix: string,
    userId: number,
    username: string,
    nickname: string | undefined,
    avatarUrl: string | undefined,
    isKnown: boolean,
    canOpen: boolean,
    showDivider: boolean
  ) {
    const avatarSeed = nickname || username || String(userId);
    const rowTappable = isKnown || canOpen;
    const opening = openingUserId === userId;
    const rowContent = (
      <>
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
        {rowTappable && opening ? (
          <ActivityIndicator size="small" color={theme.colors.textSoft} />
        ) : (
          renderActionButton(userId, isKnown, canOpen)
        )}
      </>
    );
    return (
      <View key={`${keyPrefix}:${userId}`}>
        {showDivider ? <View style={styles.groupContactRowDividerV2} /> : null}
        {rowTappable ? (
          <Pressable
            testID={`contact-search-row:${userId}`}
            disabled={opening}
            onPress={() => {
              void handleOpenChat(userId);
            }}
            style={({ pressed }) => [
              styles.groupContactRowTall,
              pressed ? { opacity: 0.7 } : null
            ]}
          >
            {rowContent}
          </Pressable>
        ) : (
          <View style={styles.groupContactRowTall}>{rowContent}</View>
        )}
      </View>
    );
  }

  return (
    <AccountPageShell
      title={t("startConversation.startChatTitle")}
      onBack={() => navigation.goBack()}
      testID="start-direct-screen"
    >
      <View style={styles.groupSelectContent}>
        {errorText ? (
          <Text style={styles.overlayErrorText}>{errorText}</Text>
        ) : null}

        <View style={styles.groupSearchBarClean}>
          <Ionicons name="search" size={16} color={theme.colors.textSoft} />
          <TextInput
            value={keyword}
            onChangeText={value => {
              setKeyword(value);
              if (errorText) {
                setErrorText("");
              }
              scheduleSearch(value);
            }}
            placeholder={t("startConversation.searchPlaceholder")}
            placeholderTextColor={theme.colors.inputPlaceholder}
            style={styles.groupSearchInputClean}
            maxLength={SEARCH_KEYWORD_MAX_LENGTH}
            returnKeyType="search"
            testID="contact-search-input"
            onSubmitEditing={() => {
              void runSearch();
            }}
          />
          {loading ? (
            <ActivityIndicator size="small" color={theme.colors.textSoft} />
          ) : keyword.length > 0 ? (
            <Pressable
              testID="contact-search-clear"
              onPress={() => {
                setKeyword("");
                scheduleSearch("");
              }}
              hitSlop={6}
              style={styles.groupSearchClearButton}
            >
              <Ionicons name="close" size={14} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          style={styles.flexList}
          keyboardShouldPersistTaps="handled"
          testID="contact-search-list"
        >
          {filteredLocal.length === 0 && remoteOnly.length === 0 ? (
            trimmed ? (
              loading ? (
                <EmptyState label={t("startConversation.searching")} />
              ) : searched ? (
                <EmptyState label={t("startConversation.noUsersFound")} />
              ) : (
                <EmptyState label={t("startConversation.searching")} />
              )
            ) : (
              <EmptyState label={t("startConversation.noContactsHint")} />
            )
          ) : (
            <>
              {filteredLocal.length > 0 ? (
                <View style={styles.groupContactListPlain}>
                  {filteredLocal.map((contact, index) =>
                    renderRow(
                      "contact-local",
                      Number(contact.user_id),
                      contact.username,
                      contact.nickname,
                      contact.avatar_url,
                      true,
                      true,
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
                    {remoteOnly.map((user, index) =>
                      renderRow(
                        "contact-remote",
                        Number(user.user_id),
                        user.username,
                        user.nickname,
                        user.avatar_url,
                        false,
                        Boolean(user.can_open_direct),
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

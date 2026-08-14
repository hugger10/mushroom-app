import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { UserSearchResult } from "@mushroom/shared";
import {
  compactPhone,
  isValidPhoneInput,
  SEARCH_KEYWORD_MAX_LENGTH
} from "@mushroom/shared";
import { AccountPageShell } from "../../account/AccountPageShell";
import { AppAvatar, PrimaryButton } from "../../../components/ui";
import { useAppTheme } from "../../../styles/app-styles";
import { colorFromSeed } from "../../../styles/theme";
import type { AppStackParamList } from "../../../types/navigation";
import { useAddContactProps } from "../AddContactContext";

type Navigation = NativeStackNavigationProp<AppStackParamList>;

type TabKey = "phone" | "username";

type ResultSource = "phone" | "username";

type ResultItem = {
  source: ResultSource;
  user: UserSearchResult;
};

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "invalidPhone" }
  | { kind: "results"; items: ResultItem[]; phoneE164?: string }
  | { kind: "notFound"; phoneE164?: string }
  | { kind: "error"; message: string };

const DEFAULT_COUNTRY_CODE = "+86";
const LOOKUP_DEBOUNCE_MS = 350;
const PHONE_INPUT_MAX_LENGTH = 16;

function FadeSlideIn(props: {
  children: ReactNode;
  delay?: number;
  duration?: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: props.duration ?? 220,
        delay: props.delay ?? 0,
        useNativeDriver: true
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: props.duration ?? 260,
        delay: props.delay ?? 0,
        useNativeDriver: true
      })
    ]).start();
  }, [opacity, props.delay, props.duration, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {props.children}
    </Animated.View>
  );
}

function SkeletonList() {
  const { theme } = useAppTheme();
  const local = useMemo(() => makeStyles(theme), [theme]);
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 520,
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const rows = [0, 1].map(index => (
    <View key={index} style={local.skeletonRow}>
      <View style={local.skeletonAvatar} />
      <View style={local.flex1}>
        <Animated.View
          style={[local.skeletonLinePrimary, { opacity: pulse }]}
        />
        <Animated.View
          style={[local.skeletonLineSecondary, { opacity: pulse }]}
        />
      </View>
    </View>
  ));

  return <View style={local.resultList}>{rows}</View>;
}

export function AddContactScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation = useNavigation<Navigation>();
  const props = useAddContactProps();
  const local = useMemo(() => makeStyles(theme), [theme]);

  const [tab, setTab] = useState<TabKey>("phone");
  const [phoneQuery, setPhoneQuery] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [phoneState, setPhoneState] = useState<SearchState>({ kind: "idle" });
  const [nameState, setNameState] = useState<SearchState>({ kind: "idle" });
  const [addingId, setAddingId] = useState<number | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);

  const phoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phoneReqIdRef = useRef(0);
  const nameReqIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (phoneTimerRef.current) {
        clearTimeout(phoneTimerRef.current);
      }
      if (nameTimerRef.current) {
        clearTimeout(nameTimerRef.current);
      }
    };
  }, []);

  async function runPhoneLookup(raw: string) {
    const compact = compactPhone(raw);
    const reqId = ++phoneReqIdRef.current;
    if (!isValidPhoneInput(compact)) {
      setPhoneState({ kind: compact ? "invalidPhone" : "idle" });
      return;
    }
    try {
      const r = await props.onLookupByPhone({
        phoneE164: compact,
        defaultCountryCode: DEFAULT_COUNTRY_CODE
      });
      if (reqId !== phoneReqIdRef.current) {
        return;
      }
      if (r.matched && r.user) {
        setPhoneState({
          kind: "results",
          items: [{ source: "phone", user: r.user }],
          phoneE164: r.phoneE164
        });
      } else {
        setPhoneState({ kind: "notFound", phoneE164: r.phoneE164 });
      }
    } catch (error) {
      if (reqId !== phoneReqIdRef.current) {
        return;
      }
      setPhoneState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : t("addContactScreen.lookupFailed")
      });
    }
  }

  function schedulePhoneLookup(nextQuery: string) {
    if (phoneTimerRef.current) {
      clearTimeout(phoneTimerRef.current);
      phoneTimerRef.current = null;
    }
    const compact = compactPhone(nextQuery);
    if (!compact) {
      phoneReqIdRef.current += 1;
      setPhoneState({ kind: "idle" });
      return;
    }
    if (!isValidPhoneInput(compact)) {
      phoneReqIdRef.current += 1;
      setPhoneState({ kind: "invalidPhone" });
      return;
    }
    setPhoneState({ kind: "loading" });
    phoneTimerRef.current = setTimeout(() => {
      void runPhoneLookup(compact);
    }, LOOKUP_DEBOUNCE_MS);
  }

  async function runNameSearch(raw: string) {
    const trimmed = raw.trim();
    const reqId = ++nameReqIdRef.current;
    try {
      const list = await props.onSearchUsers(trimmed, { mode: "username" });
      if (reqId !== nameReqIdRef.current) {
        return;
      }
      if (list.length === 0) {
        setNameState({ kind: "notFound" });
      } else {
        setNameState({
          kind: "results",
          items: list.map(user => ({
            source: "username" as ResultSource,
            user
          }))
        });
      }
    } catch (error) {
      if (reqId !== nameReqIdRef.current) {
        return;
      }
      setNameState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : t("addContactScreen.lookupFailed")
      });
    }
  }

  function scheduleNameSearch(nextQuery: string) {
    if (nameTimerRef.current) {
      clearTimeout(nameTimerRef.current);
      nameTimerRef.current = null;
    }
    const trimmed = nextQuery.trim();
    if (!trimmed) {
      nameReqIdRef.current += 1;
      setNameState({ kind: "idle" });
      return;
    }
    setNameState({ kind: "loading" });
    nameTimerRef.current = setTimeout(() => {
      void runNameSearch(trimmed);
    }, LOOKUP_DEBOUNCE_MS);
  }

  async function handleAdd(item: ResultItem) {
    const userId = Number(item.user.user_id);
    setAddingId(userId);
    try {
      await props.onAddContact({
        userId,
        remarkName: undefined,
        source: item.source
      });
      navigation.goBack();
    } catch {
      // global status banner already surfaces the failure
    } finally {
      setAddingId(null);
    }
  }

  async function handleOpenChat(user: UserSearchResult) {
    setOpeningId(Number(user.user_id));
    try {
      await props.onOpenChatByUserId(Number(user.user_id));
      navigation.goBack();
    } catch {
      // global status banner already surfaces the failure
    } finally {
      setOpeningId(null);
    }
  }

  async function handleInvite(phoneE164: string) {
    const link = t("addContactScreen.inviteLinkPlaceholder");
    const message = t("addContactScreen.inviteMessage", { link });
    try {
      await Share.share({ message: `${message}\n${phoneE164}` });
    } catch {
      // ignore
    }
  }

  function renderResultRow(state: SearchState, keyPrefix: string) {
    if (state.kind !== "results" || state.items.length === 0) {
      return null;
    }
    return (
      <View style={local.resultList}>
        {state.items.map((item, index) => {
          const user = item.user;
          const userId = Number(user.user_id);
          const avatarColor = colorFromSeed(
            user.nickname || user.username || "user",
            theme.avatarPalette
          );
          const isContact = Boolean(user.is_already_contact);
          const isAdding = addingId === userId;
          const opening = openingId === userId;

          const rowContent = (
            <>
              <AppAvatar
                label={user.nickname || user.username || "?"}
                imageUrl={user.avatar_url || undefined}
                style={[local.resultAvatar, { backgroundColor: avatarColor }]}
                textStyle={styles.contactsAvatarText}
              />
              <View style={local.resultBody}>
                <Text numberOfLines={1} style={local.resultTitle}>
                  {user.nickname || user.username}
                </Text>
                <Text numberOfLines={1} style={local.resultMeta}>
                  @{user.username}
                </Text>
              </View>
              {isContact ? (
                opening ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.textSoft}
                  />
                ) : (
                  <View style={local.addedPill}>
                    <Ionicons
                      name="checkmark"
                      size={13}
                      color={theme.colors.success}
                    />
                    <Text style={local.addedPillText}>
                      {t("addContactScreen.alreadyContact")}
                    </Text>
                  </View>
                )
              ) : (
                <Pressable
                  onPress={() => void handleAdd(item)}
                  disabled={addingId !== null}
                  style={({ pressed }) => [
                    local.addButton,
                    pressed && addingId === null
                      ? local.addButtonPressed
                      : null,
                    addingId !== null && !isAdding
                      ? local.addButtonDisabled
                      : null
                  ]}
                  testID={`add-contact-confirm-${user.user_id}`}
                  accessibilityLabel={t("addContactScreen.add")}
                >
                  {isAdding ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.accentStrong}
                    />
                  ) : (
                    <Ionicons
                      name="add"
                      size={22}
                      color={theme.colors.accentStrong}
                    />
                  )}
                </Pressable>
              )}
            </>
          );

          return (
            <View key={`${keyPrefix}-${item.source}-${user.user_id}`}>
              {index > 0 ? <View style={local.resultDivider} /> : null}
              {isContact ? (
                <Pressable
                  onPress={() => void handleOpenChat(user)}
                  disabled={opening || isAdding}
                  style={({ pressed }) => [
                    local.resultRow,
                    pressed ? local.resultRowPressed : null
                  ]}
                  testID={`add-contact-row-${user.user_id}`}
                >
                  {rowContent}
                </Pressable>
              ) : (
                <View style={local.resultRow}>{rowContent}</View>
              )}
            </View>
          );
        })}
      </View>
    );
  }

  function renderResultsSection(
    state: SearchState,
    queryKey: string,
    isEmptyHint: ReactNode,
    isLoading: boolean
  ) {
    if (state.kind === "results" && state.items.length > 0) {
      return (
        <FadeSlideIn key={`results-${queryKey}`}>
          <Text style={local.sectionLabel}>
            {t("addContactScreen.resultsCount", {
              count: state.items.length
            })}
          </Text>
          {renderResultRow(state, queryKey)}
          {state.items.some(item => Boolean(item.user.is_already_contact)) ? (
            <Text style={local.tapHint}>
              {t("addContactScreen.alreadyContactHint")}
            </Text>
          ) : null}
        </FadeSlideIn>
      );
    }
    if (isLoading) {
      return <SkeletonList />;
    }
    if (state.kind === "invalidPhone") {
      return (
        <View style={local.statusCard}>
          <Text style={local.invalidText}>
            {t("addContactScreen.phoneInvalid")}
          </Text>
        </View>
      );
    }
    if (state.kind === "notFound") {
      return (
        <FadeSlideIn key={`not-found-${queryKey}`}>
          <View style={local.statusCard} testID="add-contact-not-found">
            <Text style={local.resultTitle}>
              {state.phoneE164
                ? t("addContactScreen.notFoundPhoneTitle")
                : t("addContactScreen.notFoundTitle")}
            </Text>
            <Text style={local.statusDesc}>
              {state.phoneE164
                ? t("addContactScreen.notFoundPhoneDesc")
                : t("addContactScreen.notFoundDesc")}
            </Text>
            {state.phoneE164 ? (
              <>
                <View style={local.spacer16} />
                <PrimaryButton
                  label={t("addContactScreen.invite")}
                  onPress={() => void handleInvite(state.phoneE164 as string)}
                  testID="add-contact-invite"
                />
              </>
            ) : null}
          </View>
        </FadeSlideIn>
      );
    }
    if (state.kind === "error") {
      return (
        <View style={local.statusCard} testID="add-contact-error">
          <Text style={local.errorText}>{state.message}</Text>
        </View>
      );
    }
    return isEmptyHint;
  }

  return (
    <AccountPageShell
      title={t("addContactScreen.title")}
      onBack={() => navigation.goBack()}
      testID="add-contact-screen"
    >
      <ScrollView
        style={local.flex1}
        contentContainerStyle={local.scrollContent}
        keyboardShouldPersistTaps="handled"
        testID="add-contact-list"
      >
        <View style={local.tabBar}>
          {(["phone", "username"] as const).map(key => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                style={[local.tabButton, active ? local.tabButtonActive : null]}
                testID={`add-contact-tab-${key}`}
              >
                <Text
                  style={[
                    local.tabButtonText,
                    active ? local.tabButtonTextActive : null
                  ]}
                >
                  {key === "phone"
                    ? t("addContactScreen.tabPhone")
                    : t("addContactScreen.tabUsername")}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === "phone" ? (
          <>
            <View style={local.searchBar}>
              <Ionicons name="search" size={18} color={theme.colors.textSoft} />
              <TextInput
                value={phoneQuery}
                onChangeText={value => {
                  setPhoneQuery(value);
                  schedulePhoneLookup(value);
                }}
                placeholder={t("addContactScreen.phonePlaceholder")}
                placeholderTextColor={theme.colors.inputPlaceholder}
                style={local.searchInput}
                autoFocus
                keyboardType="phone-pad"
                maxLength={PHONE_INPUT_MAX_LENGTH}
                testID="add-contact-phone-input"
              />
              {phoneState.kind === "loading" ? (
                <ActivityIndicator size="small" color={theme.colors.textSoft} />
              ) : phoneQuery.length > 0 ? (
                <Pressable
                  onPress={() => {
                    setPhoneQuery("");
                    schedulePhoneLookup("");
                  }}
                  hitSlop={6}
                  style={local.clearButton}
                  testID="add-contact-phone-clear"
                >
                  <Ionicons
                    name="close"
                    size={14}
                    color={theme.colors.textMuted}
                  />
                </Pressable>
              ) : null}
            </View>
            {renderResultsSection(
              phoneState,
              phoneQuery.trim(),
              <View style={local.hintBlock}>
                <View style={local.hintIconWrap}>
                  <Ionicons
                    name="call-outline"
                    size={28}
                    color={theme.colors.accent}
                  />
                </View>
                <Text style={local.hintTitle}>
                  {t("addContactScreen.searchHintTitle")}
                </Text>
                <Text style={local.hintDesc}>
                  {t("addContactScreen.phoneHintDesc")}
                </Text>
              </View>,
              phoneState.kind === "loading"
            )}
          </>
        ) : (
          <>
            <View style={local.searchBar}>
              <Ionicons name="search" size={18} color={theme.colors.textSoft} />
              <TextInput
                value={nameQuery}
                onChangeText={value => {
                  setNameQuery(value);
                  scheduleNameSearch(value);
                }}
                placeholder={t("addContactScreen.usernamePlaceholder")}
                placeholderTextColor={theme.colors.inputPlaceholder}
                style={local.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => {
                  if (nameQuery.trim()) {
                    if (nameTimerRef.current) {
                      clearTimeout(nameTimerRef.current);
                      nameTimerRef.current = null;
                    }
                    void runNameSearch(nameQuery);
                  }
                }}
                maxLength={SEARCH_KEYWORD_MAX_LENGTH}
                testID="add-contact-username-input"
              />
              {nameState.kind === "loading" ? (
                <ActivityIndicator size="small" color={theme.colors.textSoft} />
              ) : nameQuery.length > 0 ? (
                <Pressable
                  onPress={() => {
                    setNameQuery("");
                    scheduleNameSearch("");
                  }}
                  hitSlop={6}
                  style={local.clearButton}
                  testID="add-contact-username-clear"
                >
                  <Ionicons
                    name="close"
                    size={14}
                    color={theme.colors.textMuted}
                  />
                </Pressable>
              ) : null}
            </View>
            {renderResultsSection(
              nameState,
              nameQuery.trim(),
              <View style={local.hintBlock}>
                <View style={local.hintIconWrap}>
                  <Ionicons
                    name="at-outline"
                    size={28}
                    color={theme.colors.accent}
                  />
                </View>
                <Text style={local.hintTitle}>
                  {t("addContactScreen.searchHintTitle")}
                </Text>
                <Text style={local.hintDesc}>
                  {t("addContactScreen.usernameHintDesc")}
                </Text>
              </View>,
              nameState.kind === "loading"
            )}
          </>
        )}
      </ScrollView>
    </AccountPageShell>
  );
}

function makeStyles(theme: ReturnType<typeof useAppTheme>["theme"]) {
  return StyleSheet.create({
    flex1: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 32
    },
    tabBar: {
      flexDirection: "row",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 14,
      padding: 3,
      marginBottom: 14
    },
    tabButton: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 9,
      borderRadius: 11
    },
    tabButtonActive: {
      backgroundColor: theme.colors.surfaceStrong
    },
    tabButtonText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      fontWeight: "600"
    },
    tabButtonTextActive: {
      color: theme.colors.accentStrong,
      fontWeight: "700"
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.colors.surfaceStrong,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      minHeight: 48
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 0,
      paddingHorizontal: 0,
      color: theme.colors.text,
      fontSize: 15
    },
    clearButton: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted
    },
    hintBlock: {
      alignItems: "center",
      paddingTop: 48,
      gap: 10
    },
    hintIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 2
    },
    hintTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "700"
    },
    hintDesc: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
      paddingHorizontal: 36
    },
    sectionLabel: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.6,
      paddingHorizontal: 4,
      marginTop: 16,
      marginBottom: 8
    },
    resultList: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: "hidden"
    },
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 58
    },
    resultRowPressed: {
      backgroundColor: theme.colors.surfaceMuted
    },
    resultAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    },
    resultBody: {
      flex: 1,
      minWidth: 0
    },
    resultTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "600"
    },
    resultMeta: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginTop: 2
    },
    resultDivider: {
      marginLeft: 66,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border
    },
    addButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.colors.accentSoft,
      alignItems: "center",
      justifyContent: "center"
    },
    addButtonPressed: {
      opacity: 0.6
    },
    addButtonDisabled: {
      opacity: 0.4
    },
    addedPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5
    },
    addedPillText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "600"
    },
    tapHint: {
      color: theme.colors.textSoft,
      fontSize: 12,
      textAlign: "center",
      marginTop: 10
    },
    statusCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 20,
      alignItems: "center",
      gap: 6,
      marginTop: 16
    },
    statusDesc: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "center"
    },
    invalidText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "center"
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 14,
      textAlign: "center"
    },
    spacer16: { height: 16 },
    skeletonRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12
    },
    skeletonAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.skeletonStrong
    },
    skeletonLinePrimary: {
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.colors.skeletonStrong,
      width: "42%"
    },
    skeletonLineSecondary: {
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.colors.skeleton,
      width: "26%",
      marginTop: 8
    }
  });
}

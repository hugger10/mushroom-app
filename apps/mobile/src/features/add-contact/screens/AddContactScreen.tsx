import { useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { PHONE_MAX_LENGTH, SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import { AccountPageShell } from "../../account/AccountPageShell";
import { AppAvatar, PrimaryButton } from "../../../components/ui";
import { useAppTheme } from "../../../styles/app-styles";
import { colorFromSeed } from "../../../styles/theme";
import type { AppStackParamList } from "../../../types/navigation";
import { useAddContactProps } from "../AddContactContext";
import { classifyAddContactInput } from "../lib/classify-input";

type Navigation = NativeStackNavigationProp<AppStackParamList>;

type ResultSource = "phone" | "username";

type ResultItem = {
  source: ResultSource;
  user: UserSearchResult;
};

type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; items: ResultItem[]; phoneE164?: string }
  | { kind: "notFound"; phoneE164?: string }
  | { kind: "error"; message: string };

const DEFAULT_COUNTRY_CODE = "+86";

export function AddContactScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation = useNavigation<Navigation>();
  const props = useAddContactProps();
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });
  const [addingId, setAddingId] = useState<number | null>(null);

  const local = useMemo(() => makeStyles(theme), [theme]);
  const submitDisabled = query.trim().length === 0 || lookup.kind === "loading";

  async function handleSubmit() {
    const trimmed = query.trim();
    if (!trimmed) {
      setLookup({
        kind: "error",
        message: t("addContactScreen.invalidInput")
      });
      return;
    }
    const kind = classifyAddContactInput(trimmed);
    setLookup({ kind: "loading" });
    const defaultCountryCode = countryCode.trim() || undefined;

    try {
      if (kind.kind === "e164") {
        const r = await props.onLookupByPhone({
          phoneE164: kind.phoneE164,
          defaultCountryCode
        });
        if (r.matched && r.user) {
          setLookup({
            kind: "results",
            items: [{ source: "phone", user: r.user }],
            phoneE164: r.phoneE164
          });
        } else {
          setLookup({ kind: "notFound", phoneE164: r.phoneE164 });
        }
        return;
      }

      if (kind.kind === "keyword") {
        const list = await props.onSearchUsers(kind.raw);
        if (list.length === 0) {
          setLookup({ kind: "notFound" });
        } else {
          setLookup({
            kind: "results",
            items: list.map(user => ({
              source: "username" as ResultSource,
              user
            }))
          });
        }
        return;
      }

      // ambiguous: try both endpoints in parallel and merge
      const [phoneRes, searchRes] = await Promise.allSettled([
        props.onLookupByPhone({
          phoneE164: kind.raw,
          defaultCountryCode
        }),
        props.onSearchUsers(kind.raw)
      ]);
      const items: ResultItem[] = [];
      let phoneE164: string | undefined;

      if (phoneRes.status === "fulfilled") {
        phoneE164 = phoneRes.value.phoneE164;
        if (phoneRes.value.matched && phoneRes.value.user) {
          items.push({ source: "phone", user: phoneRes.value.user });
        }
      }
      if (searchRes.status === "fulfilled") {
        for (const u of searchRes.value) {
          if (items.some(it => it.user.user_id === u.user_id)) continue;
          items.push({ source: "username", user: u });
        }
      }

      // If both failed, surface the first error.
      if (phoneRes.status === "rejected" && searchRes.status === "rejected") {
        const err = phoneRes.reason ?? searchRes.reason;
        setLookup({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : t("addContactScreen.lookupFailed")
        });
        return;
      }

      if (items.length === 0) {
        setLookup({ kind: "notFound", phoneE164 });
      } else {
        setLookup({ kind: "results", items, phoneE164 });
      }
    } catch (error) {
      setLookup({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : t("addContactScreen.lookupFailed")
      });
    }
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
    try {
      await props.onOpenChatByUserId(Number(user.user_id));
      navigation.goBack();
    } catch {
      // global status banner already surfaces the failure
    }
  }

  function handleEditRemark(user: UserSearchResult) {
    props.onOpenContactProfile({
      userId: Number(user.user_id),
      nickname: user.nickname || user.username || "",
      avatarUrl: user.avatar_url || null
    });
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

  return (
    <AccountPageShell
      title={t("addContactScreen.title")}
      onBack={() => navigation.goBack()}
      testID="add-contact-screen"
    >
      <ScrollView
        style={styles.meScreenEditorScroll}
        contentContainerStyle={local.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={local.formCard}>
          <Text style={local.label}>
            {t("addContactScreen.countryCodeLabel")}
          </Text>
          <TextInput
            value={countryCode}
            onChangeText={setCountryCode}
            placeholder="+86"
            placeholderTextColor={theme.colors.inputPlaceholder}
            style={styles.authInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="phone-pad"
            maxLength={PHONE_MAX_LENGTH}
            testID="add-contact-country-code"
          />
          <View style={local.spacer12} />
          <Text style={local.label}>{t("addContactScreen.queryLabel")}</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("addContactScreen.queryPlaceholder")}
            placeholderTextColor={theme.colors.inputPlaceholder}
            style={styles.authInput}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={SEARCH_KEYWORD_MAX_LENGTH}
            testID="add-contact-query"
          />
          <View style={local.spacer16} />
          <PrimaryButton
            label={t("addContactScreen.submit")}
            loading={lookup.kind === "loading"}
            onPress={handleSubmit}
            disabled={submitDisabled}
            testID="add-contact-submit"
          />
        </View>

        {lookup.kind === "loading" ? (
          <View style={local.statusBlock}>
            <ActivityIndicator color={theme.colors.accentStrong} />
          </View>
        ) : null}

        {lookup.kind === "error" ? (
          <View style={local.statusBlock}>
            <Text style={local.errorText}>{lookup.message}</Text>
          </View>
        ) : null}

        {lookup.kind === "results" && lookup.items.length > 0 ? (
          <Text style={local.resultsSectionTitle}>
            {t("addContactScreen.resultsSectionTitle")}
          </Text>
        ) : null}

        {lookup.kind === "results"
          ? lookup.items.map(item => {
              const user = item.user;
              const avatarColor = colorFromSeed(
                user.nickname || user.username || "user",
                theme.avatarPalette
              );
              const isAdding = addingId === Number(user.user_id);
              return (
                <View
                  key={`${item.source}-${user.user_id}`}
                  style={local.resultCard}
                  testID={`add-contact-result-${user.user_id}`}
                >
                  <View style={local.userRow}>
                    <AppAvatar
                      label={user.nickname || user.username || "?"}
                      imageUrl={user.avatar_url || undefined}
                      style={[
                        local.userAvatar,
                        { backgroundColor: avatarColor }
                      ]}
                      textStyle={styles.contactsAvatarText}
                    />
                    <View style={local.flex1}>
                      <Text style={local.userName} numberOfLines={1}>
                        {user.nickname || user.username}
                      </Text>
                      <Text style={local.userMeta} numberOfLines={1}>
                        @{user.username}
                      </Text>
                    </View>
                    {!user.is_already_contact ? (
                      <Pressable
                        onPress={() => void handleAdd(item)}
                        disabled={addingId !== null}
                        style={({ pressed }) => [
                          local.addIconButton,
                          pressed && addingId === null
                            ? local.addIconButtonPressed
                            : null,
                          addingId !== null && !isAdding
                            ? local.addIconButtonDisabled
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
                            name="add-circle-outline"
                            size={26}
                            color={theme.colors.accentStrong}
                          />
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                  {user.is_already_contact ? (
                    <View style={local.actionRow}>
                      <PrimaryButton
                        label={t("addContactScreen.openChat")}
                        onPress={() => void handleOpenChat(user)}
                        testID={`add-contact-open-chat-${user.user_id}`}
                      />
                      <View style={local.gap12} />
                      <PrimaryButton
                        tone="secondary"
                        label={t("addContactScreen.editRemark")}
                        onPress={() => handleEditRemark(user)}
                        testID={`add-contact-edit-remark-${user.user_id}`}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })
          : null}

        {lookup.kind === "notFound" ? (
          <View style={local.resultCard} testID="add-contact-not-found">
            <Text style={local.resultTitle}>
              {lookup.phoneE164
                ? t("addContactScreen.notFoundPhoneTitle")
                : t("addContactScreen.notFoundTitle")}
            </Text>
            <Text style={local.userMeta}>
              {lookup.phoneE164
                ? t("addContactScreen.notFoundPhoneDesc")
                : t("addContactScreen.notFoundDesc")}
            </Text>
            {lookup.phoneE164 ? (
              <>
                <View style={local.spacer12} />
                <PrimaryButton
                  label={t("addContactScreen.invite")}
                  onPress={() => void handleInvite(lookup.phoneE164 as string)}
                  testID="add-contact-invite"
                />
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </AccountPageShell>
  );
}

function makeStyles(theme: ReturnType<typeof useAppTheme>["theme"]) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 32
    },
    formCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 12
    },
    label: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
      marginBottom: 6
    },
    spacer12: { height: 12 },
    spacer16: { height: 16 },
    gap12: { width: 12 },
    flex1: { flex: 1 },
    statusBlock: {
      alignItems: "center",
      padding: 12
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 14
    },
    resultCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 8
    },
    resultTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 8
    },
    userRow: {
      flexDirection: "row",
      alignItems: "center"
    },
    userAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      marginRight: 10
    },
    userName: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "600"
    },
    userMeta: {
      color: theme.colors.textMuted,
      fontSize: 12
    },
    addIconButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      marginLeft: 8,
      alignItems: "center",
      justifyContent: "center"
    },
    addIconButtonPressed: {
      opacity: 0.6
    },
    addIconButtonDisabled: {
      opacity: 0.4
    },
    resultsSectionTitle: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginTop: 4,
      marginBottom: 8,
      paddingHorizontal: 4
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 12
    }
  });
}

import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MobileMessageSearchResult } from "@mushroom/app-core";
import { EmptyState } from "../../../components/ui";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import { useAppTheme } from "../../../styles/app-styles";
import { formatDateTime } from "../../../utils/app-ui";
import { mobileAppController } from "../../../services/app-runtime";
import { getReadableErrorMessage } from "../../../utils/error-message";
import { AccountPageShell } from "../../account/AccountPageShell";
import type { AppStackParamList } from "../../../types/navigation";
import { useWorkspaceSearch } from "../context/WorkspaceSearchContext";

const SEARCH_DEBOUNCE_MS = 180;

export function WorkspaceSearchScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const ctx = useWorkspaceSearch();

  // Local state survives across pop-from-Chat so the user returns to their
  // previous keyword + results (T6 spec, option a).
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<MobileMessageSearchResult[]>([]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);
  const unmountedRef = useRef(false);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  function scheduleSearch(nextKeyword: string) {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const trimmed = nextKeyword.trim();
    if (!trimmed) {
      reqIdRef.current += 1;
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(() => {
      const reqId = ++reqIdRef.current;
      void mobileAppController
        .searchMessages({
          keyword: trimmed,
          scope: "all",
          filter: "all"
        })
        .then(next => {
          if (unmountedRef.current || reqId !== reqIdRef.current) return;
          setResults(next);
        })
        .catch(err => {
          if (unmountedRef.current || reqId !== reqIdRef.current) return;
          ctx.onError(getReadableErrorMessage(err));
        });
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleChange(value: string) {
    setKeyword(value);
    scheduleSearch(value);
  }

  function handleOpen(result: MobileMessageSearchResult) {
    ctx.onOpenResult(result);
  }

  return (
    <AccountPageShell
      title={t("chatMedia.workspaceTitle")}
      onBack={() => navigation.goBack()}
      testID="workspace-search-screen"
    >
      <TextInput
        value={keyword}
        onChangeText={handleChange}
        placeholder={t("chatMedia.workspaceSearchPlaceholder")}
        placeholderTextColor={theme.colors.inputPlaceholder}
        style={styles.searchInput}
        autoFocus
        maxLength={SEARCH_KEYWORD_MAX_LENGTH}
        returnKeyType="search"
        testID="workspace-search-input"
      />
      <ScrollView
        style={styles.flexList}
        contentContainerStyle={styles.cardList}
        keyboardShouldPersistTaps="handled"
      >
        {results.length > 0 ? (
          results.slice(0, 30).map(result => (
            <Pressable
              key={`workspace:${result.message.client_message_id}`}
              style={styles.listCard}
              onPress={() => handleOpen(result)}
              testID={`workspace-search-result:${result.message.client_message_id}`}
            >
              <Text style={styles.listCardTitle}>
                {result.conversation.name}
              </Text>
              <Text style={styles.listCardSubtitle}>
                {result.message.sender_nickname ||
                  t("chatMessage.unknownUser", {
                    id: result.message.sender_id
                  })}
                {` · ${formatDateTime(result.message.created_at)}`}
              </Text>
              <Text style={styles.listCardMeta}>{result.summary}</Text>
            </Pressable>
          ))
        ) : keyword.trim() ? (
          <EmptyState label={t("chatMedia.noResults")} />
        ) : (
          <EmptyState label={t("chatMedia.workspaceHint")} />
        )}
      </ScrollView>
    </AccountPageShell>
  );
}

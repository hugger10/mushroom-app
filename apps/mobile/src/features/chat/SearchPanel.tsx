import type {
  MobileMessageSearchFilter,
  MobileMessageSearchResult
} from "@mushroom/app-core";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import { SmallChip } from "../../components/ui";
import { SearchResultRow } from "./SearchResultRow";
import { EmptyState } from "../../components/ui";
import { useAppTheme } from "../../styles/app-styles";
import { SEARCH_FILTERS } from "../../utils/app-ui";

export function SearchPanel(props: {
  searchKeyword: string;
  searchFilter: MobileMessageSearchFilter;
  searchResults: MobileMessageSearchResult[];
  highlightedMessageId: string | null;
  onChangeKeyword: (value: string) => void;
  onChangeFilter: (filter: MobileMessageSearchFilter) => void;
  onSelectResult: (result: MobileMessageSearchResult) => void;
}) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  return (
    <View style={styles.searchPanel}>
      <TextInput
        value={props.searchKeyword}
        onChangeText={props.onChangeKeyword}
        placeholder={t("chatDetail.searchPlaceholder")}
        placeholderTextColor={theme.colors.inputPlaceholder}
        style={styles.searchInput}
        maxLength={SEARCH_KEYWORD_MAX_LENGTH}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.searchFilterRow}
      >
        {SEARCH_FILTERS.map(filter => (
          <SmallChip
            key={filter.key}
            label={t(`chatDetail.searchFilters.${filter.key}`)}
            active={props.searchFilter === filter.key}
            onPress={() => props.onChangeFilter(filter.key)}
          />
        ))}
      </ScrollView>
      {props.searchResults.length > 0 ? (
        <View style={styles.searchResultsList}>
          {props.searchResults.slice(0, 6).map(result => (
            <SearchResultRow
              key={`${result.message.client_message_id}:${result.message.server_message_id}`}
              result={result}
              active={
                props.highlightedMessageId === result.message.client_message_id
              }
              onPress={() => props.onSelectResult(result)}
            />
          ))}
        </View>
      ) : props.searchKeyword.trim() || props.searchFilter !== "all" ? (
        <EmptyState label={t("chatDetail.searchNoResults")} />
      ) : (
        <Text style={styles.searchHint}>
          {t("chatDetail.searchFiltersHint")}
        </Text>
      )}
    </View>
  );
}

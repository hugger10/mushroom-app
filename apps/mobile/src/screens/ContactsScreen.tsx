import type { ContactListItem } from "@mushroom/shared";
import { pinyin } from "pinyin-pro";
import { useMemo } from "react";
import { SectionList, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../components/ui";
import { ContactRow, FunctionEntryRow } from "../features/contacts";
import { useAppTheme } from "../styles/app-styles";

function getInitialLetter(name: string): string {
  if (!name) return "#";
  const char = name.trim()[0];
  if (!char) return "#";
  if (/[a-zA-Z]/.test(char)) return char.toUpperCase();
  const py = pinyin(char, { toneType: "none", type: "array" })[0];
  if (py && /[a-zA-Z]/.test(py[0])) return py[0].toUpperCase();
  return "#";
}

export function ContactsScreen(props: {
  /**
   * 调用方必须传入"未被屏蔽"的联系人列表（即已过滤 is_blocked === true）。
   * 屏蔽用户的查看/管理在"我的 → 账户与安全 → 已屏蔽用户"页面。
   */
  availableContacts: ContactListItem[];
  searchQuery?: string;
  onOpenContactProfile: (contact: ContactListItem) => void;
  onRemarkContact?: (contact: ContactListItem) => void;
  onOpenGroups?: () => void;
  onOpenTags?: () => void;
}) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const query = props.searchQuery ?? "";

  const trimmedQuery = query.trim().toLowerCase();
  const filteredContacts = useMemo(() => {
    if (!trimmedQuery) return props.availableContacts;
    return props.availableContacts.filter(c => {
      const name = c.remark_name || c.nickname || c.username || "";
      if (name.toLowerCase().includes(trimmedQuery)) return true;
      const initials = name
        .split("")
        .map(ch => {
          const py = pinyin(ch, { toneType: "none", type: "array" })[0];
          return py ? py[0].toLowerCase() : ch.toLowerCase();
        })
        .join("");
      return initials.includes(trimmedQuery);
    });
  }, [props.availableContacts, trimmedQuery]);

  const sections = useMemo(() => {
    const groups: Record<string, ContactListItem[]> = {};
    filteredContacts.forEach(f => {
      const initial = getInitialLetter(
        f.remark_name || f.nickname || f.username || ""
      );
      if (!groups[initial]) groups[initial] = [];
      groups[initial].push(f);
    });
    const keys = Object.keys(groups).sort((a, b) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });
    return keys.map(title => ({ title, data: groups[title] }));
  }, [filteredContacts]);

  const isSearching = trimmedQuery.length > 0;

  const ListHeader = (
    <View>
      {!isSearching ? (
        <>
          {/* Function entry section */}
          {props.onOpenGroups || props.onOpenTags ? (
            <View style={styles.funcEntrySection}>
              {props.onOpenGroups ? (
                <FunctionEntryRow
                  icon="people-outline"
                  iconColor={theme.colors.accent}
                  iconBg={theme.colors.accentSoft}
                  label={t("contacts.groups")}
                  onPress={props.onOpenGroups}
                  testID="contacts-entry-groups"
                  isLast={!props.onOpenTags}
                />
              ) : null}
              {props.onOpenTags ? (
                <FunctionEntryRow
                  icon="pricetag-outline"
                  iconColor={theme.colors.success}
                  iconBg={theme.colors.successSoft}
                  label={t("contacts.tags")}
                  onPress={props.onOpenTags}
                  testID="contacts-entry-tags"
                  isLast
                />
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );

  return (
    <View style={styles.contactsShell}>
      <SectionList
        style={styles.contactsList}
        contentContainerStyle={{ paddingBottom: 132 }}
        showsVerticalScrollIndicator={false}
        bounces
        alwaysBounceVertical
        overScrollMode="always"
        sections={sections}
        stickySectionHeadersEnabled
        initialNumToRender={20}
        keyExtractor={item => `contact:${item.user_id}`}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <EmptyState
            label={
              isSearching ? t("contacts.emptySearch") : t("contacts.noContacts")
            }
          />
        }
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.contactsSectionHeader}>
            <Text style={styles.contactsSectionHeaderText}>{title}</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <ContactRow
            contact={item}
            onPress={() => props.onOpenContactProfile(item)}
            onRemark={
              props.onRemarkContact
                ? () => props.onRemarkContact!(item)
                : undefined
            }
            isLast={index === section.data.length - 1}
          />
        )}
      />
    </View>
  );
}

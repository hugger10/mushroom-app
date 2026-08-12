import { Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "react-native-vector-icons/Ionicons";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import { useAppTheme } from "../../styles/app-styles";
import { EmptyState } from "./EmptyState";

export function SearchOverlay(props: {
  visible: boolean;
  query: string;
  onChangeQuery: (text: string) => void;
  onClose: () => void;
  placeholder: string;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();

  if (!props.visible) return null;

  return (
    <View style={styles.searchOverlay}>
      <View
        style={[styles.searchOverlayHeader, { paddingTop: insets.top + 2 }]}
      >
        <View style={styles.searchOverlayInputRow}>
          <Ionicons name="search" size={16} color={theme.colors.textSoft} />
          <TextInput
            style={styles.searchOverlayInput}
            placeholder={props.placeholder}
            placeholderTextColor={theme.colors.inputPlaceholder}
            value={props.query}
            onChangeText={props.onChangeQuery}
            autoFocus
            maxLength={SEARCH_KEYWORD_MAX_LENGTH}
            returnKeyType="search"
          />
        </View>
        <Pressable
          onPress={props.onClose}
          hitSlop={8}
          style={styles.searchOverlayCloseBtn}
        >
          <Ionicons name="close" size={18} color={theme.colors.text} />
        </Pressable>
      </View>
      <View style={styles.searchOverlayContent}>
        {props.query.trim() ? (
          props.children
        ) : (
          <EmptyState label={props.emptyLabel} />
        )}
      </View>
    </View>
  );
}

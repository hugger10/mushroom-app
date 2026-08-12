import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useAppTheme } from "../../../styles/app-styles";
import { AccountPageShell } from "../AccountPageShell";
import { SaveHeaderButton } from "../../../components/ui/SaveHeaderButton";
import { CharCounter } from "../../../components/ui/CharCounter";
import { useMeProps } from "../MeContext";
import { getProfileFieldLabelKey, TEXT_FIELD_CONFIG } from "../profile-fields";
import type { AppStackParamList } from "../../../types/navigation";

/**
 * Full-screen text editor for the text-based profile fields
 * (nickname / email / phone / signature).
 *
 * Follows the interaction pattern used by the rest of the app
 * (e.g. PeerProfileRemarkScreen): a single input card on a dedicated screen
 * with a header save button that becomes enabled only when the value changes.
 */
export function ProfileTextFieldEditScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "MyProfileFieldEdit">>();
  const me = useMeProps();

  const field = route.params.field;
  const label = t(getProfileFieldLabelKey(field));
  const config = TEXT_FIELD_CONFIG[field];
  const initialValue = me.profileForm[field] || "";

  const [draft, setDraft] = useState(initialValue);
  const [pending, setPending] = useState(false);

  const trimmed = draft.trim();
  const canSave =
    !pending &&
    (field !== "nickname" || trimmed.length > 0) &&
    trimmed !== initialValue.trim();

  async function handleSave() {
    if (!canSave) return;
    setPending(true);
    try {
      // onSaveProfile accepts the patch so the server sync always sees the
      // value the user just typed, regardless of React state timing.
      const ok = await me.onSaveProfile({ [field]: trimmed });
      if (ok) navigation.goBack();
    } finally {
      setPending(false);
    }
  }

  return (
    <AccountPageShell
      title={label}
      onBack={() => navigation.goBack()}
      testID={`profile-field-edit-${field}`}
      rightAction={
        <SaveHeaderButton
          onPress={handleSave}
          pending={pending}
          disabled={!canSave}
          testID={`profile-field-save-${field}`}
        />
      }
    >
      <ScrollView
        style={styles.groupInfoScroll}
        contentContainerStyle={[
          styles.groupInfoScrollContent,
          { paddingTop: 16 }
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.groupInfoEditCard}>
          <TextInput
            style={[
              styles.groupInfoEditInput,
              config.multiline && styles.groupInfoEditTextArea
            ]}
            value={draft}
            onChangeText={setDraft}
            placeholder={label}
            placeholderTextColor={theme.colors.inputPlaceholder}
            keyboardType={config.keyboardType || "default"}
            autoCapitalize={config.autoCapitalize || "sentences"}
            maxLength={config.maxLength}
            multiline={config.multiline}
            autoFocus
            testID={`profile-field-input-${field}`}
          />
          {config.multiline && config.maxLength ? (
            <CharCounter
              current={draft.length}
              max={config.maxLength}
              testID={`profile-field-counter-${field}`}
            />
          ) : null}
        </View>
      </ScrollView>
    </AccountPageShell>
  );
}

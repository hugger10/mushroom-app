import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "../../../styles/app-styles";
import { CONTACT_REMARK_MAX_LENGTH } from "@mushroom/shared";
import type { AppStackParamList } from "../../../types/navigation";
import { SaveHeaderButton } from "../../../components/ui/SaveHeaderButton";
import { SubPanelHeader } from "../../../components/ui/SubPanelHeader";
import { usePeerProfile } from "../context/PeerProfileContext";

export function PeerProfileRemarkScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "PeerProfileRemark">>();
  const ctx = usePeerProfile();

  const { userId } = route.params;
  const derived = ctx.getDerived(userId);

  const [remarkNameDraft, setRemarkNameDraft] = useState(
    derived.initialRemarkName || ""
  );
  const [pending, setPending] = useState(false);

  async function handleSave() {
    if (!ctx.onSaveContactRemark) return;
    setPending(true);
    try {
      await ctx.onSaveContactRemark({
        userId,
        remarkName: remarkNameDraft
      });
      navigation.goBack();
    } finally {
      setPending(false);
    }
  }

  const bottomInset = Math.max(insets.bottom, 12);

  return (
    <View
      style={[styles.groupInfoPage, { flex: 1, paddingBottom: bottomInset }]}
    >
      <SubPanelHeader
        title={t("peerProfile.remarkTitle")}
        onBack={() => navigation.goBack()}
        rightElement={
          <SaveHeaderButton
            title={t("common.save")}
            onPress={handleSave}
            pending={pending}
          />
        }
      />
      <ScrollView
        style={styles.groupInfoScroll}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
      >
        <View style={styles.groupInfoEditCard}>
          <Text style={styles.groupInfoEditLabel}>
            {t("peerProfile.remark")}
          </Text>
          <TextInput
            style={styles.groupInfoEditInput}
            value={remarkNameDraft}
            onChangeText={setRemarkNameDraft}
            placeholder={t("peerProfile.remarkPlaceholder")}
            placeholderTextColor={theme.colors.inputPlaceholder}
            maxLength={CONTACT_REMARK_MAX_LENGTH}
          />
        </View>
      </ScrollView>
    </View>
  );
}

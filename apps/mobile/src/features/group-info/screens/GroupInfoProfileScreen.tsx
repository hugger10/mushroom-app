import { ScrollView, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH
} from "@mushroom/shared";
import { useAppTheme } from "../../../styles/app-styles";
import type { AppStackParamList } from "../../../types/navigation";
import { useGroupManage } from "../context/GroupManageContext";
import { SaveHeaderButton } from "../../../components/ui/SaveHeaderButton";
import { SubPanelHeader } from "../../../components/ui/SubPanelHeader";
import { CharCounter } from "../../../components/ui/CharCounter";

export function GroupInfoProfileScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const props = useGroupManage();

  const currentRole = props.currentGroupMemberRole;
  const isAdmin = currentRole >= 1;
  const isOwner = currentRole === 2;
  const canEdit =
    props.groupSettings.profile_edit_permission === "owner_only"
      ? isOwner
      : isAdmin;

  const rightElement = canEdit ? (
    <SaveHeaderButton
      title={t("common.save")}
      onPress={props.onSaveGroupProfile}
      pending={props.pending}
    />
  ) : undefined;

  return (
    <View
      style={[
        styles.groupInfoPage,
        {
          flex: 1,
          paddingBottom: Math.max(insets.bottom, 12)
        }
      ]}
    >
      <SubPanelHeader
        title={t("groupInfo.profileTitle")}
        onBack={() => navigation.goBack()}
        rightElement={rightElement}
      />
      <ScrollView
        style={styles.groupInfoScroll}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
      >
        <View style={styles.groupInfoEditCard}>
          <Text style={styles.groupInfoEditLabel}>
            {t("groupInfo.groupNameLabel")}
          </Text>
          <TextInput
            style={styles.groupInfoEditInput}
            value={props.groupNameDraft}
            onChangeText={props.onChangeGroupName}
            placeholder={t("groupInfo.groupNamePlaceholder")}
            placeholderTextColor={theme.colors.inputPlaceholder}
            maxLength={GROUP_NAME_MAX_LENGTH}
            editable={canEdit}
          />
          <Text style={styles.groupInfoEditLabel}>
            {t("groupInfo.groupDescriptionLabel")}
          </Text>
          <TextInput
            style={[styles.groupInfoEditInput, styles.groupInfoEditTextArea]}
            value={props.groupDescriptionDraft}
            onChangeText={props.onChangeGroupDescription}
            placeholder={t("groupInfo.groupDescriptionPlaceholder")}
            placeholderTextColor={theme.colors.inputPlaceholder}
            multiline
            maxLength={GROUP_DESCRIPTION_MAX_LENGTH}
            editable={canEdit}
          />
          {canEdit ? (
            <CharCounter
              current={props.groupDescriptionDraft.length}
              max={GROUP_DESCRIPTION_MAX_LENGTH}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

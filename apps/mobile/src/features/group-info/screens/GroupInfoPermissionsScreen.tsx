import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Divider, ListRow } from "../../../components/overlays/info-rows";
import { useAppTheme } from "../../../styles/app-styles";
import type { AppStackParamList } from "../../../types/navigation";
import { useGroupManage } from "../context/GroupManageContext";
import { SaveHeaderButton } from "../../../components/ui/SaveHeaderButton";
import { SubPanelHeader } from "../../../components/ui/SubPanelHeader";

export function GroupInfoPermissionsScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const props = useGroupManage();

  const currentRole = props.currentGroupMemberRole;
  const isAdmin = currentRole >= 1;
  const isOwner = currentRole === 2;

  const sendMessagesValue = props.groupMuteAll
    ? t("groupInfo.adminsOnly")
    : t("groupInfo.allMembers");
  const editInfoValue =
    props.groupProfileEditPermission === "owner_only"
      ? t("groupInfo.ownerOnly")
      : t("groupInfo.admins");
  const addMembersValue =
    props.groupInvitePermission === "admins_only"
      ? t("groupInfo.adminsOnly")
      : t("groupInfo.allMembers");

  const canEditMute = isAdmin;
  const canEditInvite = isOwner;
  const canEditProfilePerm = isOwner;
  const canSave = canEditMute || canEditInvite || canEditProfilePerm;

  const rightElement = canSave ? (
    <SaveHeaderButton
      title={t("common.save")}
      onPress={props.onSaveGroupSettings}
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
        title={t("groupInfo.permissions")}
        onBack={() => navigation.goBack()}
        rightElement={rightElement}
      />
      <ScrollView
        style={styles.groupInfoScroll}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <View style={styles.chatInfoSection}>
          <View style={styles.chatInfoSectionHeader}>
            <Text style={styles.chatInfoSectionTitle}>
              {t("groupInfo.whoCan")}
            </Text>
          </View>
          <ListRow
            styles={styles}
            theme={theme}
            icon="chatbubble-ellipses-outline"
            title={t("groupInfo.sendMessages")}
            metaText={sendMessagesValue}
            showChevron={canEditMute}
            disabled={!canEditMute}
            onPress={
              canEditMute
                ? () =>
                    navigation.navigate("GroupInfoPermissionChoice", {
                      field: "send_messages"
                    })
                : undefined
            }
          />
          <Divider styles={styles} />
          <ListRow
            styles={styles}
            theme={theme}
            icon="create-outline"
            title={t("groupInfo.editGroupInfo")}
            metaText={editInfoValue}
            showChevron={canEditProfilePerm}
            disabled={!canEditProfilePerm}
            onPress={
              canEditProfilePerm
                ? () =>
                    navigation.navigate("GroupInfoPermissionChoice", {
                      field: "edit_info"
                    })
                : undefined
            }
          />
          <Divider styles={styles} />
          <ListRow
            styles={styles}
            theme={theme}
            icon="person-add-outline"
            title={t("groupInfo.inviteMembers")}
            metaText={addMembersValue}
            showChevron={canEditInvite}
            disabled={!canEditInvite}
            onPress={
              canEditInvite
                ? () =>
                    navigation.navigate("GroupInfoPermissionChoice", {
                      field: "add_members"
                    })
                : undefined
            }
          />
        </View>

        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 4
          }}
        >
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: 12,
              lineHeight: 18
            }}
          >
            {isOwner
              ? t("groupInfo.permHintOwner")
              : isAdmin
                ? t("groupInfo.permHintAdmin")
                : t("groupInfo.permHintMember")}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

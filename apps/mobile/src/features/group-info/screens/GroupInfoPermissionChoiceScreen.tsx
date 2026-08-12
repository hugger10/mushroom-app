import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  useNavigation,
  useRoute,
  type RouteProp
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "react-native-vector-icons/Ionicons";
import { Divider } from "../../../components/overlays/info-rows";
import { useAppTheme } from "../../../styles/app-styles";
import type { AppStackParamList } from "../../../types/navigation";
import { useGroupManage } from "../context/GroupManageContext";
import { SubPanelHeader } from "../../../components/ui/SubPanelHeader";

export function GroupInfoPermissionChoiceScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route =
    useRoute<RouteProp<AppStackParamList, "GroupInfoPermissionChoice">>();
  const props = useGroupManage();
  const field = route.params.field;

  type Option = {
    key: string;
    label: string;
    selected: boolean;
    onSelect: () => void;
  };
  let title = "";
  let description = "";
  let options: Option[] = [];

  if (field === "send_messages") {
    title = t("groupInfo.sendMessages");
    description = t("groupInfo.sendMessagesDesc");
    options = [
      {
        key: "all",
        label: t("groupInfo.allMembers"),
        selected: !props.groupMuteAll,
        onSelect: () => props.onChangeGroupMuteAll(false)
      },
      {
        key: "admins",
        label: t("groupInfo.adminsOnly"),
        selected: props.groupMuteAll,
        onSelect: () => props.onChangeGroupMuteAll(true)
      }
    ];
  } else if (field === "edit_info") {
    title = t("groupInfo.editGroupInfo");
    description = t("groupInfo.editInfoDesc");
    options = [
      {
        key: "admins",
        label: t("groupInfo.admins"),
        selected: props.groupProfileEditPermission === "admins",
        onSelect: () => props.onChangeGroupProfileEditPermission("admins")
      },
      {
        key: "owner",
        label: t("groupInfo.ownerOnly"),
        selected: props.groupProfileEditPermission === "owner_only",
        onSelect: () => props.onChangeGroupProfileEditPermission("owner_only")
      }
    ];
  } else {
    title = t("groupInfo.inviteMembers");
    description = t("groupInfo.inviteDesc");
    options = [
      {
        key: "all",
        label: t("groupInfo.allMembers"),
        selected: props.groupInvitePermission === "all_members",
        onSelect: () => props.onChangeGroupInvitePermission("all_members")
      },
      {
        key: "admins",
        label: t("groupInfo.adminsOnly"),
        selected: props.groupInvitePermission === "admins_only",
        onSelect: () => props.onChangeGroupInvitePermission("admins_only")
      }
    ];
  }

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
      <SubPanelHeader title={title} onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.groupInfoScroll}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <View
          style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}
        >
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: 13,
              lineHeight: 19
            }}
          >
            {description}
          </Text>
        </View>
        <View style={styles.chatInfoSection}>
          {options.map((opt, idx) => (
            <View key={opt.key}>
              <Pressable
                style={styles.chatInfoListRow}
                onPress={() => {
                  opt.onSelect();
                  navigation.goBack();
                }}
              >
                <View style={styles.chatInfoListRowBody}>
                  <Text style={styles.chatInfoListRowTitle}>{opt.label}</Text>
                </View>
                {opt.selected ? (
                  <Ionicons
                    name="checkmark"
                    size={22}
                    color={theme.colors.accent}
                  />
                ) : null}
              </Pressable>
              {idx < options.length - 1 ? <Divider styles={styles} /> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

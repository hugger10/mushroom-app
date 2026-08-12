import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppAvatar, SwipeableActionRow } from "../../../components/ui";
import { Divider, ListRow } from "../../../components/overlays/info-rows";
import { hapticHeavy } from "../../../platform/haptics";
import { useAppTheme } from "../../../styles/app-styles";
import { colorFromSeed } from "../../../styles/theme";
import { getGroupRoleLabel } from "../../../utils/app-ui";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import type { AppStackParamList } from "../../../types/navigation";
import { useGroupManage } from "../context/GroupManageContext";
import { SubPanelHeader } from "../../../components/ui/SubPanelHeader";
import type { MemberAction } from "../types";

export function GroupInfoMembersScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const props = useGroupManage();
  const [memberSearch, setMemberSearch] = useState("");
  const [actionTarget, setActionTarget] = useState<MemberAction | null>(null);

  const members = props.activeConversation?.members ?? [];
  const currentRole = props.currentGroupMemberRole;
  const isOwner = currentRole === 2;
  const isAdmin = currentRole >= 1;
  const canInvite =
    props.groupSettings.invite_permission === "admins_only"
      ? isAdmin
      : currentRole >= 0;

  const filtered = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const q = memberSearch.toLowerCase();
    return members.filter(
      m =>
        (m.nickname || "").toLowerCase().includes(q) ||
        String(m.user_id).includes(q)
    );
  }, [members, memberSearch]);

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
        title={t("groupInfo.memberListTitle", { count: members.length })}
        onBack={() => navigation.goBack()}
      />
      <View
        style={{
          backgroundColor: theme.colors.background,
          paddingBottom: 12
        }}
      >
        <View style={styles.groupInfoSearchBar}>
          <Ionicons name="search" size={18} color={theme.colors.textSoft} />
          <TextInput
            style={styles.groupInfoSearchInput}
            placeholder={t("groupInfo.searchMembers")}
            placeholderTextColor={theme.colors.inputPlaceholder}
            value={memberSearch}
            maxLength={SEARCH_KEYWORD_MAX_LENGTH}
            onChangeText={setMemberSearch}
          />
        </View>
      </View>
      <ScrollView style={styles.groupInfoScroll}>
        {canInvite ? (
          <View style={styles.chatInfoSection}>
            <ListRow
              styles={styles}
              theme={theme}
              icon="person-add"
              title={t("groupInfo.addMembers")}
              accentTitle
              onPress={() => navigation.navigate("GroupInfoInvite")}
            />
          </View>
        ) : null}
        <View style={styles.chatInfoSection}>
          {filtered.map((member, idx) => {
            const name =
              member.nickname ||
              t("groupInfo.unknownUser", { id: member.user_id });
            const role = Number(member.role || 0);
            const isMuted =
              !!member.muted_until &&
              new Date(member.muted_until).getTime() > Date.now();
            const isMe = Number(member.user_id) === Number(props.currentUserId);
            const color = colorFromSeed(name, theme.avatarPalette);
            const canManage = props.canManageGroupMember(
              Number(member.user_id),
              role
            );
            const subParts: string[] = [];
            if (role >= 1) subParts.push(getGroupRoleLabel(role, t));
            if (isMuted) subParts.push(t("groupInfo.muted"));
            const subtitle = subParts.join(" · ");

            const openSheet = () => {
              setActionTarget({
                memberId: Number(member.user_id),
                memberName: name,
                memberRole: role,
                isMuted
              });
            };

            const row = (
              <Pressable
                style={[
                  styles.chatInfoCompactRow,
                  styles.chatInfoCompactRowSurface
                ]}
                onPress={() => {
                  if (isMe) return;
                  props.onOpenMemberProfile?.(Number(member.user_id), name);
                }}
                onLongPress={() => {
                  hapticHeavy();
                  if (!isMe && (canManage || isOwner)) {
                    openSheet();
                  }
                }}
              >
                <AppAvatar
                  label={name}
                  imageUrl={member.avatar_url}
                  style={[
                    styles.chatInfoCompactAvatar,
                    { backgroundColor: color }
                  ]}
                  textStyle={styles.chatInfoCompactAvatarText}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.chatInfoCompactName} numberOfLines={1}>
                    {name}
                    {isMe ? t("groupInfo.meSuffix") : ""}
                  </Text>
                  {subtitle ? (
                    <Text style={styles.chatInfoCompactMeta} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );

            return (
              <View key={`ml:${member.user_id}`}>
                {canManage && !isMe ? (
                  <SwipeableActionRow
                    actionLabel={t("groupInfo.remove")}
                    onAction={() =>
                      props.onRemoveGroupMember(Number(member.user_id), name)
                    }
                  >
                    {row}
                  </SwipeableActionRow>
                ) : (
                  row
                )}
                {idx < filtered.length - 1 ? <Divider styles={styles} /> : null}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {actionTarget ? (
        <>
          <Pressable
            style={styles.overlayBackdrop}
            onPress={() => setActionTarget(null)}
          />
          <View style={styles.groupInfoActionSheet}>
            <View style={styles.groupInfoActionGroup}>
              <Pressable
                style={styles.groupInfoActionItem}
                onPress={() => {
                  const t = actionTarget;
                  setActionTarget(null);
                  props.onOpenMemberProfile?.(t.memberId, t.memberName);
                }}
              >
                <Text style={styles.groupInfoActionItemText}>
                  {t("groupInfo.viewProfile")}
                </Text>
              </Pressable>

              {isOwner && actionTarget.memberRole !== 2 ? (
                <Pressable
                  style={styles.groupInfoActionItem}
                  onPress={() => {
                    const t = actionTarget;
                    setActionTarget(null);
                    props.onToggleGroupMemberRole(
                      t.memberId,
                      t.memberRole === 1 ? 0 : 1
                    );
                  }}
                >
                  <Text style={styles.groupInfoActionItemText}>
                    {actionTarget.memberRole === 1
                      ? t("groupInfo.removeAdmin")
                      : t("groupInfo.makeAdmin")}
                  </Text>
                </Pressable>
              ) : null}

              {props.canManageGroupMember(
                actionTarget.memberId,
                actionTarget.memberRole
              ) ? (
                <>
                  <Pressable
                    style={styles.groupInfoActionItem}
                    onPress={() => {
                      const action = actionTarget;
                      setActionTarget(null);
                      props.onUpdateGroupMemberMute(action.memberId, 10);
                    }}
                  >
                    <Text style={styles.groupInfoActionItemText}>
                      {t("groupInfo.mute10min")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.groupInfoActionItem}
                    onPress={() => {
                      const action = actionTarget;
                      setActionTarget(null);
                      props.onUpdateGroupMemberMute(action.memberId, 60);
                    }}
                  >
                    <Text style={styles.groupInfoActionItemText}>
                      {t("groupInfo.mute1hour")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.groupInfoActionItem}
                    onPress={() => {
                      const action = actionTarget;
                      setActionTarget(null);
                      props.onUpdateGroupMemberMute(action.memberId, 24 * 60);
                    }}
                  >
                    <Text style={styles.groupInfoActionItemText}>
                      {t("groupInfo.mute1day")}
                    </Text>
                  </Pressable>
                  {actionTarget.isMuted ? (
                    <Pressable
                      style={styles.groupInfoActionItem}
                      onPress={() => {
                        const action = actionTarget;
                        setActionTarget(null);
                        props.onUpdateGroupMemberMute(action.memberId, null);
                      }}
                    >
                      <Text style={styles.groupInfoActionItemText}>
                        {t("groupInfo.unmute")}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}

              {isOwner && actionTarget.memberRole !== 2 ? (
                <Pressable
                  style={styles.groupInfoActionItem}
                  onPress={() => {
                    const action = actionTarget;
                    setActionTarget(null);
                    props.onTransferGroupOwner(
                      action.memberId,
                      action.memberName
                    );
                  }}
                >
                  <Text
                    style={[
                      styles.groupInfoActionItemText,
                      styles.groupInfoActionItemDanger
                    ]}
                  >
                    {t("groupInfo.transferOwnership")}
                  </Text>
                </Pressable>
              ) : null}

              {props.canManageGroupMember(
                actionTarget.memberId,
                actionTarget.memberRole
              ) ? (
                <Pressable
                  style={[
                    styles.groupInfoActionItem,
                    styles.groupInfoActionItemLast
                  ]}
                  onPress={() => {
                    const action = actionTarget;
                    setActionTarget(null);
                    props.onRemoveGroupMember(
                      action.memberId,
                      action.memberName
                    );
                  }}
                >
                  <Text
                    style={[
                      styles.groupInfoActionItemText,
                      styles.groupInfoActionItemDanger
                    ]}
                  >
                    {t("groupInfo.removeFromGroup")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              style={styles.groupInfoActionCancel}
              onPress={() => setActionTarget(null)}
            >
              <Text style={styles.groupInfoActionCancelText}>
                {t("common.cancel")}
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

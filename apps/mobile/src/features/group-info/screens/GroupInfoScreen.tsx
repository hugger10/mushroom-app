import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { PressableRow } from "../../../hooks/usePressAnimation";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppAvatar, GroupAvatar } from "../../../components/ui";
import {
  Divider,
  ListRow,
  QuickAction,
  ToggleSwitch
} from "../../../components/overlays/info-rows";
import { useAppTheme } from "../../../styles/app-styles";
import { colorFromSeed } from "../../../styles/theme";
import { getConversationAvatarSeed } from "../../../utils/display";
import { getGroupRoleLabel } from "../../../utils/app-ui";
import { notifyComingSoon } from "../../../utils/notify";
import { navigateApp, popToChat } from "../../../navigation/app-navigation";
import type { AppStackParamList } from "../../../types/navigation";
import { useGroupManage } from "../context/GroupManageContext";

const MAIN_MEMBER_PREVIEW = 7;

export function GroupInfoScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const props = useGroupManage();
  const bottomInset = Math.max(insets.bottom, 12);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  if (!props.activeConversation || props.activeConversation.type !== 2) {
    return null;
  }

  const members = props.activeConversation.members ?? [];
  const currentRole = props.currentGroupMemberRole;
  const isAdmin = currentRole >= 1;
  const isOwner = currentRole === 2;
  const canEditProfile =
    props.groupSettings.profile_edit_permission === "owner_only"
      ? isOwner
      : isAdmin;
  const canInvite =
    props.groupSettings.invite_permission === "admins_only"
      ? isAdmin
      : currentRole >= 0;

  const displayName =
    props.activeConversation.name || t("groupInfo.fallbackName");
  const displayAvatar = props.activeConversation.avatar_url;
  const avatarColor = colorFromSeed(displayName, theme.avatarPalette);

  const previewMembers = members.slice(0, MAIN_MEMBER_PREVIEW);
  const memberCount = members.length;
  const convId = props.activeConversation.client_conversation_id;
  const isConvMuted = !!props.activeConversation.is_muted;
  const isConvPinned = !!props.activeConversation.is_pinned;

  return (
    <View
      style={[styles.groupInfoPage, { flex: 1, paddingBottom: bottomInset }]}
    >
      <View
        style={[
          styles.groupInfoHeader,
          {
            backgroundColor: theme.colors.background,
            marginTop: -insets.top,
            paddingTop: insets.top,
            paddingHorizontal: 12,
            paddingVertical: 0,
            paddingBottom: 10,
            minHeight: 56 + insets.top
          }
        ]}
      >
        <PressableRow
          style={styles.chatInfoHeaderIconBtn}
          onPress={handleBack}
          idleColor="transparent"
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </PressableRow>
      </View>

      <ScrollView
        style={styles.groupInfoScroll}
        contentContainerStyle={styles.groupInfoScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.chatInfoHeroCenter}>
          <Pressable
            style={styles.chatInfoHeroAvatarWrap}
            onPress={
              canEditProfile
                ? () =>
                    props.onPickGroupAvatar
                      ? props.onPickGroupAvatar()
                      : notifyComingSoon(t("groupInfo.avatarUpload"))
                : undefined
            }
            disabled={!canEditProfile}
          >
            {!displayAvatar ? (
              <GroupAvatar
                seed={getConversationAvatarSeed(props.activeConversation)}
                name={displayName}
                size={112}
              />
            ) : (
              <AppAvatar
                label={displayName}
                imageUrl={displayAvatar}
                style={[
                  styles.chatInfoHeroAvatarLarge,
                  { backgroundColor: avatarColor }
                ]}
                textStyle={styles.chatInfoHeroAvatarLargeText}
              />
            )}
            {canEditProfile ? (
              <View style={styles.chatInfoHeroAvatarBadge}>
                <Ionicons
                  name="camera"
                  size={16}
                  color={theme.colors.textInverse}
                />
              </View>
            ) : null}
          </Pressable>

          <Pressable
            style={styles.chatInfoHeroNameRow}
            onPress={
              canEditProfile
                ? () => navigation.navigate("GroupInfoProfile")
                : undefined
            }
            disabled={!canEditProfile}
          >
            <Text style={styles.chatInfoHeroNameCenter} numberOfLines={2}>
              {displayName}
            </Text>
            {canEditProfile ? (
              <Ionicons
                name="pencil"
                size={16}
                color={theme.colors.textMuted}
              />
            ) : null}
          </Pressable>
          <Text style={styles.chatInfoHeroSubtitle}>
            {t("groupInfo.memberCount", { count: memberCount })}
          </Text>
        </View>

        <View style={styles.chatInfoQuickActionsRow}>
          <QuickAction
            styles={styles}
            theme={theme}
            icon="chatbubble-ellipses-outline"
            label={t("groupInfo.message")}
            onPress={() => popToChat()}
          />
          <QuickAction
            styles={styles}
            theme={theme}
            icon="search"
            label={t("groupInfo.search")}
            onPress={() => {
              navigation.goBack();
              props.onOpenSearchInChat?.();
            }}
          />
          {canInvite ? (
            <QuickAction
              styles={styles}
              theme={theme}
              icon="person-add"
              label={t("groupInfo.add")}
              onPress={() => navigation.navigate("GroupInfoInvite")}
            />
          ) : null}
        </View>

        <View style={styles.chatInfoSection}>
          <ListRow
            styles={styles}
            theme={theme}
            icon="document-text-outline"
            title={t("groupInfo.description")}
            subtitle={
              props.activeConversation.description ||
              (canEditProfile
                ? t("groupInfo.descriptionAddHint")
                : t("groupInfo.descriptionEmpty"))
            }
            showChevron={canEditProfile}
            onPress={
              canEditProfile
                ? () => navigation.navigate("GroupInfoProfile")
                : undefined
            }
          />
        </View>

        <View style={styles.chatInfoSection}>
          <ListRow
            styles={styles}
            theme={theme}
            icon="megaphone-outline"
            title={t("groupInfo.announcement")}
            subtitle={
              props.groupSettings.announcement
                ? props.groupSettings.announcement
                : t("groupInfo.announcementEmpty")
            }
            onPress={() => navigation.navigate("GroupInfoAnnouncement")}
            showChevron
          />
          <Divider styles={styles} />
          <ListRow
            styles={styles}
            theme={theme}
            icon={
              isConvMuted
                ? "notifications-off-outline"
                : "notifications-outline"
            }
            title={t("groupInfo.muteNotifications")}
            rightElement={
              <ToggleSwitch
                styles={styles}
                value={isConvMuted}
                onToggle={() => props.onToggleMute?.()}
                disabled={!props.onToggleMute}
              />
            }
          />
          <Divider styles={styles} />
          <ListRow
            styles={styles}
            theme={theme}
            icon={isConvPinned ? "pin" : "pin-off"}
            iconSet="lucide"
            title={t("groupInfo.pinChat")}
            rightElement={
              <ToggleSwitch
                styles={styles}
                value={isConvPinned}
                onToggle={() => props.onTogglePin?.()}
                disabled={!props.onTogglePin}
              />
            }
          />
          <Divider styles={styles} />
          <ListRow
            styles={styles}
            theme={theme}
            icon="images-outline"
            title={t("groupInfo.mediaAndFiles")}
            showChevron
            onPress={() =>
              navigateApp("ChatMedia", {
                clientConversationId: convId,
                title: displayName
              })
            }
          />
        </View>

        <View style={styles.chatInfoSection}>
          <View style={styles.chatInfoSectionHeader}>
            <Text style={styles.chatInfoSectionTitle}>
              {t("groupInfo.manageAndPermissions")}
            </Text>
          </View>
          <ListRow
            styles={styles}
            theme={theme}
            icon="shield-checkmark-outline"
            title={t("groupInfo.permissions")}
            onPress={() => navigation.navigate("GroupInfoPermissions")}
            showChevron
          />
        </View>

        <View style={styles.chatInfoSection}>
          <View style={styles.chatInfoSectionHeader}>
            <Text style={styles.chatInfoSectionTitle}>
              {t("groupInfo.memberTitle", { count: memberCount })}
            </Text>
            <Pressable
              hitSlop={8}
              onPress={() => navigation.navigate("GroupInfoMembers")}
            >
              <Ionicons
                name="search"
                size={20}
                color={theme.colors.textMuted}
              />
            </Pressable>
          </View>
          {canInvite ? (
            <>
              <ListRow
                styles={styles}
                theme={theme}
                icon="person-add"
                title={t("groupInfo.addMembers")}
                accentTitle
                onPress={() => navigation.navigate("GroupInfoInvite")}
              />
              <Divider styles={styles} />
            </>
          ) : null}
          {previewMembers.map((member, idx) => {
            const name =
              member.nickname ||
              t("groupInfo.unknownUser", { id: member.user_id });
            const role = Number(member.role || 0);
            const color = colorFromSeed(name, theme.avatarPalette);
            const isMe = Number(member.user_id) === Number(props.currentUserId);
            return (
              <View key={`mp:${member.user_id}`}>
                <Pressable
                  style={styles.chatInfoCompactRow}
                  onPress={() => {
                    if (isMe) return;
                    props.onOpenMemberProfile?.(Number(member.user_id), name);
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
                  <Text style={styles.chatInfoCompactName} numberOfLines={1}>
                    {name}
                    {isMe ? t("groupInfo.meSuffix") : ""}
                  </Text>
                  {role >= 1 ? (
                    <Text style={styles.chatInfoCompactMeta}>
                      {getGroupRoleLabel(role, t)}
                    </Text>
                  ) : null}
                </Pressable>
                {idx < previewMembers.length - 1 ? (
                  <Divider styles={styles} />
                ) : null}
              </View>
            );
          })}
          {memberCount > previewMembers.length ? (
            <>
              <Divider styles={styles} />
              <ListRow
                styles={styles}
                theme={theme}
                icon="people-outline"
                title={t("groupInfo.viewAllMembers", { count: memberCount })}
                accentTitle
                onPress={() => navigation.navigate("GroupInfoMembers")}
                showChevron
              />
            </>
          ) : null}
        </View>

        <View style={styles.chatInfoSection}>
          <ListRow
            styles={styles}
            theme={theme}
            icon="trash-outline"
            title={t("groupInfo.clearChatHistory")}
            dangerTitle
            disabled={props.pending || !props.activeConversation}
            onPress={
              props.onClearConversation ??
              (() => notifyComingSoon(t("groupInfo.clearChatHistory")))
            }
          />
        </View>

        <View style={styles.chatInfoSection}>
          <Pressable
            style={styles.chatInfoListRow}
            onPress={isOwner ? props.onDisbandGroup : props.onLeaveGroup}
            disabled={props.pending}
          >
            <View style={styles.chatInfoListRowIcon}>
              <Ionicons
                name="exit-outline"
                size={22}
                color={theme.colors.danger}
              />
            </View>
            <Text style={styles.chatInfoListRowDangerText}>
              {isOwner
                ? t("groupInfo.disbandGroup")
                : t("groupInfo.leaveGroup")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

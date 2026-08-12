import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../../styles/app-styles";
import { colorFromSeed } from "../../../styles/theme";
import { BottomSheet } from "../../ui/BottomSheet";
import { AppAvatar } from "../../ui/AppAvatar";
import { sameUserId } from "../../../utils/app-ui";

/**
 * Group-call member picker. Mirrors WhatsApp/WeChat: before starting an
 * audio/video call from a group chat the user chooses which members to
 * invite, instead of paging the entire (potentially very large) group.
 *
 * The local user's own row is always checked and locked (you cannot exclude
 * yourself from a call you start); every other member starts unchecked.
 * A back arrow on the left closes the sheet and a "开始通话" action sits on
 * the top right.
 */
export function CallMemberPickerSheet(props: {
  visible: boolean;
  mediaType: 1 | 2;
  members: Array<{
    user_id: number;
    nickname: string;
    avatar_url?: string | null;
    avatar?: string | null;
  }>;
  currentUserId?: number | null;
  onClose: () => void;
  onStartCall: (targetUserIds: number[]) => void;
}) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Reset the selection every time the picker opens so a previous session's
  // picks never leak into a new one.
  useEffect(() => {
    if (props.visible) {
      setSelectedIds(new Set());
    }
  }, [props.visible]);

  const sortedMembers = useMemo(() => {
    const self = props.members.find(member =>
      sameUserId(member.user_id, props.currentUserId)
    );
    const others = props.members
      .filter(member => !sameUserId(member.user_id, props.currentUserId))
      .sort((left, right) =>
        left.nickname.localeCompare(right.nickname, "zh-Hans")
      );
    return [...(self ? [self] : []), ...others];
  }, [props.members, props.currentUserId]);

  const selectedCount = selectedIds.size;
  const isVideo = props.mediaType === 2;
  const title = isVideo
    ? t("ui.callOverlay.selectVideoMembers")
    : t("ui.callOverlay.selectVoiceMembers");

  function toggleMember(userId: number) {
    if (sameUserId(userId, props.currentUserId)) {
      return;
    }
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function handleStart() {
    props.onClose();
    props.onStartCall(Array.from(selectedIds));
  }

  return (
    <BottomSheet
      visible={props.visible}
      onClose={props.onClose}
      snapPoints={["75%"]}
      containerStyle={styles.callMemberPickerContainer}
      testID="call-member-picker-sheet"
    >
      <View style={styles.callMemberPickerHeader}>
        <Pressable
          onPress={props.onClose}
          style={styles.callMemberPickerBackButton}
          hitSlop={12}
          testID="call-member-picker-close"
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.callMemberPickerHeaderTitle} numberOfLines={1}>
          {title}
        </Text>
        <Pressable
          onPress={handleStart}
          style={[
            styles.callMemberPickerStartButton,
            selectedCount === 0
              ? styles.callMemberPickerStartButtonDisabled
              : null
          ]}
          disabled={selectedCount === 0}
          testID="call-member-picker-start"
        >
          <Text style={styles.callMemberPickerStartLabel}>
            {t("ui.callOverlay.startCall")}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={sortedMembers}
        keyExtractor={item => String(item.user_id)}
        contentContainerStyle={styles.callMemberPickerList}
        renderItem={({ item }) => {
          const isSelf = sameUserId(item.user_id, props.currentUserId);
          const selected = isSelf || selectedIds.has(Number(item.user_id));
          const avatarUrl = item.avatar_url || item.avatar || null;
          const displayName =
            item.nickname || t("chatMessage.unknownUser", { id: item.user_id });
          const avatarColor = colorFromSeed(displayName, theme.avatarPalette);
          return (
            <Pressable
              onPress={() => toggleMember(Number(item.user_id))}
              disabled={isSelf}
              style={[
                styles.callMemberPickerRow,
                isSelf ? styles.callMemberPickerRowSelf : null
              ]}
              testID={`call-member-picker-${item.user_id}`}
            >
              <AppAvatar
                label={displayName}
                imageUrl={avatarUrl}
                style={[
                  styles.callMemberPickerAvatar,
                  { backgroundColor: avatarColor }
                ]}
                textStyle={styles.callMemberPickerAvatarText}
              />
              <View style={styles.callMemberPickerRowBody}>
                <Text style={styles.callMemberPickerRowName} numberOfLines={1}>
                  {displayName}
                  {isSelf ? t("groupInfo.meSuffix") : ""}
                </Text>
                {isSelf ? (
                  <Text style={styles.callMemberPickerRowHint}>
                    {t("ui.callOverlay.caller")}
                  </Text>
                ) : null}
              </View>
              <View
                style={[
                  styles.callMemberPickerCheck,
                  selected ? styles.callMemberPickerCheckOn : null
                ]}
              >
                {selected ? (
                  <Ionicons
                    name="checkmark"
                    size={14}
                    color="#ffffff"
                    testID={`call-member-check-${item.user_id}`}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </BottomSheet>
  );
}

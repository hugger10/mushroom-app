import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type {
  ContactListItem,
  Conversation,
  LoginUser,
  MessageReactionEntry
} from "@mushroom/shared";
import { useAppTheme } from "../../styles/app-styles";
import { i18n } from "../../i18n";
import {
  AppAvatar,
  BottomSheet,
  BottomSheetScrollView
} from "../../components/ui";
import { colorFromSeed } from "../../styles/theme";
import { groupReactions } from "./MessageReactionBar";

function resolveDisplayName(input: {
  userId: number;
  conversation?: Conversation | null;
  contacts?: ContactListItem[];
  loginUser?: LoginUser | null;
}): { name: string; avatar: string | null } {
  if (input.loginUser && Number(input.loginUser.userId) === input.userId) {
    return {
      name:
        input.loginUser.nickname ||
        input.loginUser.username ||
        i18n.t("chatMessage.unknownUser", { id: input.userId }),
      avatar: input.loginUser.avatar ?? null
    };
  }
  const contact = (input.contacts ?? []).find(
    item => Number(item.user_id) === input.userId
  );
  if (contact) {
    return {
      name:
        contact.remark_name ||
        contact.nickname ||
        i18n.t("chatMessage.unknownUser", { id: input.userId }),
      avatar: contact.avatar_url ?? null
    };
  }
  const member = (input.conversation?.members ?? []).find(
    item => Number(item.user_id) === input.userId
  );
  if (member) {
    return {
      name:
        member.nickname ||
        i18n.t("chatMessage.unknownUser", { id: input.userId }),
      avatar: member.avatar_url ?? member.avatar ?? null
    };
  }
  return {
    name: i18n.t("chatMessage.unknownUser", { id: input.userId }),
    avatar: null
  };
}

export function ReactionDetailSheet(props: {
  visible: boolean;
  reactions: MessageReactionEntry[] | undefined;
  conversation: Conversation | null;
  contacts: ContactListItem[];
  loginUser: LoginUser | null | undefined;
  currentUserId: number | null | undefined;
  onRemoveMine: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const groups = useMemo(
    () => groupReactions(props.reactions, props.currentUserId),
    [props.reactions, props.currentUserId]
  );
  const [activeEmoji, setActiveEmoji] = useState<string | "all">("all");

  if (!props.visible) return null;

  const isDark = theme.mode === "dark";
  const dividerColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const subText = theme.colors.textMuted;

  const allReactions = props.reactions ?? [];
  const displayed =
    activeEmoji === "all"
      ? allReactions
      : allReactions.filter(item => item.emoji === activeEmoji);

  return (
    <BottomSheet
      visible={props.visible}
      onClose={props.onClose}
      testID="reaction-detail-sheet"
      snapPoints={["70%"]}
      containerStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderBottomWidth: 0.5,
          borderBottomColor: dividerColor
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ alignItems: "center" }}
        >
          <TabPill
            label={t("chatMessage.allReactions", {
              count: allReactions.length
            })}
            active={activeEmoji === "all"}
            onPress={() => setActiveEmoji("all")}
          />
          {groups.map(group => (
            <TabPill
              key={group.emoji}
              label={`${group.emoji} ${group.count}`}
              active={activeEmoji === group.emoji}
              onPress={() => setActiveEmoji(group.emoji)}
            />
          ))}
        </ScrollView>
      </View>
      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {displayed.map(item => {
          const meta = resolveDisplayName({
            userId: Number(item.user_id),
            conversation: props.conversation,
            contacts: props.contacts,
            loginUser: props.loginUser
          });
          const isMine = Number(item.user_id) === Number(props.currentUserId);
          const avatarColor = colorFromSeed(
            meta.name || String(item.user_id),
            theme.avatarPalette
          );
          return (
            <Pressable
              key={`${item.user_id}-${item.emoji}`}
              onPress={isMine ? props.onRemoveMine : undefined}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 10,
                backgroundColor: pressed
                  ? isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(0,0,0,0.03)"
                  : "transparent"
              })}
            >
              <AppAvatar
                label={meta.name}
                imageUrl={meta.avatar}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: avatarColor,
                  marginRight: 12
                }}
                textStyle={{ color: "#fff", fontSize: 14 }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "500",
                    color: theme.colors.text
                  }}
                >
                  {meta.name}
                  {isMine ? t("chatMessage.meSuffix") : ""}
                </Text>
                {isMine ? (
                  <Text style={{ fontSize: 12, color: subText, marginTop: 2 }}>
                    {t("chatMessage.tapToRemove")}
                  </Text>
                ) : null}
              </View>
              <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
            </Pressable>
          );
        })}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function TabPill(props: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginRight: 6,
        borderRadius: 14,
        backgroundColor: props.active ? theme.colors.accentSoft : "transparent",
        borderWidth: 1,
        borderColor: props.active ? theme.colors.accentMuted : "transparent"
      }}
    >
      <Text
        style={{
          fontSize: 13,
          color: props.active ? theme.colors.accentStrong : theme.colors.text,
          fontWeight: props.active ? "600" : "400"
        }}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

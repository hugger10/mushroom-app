import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type {
  ContactListItem,
  Conversation,
  ConversationMember,
  LoginUser,
  Message
} from "@mushroom/shared";
import { useAppTheme } from "../../styles/app-styles";
import { i18n } from "../../i18n";
import {
  AppAvatar,
  BottomSheet,
  BottomSheetScrollView
} from "../../components/ui";
import { colorFromSeed } from "../../styles/theme";

/**
 * GroupReadReceiptsSheet —— 群消息已读详情面板。
 *
 * 数据来源：`groupReadState` 是本地缓存回灌到控制器 snapshot 的
 * (reader_user_id → last_read_seq) 高水位 map。打开面板时取一次快照即可；
 * 增量更新会通过外层重新渲染下发。
 *
 * 列表来源：`conversation.members` —— sender 自己被剥离。
 * 隐私：当某成员 `read_receipts_visibility=2`（仅 reader 自己可见），后端
 * 已不会下发其 group_read 帧 → 该成员在 map 里不会出现 → 自动归入"未读"。
 */
function resolveMemberDisplay(input: {
  userId: number;
  conversation: Conversation;
  contacts: ContactListItem[];
  loginUser: LoginUser | null | undefined;
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
  const contact = input.contacts.find(
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
  const member = (input.conversation.members ?? []).find(
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

type Tab = "read" | "unread";

export function GroupReadReceiptsSheet(props: {
  visible: boolean;
  message: Message | null;
  conversation: Conversation | null;
  groupReadState: Record<number, number> | null;
  contacts: ContactListItem[];
  loginUser: LoginUser | null | undefined;
  onClose: () => void;
}) {
  const { theme } = useAppTheme();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("read");

  const isDark = theme.mode === "dark";
  const textColor = isDark ? "#F5F5F5" : "#1C1C1E";
  const subTextColor = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)";
  const accentColor = theme.colors.accent;
  const separatorColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const { readMembers, unreadMembers } = useMemo(() => {
    const empty = {
      readMembers: [] as ConversationMember[],
      unreadMembers: [] as ConversationMember[]
    };
    const message = props.message;
    const conversation = props.conversation;
    if (!message || !conversation) return empty;
    const seq = Number(message.sequence || 0);
    if (seq <= 0) return empty;
    const senderId = Number(message.sender_id || 0);
    const members = (conversation.members ?? []).filter(
      m => Number(m.user_id) !== senderId
    );
    const map = props.groupReadState ?? {};
    const read: ConversationMember[] = [];
    const unread: ConversationMember[] = [];
    for (const m of members) {
      const lastRead = Number(map[Number(m.user_id)] ?? 0);
      if (lastRead >= seq) read.push(m);
      else unread.push(m);
    }
    return { readMembers: read, unreadMembers: unread };
  }, [props.message, props.conversation, props.groupReadState]);

  const activeList = tab === "read" ? readMembers : unreadMembers;

  return (
    <BottomSheet
      visible={props.visible && Boolean(props.message)}
      onClose={props.onClose}
      testID="group-read-receipts-sheet"
      snapPoints={["70%"]}
      containerStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
          borderBottomWidth: 0.5,
          borderBottomColor: separatorColor
        }}
      >
        {(
          [
            { key: "read", label: t("chat.readN", { n: readMembers.length }) },
            {
              key: "unread",
              label: t("chat.unreadN", { n: unreadMembers.length })
            }
          ] as Array<{ key: Tab; label: string }>
        ).map(item => {
          const isActive = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginRight: 8,
                borderBottomWidth: 2,
                borderBottomColor: isActive ? accentColor : "transparent"
              }}
              testID={`group-read-tab-${item.key}`}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: isActive ? "600" : "400",
                  color: isActive ? accentColor : subTextColor
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 4 }}
      >
        {activeList.length === 0 ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <Text style={{ color: subTextColor, fontSize: 14 }}>
              {tab === "read" ? t("chat.noReadMembers") : t("chat.allRead")}
            </Text>
          </View>
        ) : (
          activeList.map(member => {
            const userId = Number(member.user_id);
            const display = resolveMemberDisplay({
              userId,
              conversation: props.conversation!,
              contacts: props.contacts,
              loginUser: props.loginUser
            });
            return (
              <View
                key={userId}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 20,
                  paddingVertical: 10
                }}
              >
                <AppAvatar
                  label={display.name}
                  imageUrl={display.avatar}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colorFromSeed(
                      display.name || String(userId),
                      theme.avatarPalette
                    )
                  }}
                  textStyle={{ color: "#fff", fontSize: 14, fontWeight: "600" }}
                />
                <Text
                  style={{
                    marginLeft: 12,
                    fontSize: 15,
                    color: textColor,
                    flex: 1
                  }}
                  numberOfLines={1}
                >
                  {display.name}
                </Text>
              </View>
            );
          })
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { PressableRow } from "../../hooks/usePressAnimation";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import {
  useNavigation,
  useRoute,
  type RouteProp
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  getMessageSummaryText,
  type ContactListItem,
  type Conversation,
  type LoginUser,
  type MergedForwardItem,
  type Message
} from "@mushroom/shared";
import { AppAvatar } from "../../components/ui";
import { useMobileAppState } from "../../app/controller/useMobileAppState";
import { useAppTheme } from "../../styles/app-styles";
import { formatConversationTime } from "../../utils/app-ui";
import {
  getMessageSenderAvatar,
  getForwardCardTitle,
  getForwardItemDisplayName
} from "../../utils/display";
import type { AppStackParamList } from "../../types/navigation";

function resolveAvatar(
  item: MergedForwardItem,
  ctx: {
    conversation: Conversation | null;
    contacts: ContactListItem[];
    loginUser: LoginUser | null;
  }
): string | undefined {
  if (item.sender_avatar) return item.sender_avatar;
  if (!item.sender_id || !ctx.conversation) return undefined;
  // Fallback: reuse the same resolution chain we use for live messages so
  // that older merged-forward snapshots (which do not carry sender_avatar)
  // can still find the sender's avatar from the local members / contacts
  // caches when the sender is known to this device.
  const synthetic = {
    sender_id: item.sender_id,
    sender_nickname: item.sender_nickname,
    sender_avatar: undefined
  } as unknown as Message;
  return getMessageSenderAvatar({
    message: synthetic,
    conversation: ctx.conversation,
    contacts: ctx.contacts,
    loginUser: ctx.loginUser
  });
}

function DetailItem(props: {
  item: MergedForwardItem;
  avatarUrl?: string;
  displayName: string;
}) {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        paddingVertical: 8,
        borderBottomWidth: 0.5,
        borderBottomColor: theme.colors.border
      }}
    >
      <AppAvatar
        label={props.displayName}
        imageUrl={props.avatarUrl}
        style={{ width: 32, height: 32, borderRadius: 16 }}
        textStyle={{ fontSize: 13 }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 2
          }}
        >
          <Text
            style={{
              fontWeight: "500",
              fontSize: 13,
              color: theme.colors.text
            }}
            numberOfLines={1}
          >
            {props.displayName}
          </Text>
          <Text style={{ fontSize: 11, color: theme.colors.textSoft }}>
            {formatConversationTime(props.item.sent_at)}
          </Text>
        </View>
        <Text style={{ fontSize: 14, color: theme.colors.text }}>
          {getMessageSummaryText(props.item.content, t)}
        </Text>
      </View>
    </View>
  );
}

export function MergedForwardDetailScreen() {
  const { theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "MergedForwardDetail">>();
  const merged = route.params?.content ?? null;

  const state = useMobileAppState();
  const fallbackCtx = useMemo(
    () => ({
      conversation: state.activeConversation,
      contacts: state.contacts ?? [],
      loginUser: state.snapshot?.auth.user ?? null
    }),
    [state.activeConversation, state.contacts, state.snapshot?.auth.user]
  );

  if (!merged) {
    return null;
  }

  const title = getForwardCardTitle({
    items: merged.messages,
    fallbackTitle: merged.title,
    contacts: fallbackCtx.contacts,
    loginUser: fallbackCtx.loginUser
  });

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingTop: 12,
          paddingBottom: 12,
          paddingHorizontal: 16,
          backgroundColor: theme.colors.surface,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.colors.border
        }}
      >
        <PressableRow
          onPress={() => navigation.goBack()}
          style={{ marginRight: 12 }}
          idleColor="transparent"
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </PressableRow>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 17,
            fontWeight: "600",
            color: theme.colors.text
          }}
        >
          {title}
        </Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {merged.messages.map((item, index) => (
          <DetailItem
            key={index}
            item={item}
            avatarUrl={resolveAvatar(item, fallbackCtx)}
            displayName={getForwardItemDisplayName({
              item,
              contacts: fallbackCtx.contacts,
              loginUser: fallbackCtx.loginUser
            })}
          />
        ))}
      </ScrollView>
    </View>
  );
}

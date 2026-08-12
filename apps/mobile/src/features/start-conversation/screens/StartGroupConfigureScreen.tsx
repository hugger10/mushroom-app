import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { CommonActions } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { ContactListItem } from "@mushroom/shared";
import { GROUP_NAME_MAX_LENGTH } from "@mushroom/shared";
import { useTranslation } from "react-i18next";
import { AppAvatar, EmptyState } from "../../../components/ui";
import { AccountPageShell } from "../../account/AccountPageShell";
import { useAppTheme } from "../../../styles/app-styles";
import { colorFromSeed } from "../../../styles/theme";
import type { AppStackParamList } from "../../../types/navigation";
import {
  useGroupSelection,
  useStartConversation
} from "../context/StartConversationContext";

export function StartGroupConfigureScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const ctx = useStartConversation();
  const selection = useGroupSelection();

  const [groupName, setGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [errorText, setErrorText] = useState("");

  const selectedContacts: ContactListItem[] = selection.selectedContactIds
    .map(userId => {
      const local = ctx.availableContacts.find(
        contact => Number(contact.user_id) === userId
      );
      if (local) {
        return local;
      }
      const remote = selection.groupRemoteResults.find(
        item => Number(item.user_id) === userId
      );
      if (remote) {
        return {
          user_id: remote.user_id,
          username: remote.username,
          nickname: remote.nickname,
          avatar_url: remote.avatar_url,
          gender: 0,
          updated_at: new Date().toISOString(),
          is_blocked: false
        } satisfies ContactListItem;
      }
      return null;
    })
    .filter((item): item is ContactListItem => item !== null);

  async function handleCreateGroup() {
    const normalizedGroupName = groupName.trim();
    if (!normalizedGroupName) {
      setErrorText(t("startConversation.groupNameRequired"));
      return;
    }
    if (selection.selectedContactIds.length === 0) {
      setErrorText(t("createGroup.membersRequired"));
      navigation.goBack();
      return;
    }

    setCreatingGroup(true);
    setErrorText("");
    try {
      const memberProfiles = selection.selectedContactIds.map(userId => {
        const local = ctx.availableContacts.find(
          c => Number(c.user_id) === userId
        );
        if (local) {
          return {
            user_id: userId,
            username: local.username,
            nickname: local.nickname,
            avatar_url: local.avatar_url
          };
        }
        const remote = selection.groupRemoteResults.find(
          r => Number(r.user_id) === userId
        );
        if (remote) {
          return {
            user_id: userId,
            username: remote.username,
            nickname: remote.nickname,
            avatar_url: remote.avatar_url
          };
        }
        return { user_id: userId, username: String(userId) };
      });
      await ctx.onCreateGroupConversation({
        groupName: normalizedGroupName,
        memberIds: selection.selectedContactIds,
        memberProfiles
      });
      selection.reset();
      // Return to Home after a successful creation; do NOT auto-push Chat.
      navigation.dispatch(
        CommonActions.reset({ index: 0, routes: [{ name: "Home" }] })
      );
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : String(error ?? t("startConversation.createGroupFailed"))
      );
    } finally {
      setCreatingGroup(false);
    }
  }

  const rightAction = (
    <Pressable
      testID="group-create-button"
      onPress={() => {
        void handleCreateGroup();
      }}
      disabled={creatingGroup || selectedContacts.length === 0}
      style={({ pressed }) => [
        styles.startConversationSheetHeaderAction,
        selectedContacts.length === 0
          ? styles.startConversationSheetHeaderActionDisabled
          : null,
        { opacity: creatingGroup ? 0.7 : pressed ? 0.7 : 1 }
      ]}
    >
      {creatingGroup ? (
        <ActivityIndicator
          size="small"
          color={theme.colors.textInverse}
          testID="group-create-button-loading"
        />
      ) : (
        <Text
          style={[
            styles.startConversationSheetHeaderActionText,
            selectedContacts.length === 0
              ? styles.startConversationSheetHeaderActionTextDisabled
              : null
          ]}
        >
          {t("createGroup.create")}
        </Text>
      )}
    </Pressable>
  );

  return (
    <AccountPageShell
      title={t("startConversation.newGroupTitle")}
      onBack={() => navigation.goBack()}
      rightAction={rightAction}
      testID="start-group-configure-screen"
    >
      <View style={styles.groupSelectContent}>
        {errorText ? (
          <Text style={styles.overlayErrorText}>{errorText}</Text>
        ) : null}

        <TextInput
          value={groupName}
          onChangeText={value => {
            setGroupName(value);
            if (errorText) {
              setErrorText("");
            }
          }}
          placeholder={t("startConversation.groupNamePlaceholder")}
          placeholderTextColor={theme.colors.inputPlaceholder}
          style={styles.groupConfigureNameInput}
          maxLength={GROUP_NAME_MAX_LENGTH}
          testID="group-name-input"
        />

        <Text style={styles.groupConfigureSectionLabel}>
          {t("startConversation.memberCount", {
            count: selectedContacts.length
          })}
        </Text>

        <ScrollView style={styles.flexList} keyboardShouldPersistTaps="handled">
          {selectedContacts.length > 0 ? (
            <View style={styles.groupContactListPlain}>
              {selectedContacts.map((contact, index) => {
                const avatarSeed =
                  contact.nickname ||
                  contact.username ||
                  String(contact.user_id);
                return (
                  <View key={`configure-group-row:${contact.user_id}`}>
                    {index > 0 ? (
                      <View style={styles.groupContactRowDividerV2} />
                    ) : null}
                    <View style={styles.groupContactRowTall}>
                      <AppAvatar
                        label={avatarSeed}
                        imageUrl={contact.avatar_url}
                        style={[
                          styles.groupContactAvatarLg,
                          {
                            backgroundColor: colorFromSeed(
                              avatarSeed,
                              theme.avatarPalette
                            )
                          }
                        ]}
                        textStyle={styles.groupContactAvatarLgText}
                      />
                      <View style={styles.groupContactBody}>
                        <Text
                          numberOfLines={1}
                          style={styles.groupContactTitle}
                        >
                          {contact.nickname || contact.username}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={styles.groupContactSubtitle}
                        >
                          @{contact.username}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() =>
                          selection.removeContact(Number(contact.user_id))
                        }
                        testID={`group-configure-remove:${contact.user_id}`}
                        hitSlop={6}
                        style={styles.groupContactRowRemove}
                      >
                        <Ionicons
                          name="close"
                          size={18}
                          color={theme.colors.textMuted}
                        />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <EmptyState label={t("startConversation.noSelectedMembers")} />
          )}
        </ScrollView>
      </View>
    </AccountPageShell>
  );
}

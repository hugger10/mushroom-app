import { useEffect, useEffectEvent, useState } from "react";
import type { UserProfile } from "@mushroom/shared";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "react-native-vector-icons/Ionicons";
import { AppAvatar } from "../../../components/ui";
import { PressableRow } from "../../../hooks/usePressAnimation";
import {
  Divider,
  ListRow,
  QuickAction,
  ToggleSwitch
} from "../../../components/overlays/info-rows";
import { useAppTheme } from "../../../styles/app-styles";
import { colorFromSeed } from "../../../styles/theme";
import { notifyComingSoon } from "../../../utils/notify";
import { navigateApp } from "../../../navigation/app-navigation";
import type { AppStackParamList } from "../../../types/navigation";
import { profileCache } from "../profile-cache";
import { usePeerProfile } from "../context/PeerProfileContext";

function getGenderLabel(gender: number, t: (key: string) => string) {
  if (gender === 1) {
    return t("contacts.profileGenderMale");
  }
  if (gender === 2) {
    return t("contacts.profileGenderFemale");
  }
  return t("contacts.profileGenderUnknown");
}

function getGenderIcon(gender: number): string | null {
  if (gender === 1) {
    return "male-outline";
  }
  if (gender === 2) {
    return "female-outline";
  }
  return null;
}

export function PeerProfileScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "PeerProfile">>();
  const ctx = usePeerProfile();
  const {
    userId: targetUserId,
    fallbackNickname: routeFallbackNickname,
    fallbackUsername: routeFallbackUsername,
    fallbackAvatar: routeFallbackAvatar
  } = route.params;

  const derived = ctx.getDerived(targetUserId);

  const [profile, setProfile] = useState<UserProfile | null>(
    () => profileCache.get(targetUserId) ?? null
  );
  const [errorText, setErrorText] = useState("");
  const [addingAsContact, setAddingAsContact] = useState(false);
  const [blockActionPending, setBlockActionPending] = useState(false);
  const loadProfileEvent = useEffectEvent(ctx.onLoadProfile);

  useEffect(() => {
    if (!targetUserId) {
      return undefined;
    }
    // Seed from cache so the hero is in its final state on entry. Always
    // refresh in the background; never reset to null because that produces a
    // visible flicker.
    const cached = profileCache.get(targetUserId);
    if (cached) {
      setProfile(cached);
    }
    setErrorText("");

    let cancelled = false;
    void loadProfileEvent(targetUserId)
      .then(result => {
        if (cancelled) {
          return;
        }
        if (result && typeof result.id === "number") {
          profileCache.set(result.id, result);
        }
        setProfile(result);
      })
      .catch(error => {
        if (!cancelled) {
          setErrorText(
            error instanceof Error
              ? error.message
              : String(error ?? t("peerProfile.loadFailed"))
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [targetUserId]);

  const activeFallbackNickname =
    derived.resolvedFallbackNickname || routeFallbackNickname || "";
  const activeFallbackUsername =
    derived.resolvedFallbackUsername ?? routeFallbackUsername ?? null;
  const activeFallbackAvatar =
    derived.resolvedFallbackAvatar ?? routeFallbackAvatar ?? null;
  const activeBlockedState = derived.isBlocked;

  const displayName =
    profile?.nickname ||
    activeFallbackNickname ||
    t("contacts.profileUnknownUser", { id: targetUserId });
  const avatarSeed = displayName || String(targetUserId);
  const avatarUrl = profile?.avatar_url ?? activeFallbackAvatar ?? null;
  const resolvedUsername = profile?.username ?? activeFallbackUsername ?? null;
  const accountName = resolvedUsername ? `@${resolvedUsername}` : "";
  const phoneValue = profile?.phone || t("contacts.profilePhonePrivate");
  const emailValue = profile?.email || t("contacts.profileEmailPrivate");
  const signatureRaw = profile?.signature?.trim() || "";
  const signatureText = signatureRaw || t("contacts.profileNoSignature");
  const genderRaw = profile?.gender ?? 0;
  const genderIcon = getGenderIcon(genderRaw);
  const genderLabel = getGenderLabel(genderRaw, t);
  const birthday = profile?.birthday?.trim() || "";
  const isContact = derived.isContact;
  const peerConv = derived.peerConversation;
  const hasConv = Boolean(peerConv);
  const isMuted = Boolean(peerConv?.is_muted);
  const isPinned = Boolean(peerConv?.is_pinned);
  const bottomInset = Math.max(insets.bottom, 12);

  function close() {
    navigation.goBack();
  }

  function confirmDeleteContact() {
    Alert.alert(
      t("peerProfile.deleteContact"),
      t("peerProfile.deleteContactConfirm", { name: displayName }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("peerProfile.delete"),
          style: "destructive",
          onPress: () => {
            close();
            void ctx.onDeleteContact(targetUserId, displayName);
          }
        }
      ]
    );
  }

  function confirmBlockUser() {
    if (blockActionPending) return;
    if (activeBlockedState) {
      setBlockActionPending(true);
      Promise.resolve(ctx.onUnblockUser(targetUserId, displayName)).finally(
        () => setBlockActionPending(false)
      );
      return;
    }
    Alert.alert(
      t("peerProfile.blockTitle"),
      t("peerProfile.blockConfirm", { name: displayName }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("peerProfile.block"),
          style: "destructive",
          onPress: () => {
            if (blockActionPending) return;
            setBlockActionPending(true);
            Promise.resolve(ctx.onBlockUser(targetUserId, displayName)).finally(
              () => setBlockActionPending(false)
            );
          }
        }
      ]
    );
  }

  function openChatMedia() {
    if (!peerConv) {
      return;
    }
    const targetTitle =
      displayName || peerConv.display_name || peerConv.name || "";
    navigateApp("ChatMedia", {
      clientConversationId: peerConv.client_conversation_id,
      title: targetTitle
    });
  }

  return (
    <View style={[styles.groupInfoPage, { paddingBottom: bottomInset }]}>
      {/* White band covering safe-area inset + header so it merges with the hero */}
      <View
        style={{
          backgroundColor: theme.colors.background,
          marginTop: -insets.top,
          paddingTop: insets.top
        }}
      >
        {/* Transparent header: only ← back */}
        <View
          style={[styles.groupInfoHeader, styles.chatInfoHeaderTransparent]}
        >
          <PressableRow
            onPress={close}
            style={styles.chatInfoHeaderIconBtn}
            idleColor="transparent"
          >
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </PressableRow>
          <View style={styles.groupInfoHeaderPlaceholder} />
        </View>
      </View>

      <ScrollView
        style={styles.groupInfoScroll}
        contentContainerStyle={styles.groupInfoScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero (centered) */}
        <View style={styles.chatInfoHeroCenter}>
          <Pressable
            style={styles.chatInfoHeroAvatarWrap}
            onPress={
              avatarUrl
                ? () => {
                    ctx.onPressAvatar({
                      avatarUrl,
                      label: avatarSeed
                    });
                  }
                : undefined
            }
            disabled={!avatarUrl}
          >
            <AppAvatar
              label={avatarSeed}
              imageUrl={avatarUrl}
              style={[
                styles.chatInfoHeroAvatarLarge,
                {
                  backgroundColor: colorFromSeed(
                    avatarSeed,
                    theme.avatarPalette
                  )
                }
              ]}
              textStyle={styles.chatInfoHeroAvatarLargeText}
            />
          </Pressable>
          <View style={styles.chatInfoHeroNameRow}>
            <Text numberOfLines={1} style={styles.chatInfoHeroNameCenter}>
              {displayName}
            </Text>
            {genderIcon ? (
              <Ionicons
                name={genderIcon}
                size={18}
                color={theme.colors.textSoft}
              />
            ) : null}
          </View>
          {accountName ? (
            <Text numberOfLines={1} style={styles.chatInfoHeroSubtitle}>
              {accountName}
            </Text>
          ) : (
            <Text
              numberOfLines={1}
              style={styles.chatInfoHeroSubtitle}
              accessibilityElementsHidden
            >
              {" "}
            </Text>
          )}
        </View>

        {/* Quick action */}
        <View style={styles.chatInfoQuickActionsRow}>
          <QuickAction
            styles={styles}
            theme={theme}
            icon="chatbubble-ellipses-outline"
            label={t("contacts.profileActionMessage")}
            onPress={() => {
              void ctx.onOpenChat(targetUserId);
            }}
          />
          <QuickAction
            styles={styles}
            theme={theme}
            icon="search-outline"
            label={t("groupInfo.search")}
            onPress={() => {
              void ctx.onOpenSearchInChat(targetUserId);
            }}
          />
        </View>

        {/* Contact (remark + personal info) / Add as contact */}
        <View style={styles.chatInfoSection}>
          <View style={styles.chatInfoSectionHeader}>
            <Text style={styles.chatInfoSectionTitle}>
              {t("peerProfile.contact")}
            </Text>
          </View>
          {isContact ? (
            <>
              <ListRow
                styles={styles}
                theme={theme}
                icon="create-outline"
                title={t("peerProfile.remark")}
                metaText={
                  derived.initialRemarkName || t("peerProfile.remarkTapToSet")
                }
                showChevron
                onPress={() =>
                  navigation.navigate("PeerProfileRemark", {
                    userId: targetUserId
                  })
                }
              />
              <Divider styles={styles} />
              <ListRow
                styles={styles}
                theme={theme}
                icon="call-outline"
                title={t("contacts.profileLabelPhone")}
                metaText={phoneValue}
              />
              <Divider styles={styles} />
              <ListRow
                styles={styles}
                theme={theme}
                icon="mail-outline"
                title={t("contacts.profileLabelEmail")}
                metaText={emailValue}
              />
              {genderIcon ? (
                <>
                  <Divider styles={styles} />
                  <ListRow
                    styles={styles}
                    theme={theme}
                    icon={genderIcon}
                    title={t("peerProfile.gender")}
                    metaText={genderLabel}
                  />
                </>
              ) : null}
              {birthday ? (
                <>
                  <Divider styles={styles} />
                  <ListRow
                    styles={styles}
                    theme={theme}
                    icon="gift-outline"
                    title={t("peerProfile.birthday")}
                    metaText={birthday}
                  />
                </>
              ) : null}
              <Divider styles={styles} />
              <ListRow
                styles={styles}
                theme={theme}
                icon="create-outline"
                title={t("peerProfile.signature")}
                subtitle={signatureText}
              />
            </>
          ) : (
            <>
              <ListRow
                styles={styles}
                theme={theme}
                icon="person-add-outline"
                title={
                  addingAsContact
                    ? t("addContactScreen.adding")
                    : t("contacts.profileAddAsContact")
                }
                accentTitle
                disabled={addingAsContact}
                onPress={() => {
                  if (addingAsContact) {
                    return;
                  }
                  void (async () => {
                    setAddingAsContact(true);
                    setErrorText("");
                    try {
                      await ctx.onAddAsContact({ userId: targetUserId });
                      close();
                    } catch (error) {
                      setErrorText(
                        error instanceof Error
                          ? error.message
                          : String(error ?? t("peerProfile.addContactFailed"))
                      );
                    } finally {
                      setAddingAsContact(false);
                    }
                  })();
                }}
              />
              <Divider styles={styles} />
              <ListRow
                styles={styles}
                theme={theme}
                icon="create-outline"
                title={t("peerProfile.signature")}
                subtitle={signatureText}
              />
            </>
          )}
        </View>

        {/* Chat settings */}
        <View style={styles.chatInfoSection}>
          <View style={styles.chatInfoSectionHeader}>
            <Text style={styles.chatInfoSectionTitle}>
              {t("peerProfile.chatSettings")}
            </Text>
          </View>
          <ListRow
            styles={styles}
            theme={theme}
            icon="notifications-off-outline"
            title={t("groupInfo.muteNotifications")}
            disabled={!hasConv}
            rightElement={
              <ToggleSwitch
                styles={styles}
                value={isMuted}
                onToggle={() => ctx.onToggleMute(targetUserId)}
                disabled={!hasConv}
              />
            }
          />
          <Divider styles={styles} />
          <ListRow
            styles={styles}
            theme={theme}
            icon={isPinned ? "pin" : "pin-off"}
            iconSet="lucide"
            title={t("groupInfo.pinChat")}
            disabled={!hasConv}
            rightElement={
              <ToggleSwitch
                styles={styles}
                value={isPinned}
                onToggle={() => ctx.onTogglePin(targetUserId)}
                disabled={!hasConv}
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
            disabled={!hasConv}
            onPress={
              hasConv
                ? openChatMedia
                : () => notifyComingSoon(t("groupInfo.mediaAndFiles"))
            }
          />
          <Divider styles={styles} />
          <ListRow
            styles={styles}
            theme={theme}
            icon="trash-outline"
            title={t("groupInfo.clearChatHistory")}
            dangerTitle
            disabled={!hasConv}
            onPress={
              hasConv
                ? () => ctx.onClearConversation(targetUserId)
                : () => notifyComingSoon(t("groupInfo.clearChatHistory"))
            }
          />
        </View>

        {/* Danger zone */}
        <View style={styles.chatInfoSection}>
          <ListRow
            styles={styles}
            theme={theme}
            icon={
              activeBlockedState ? "checkmark-circle-outline" : "ban-outline"
            }
            title={
              activeBlockedState
                ? t("contacts.profileUnblock")
                : t("contacts.profileBlock")
            }
            dangerTitle={!activeBlockedState}
            accentTitle={activeBlockedState}
            onPress={confirmBlockUser}
            disabled={blockActionPending}
          />
          {isContact ? (
            <>
              <Divider styles={styles} />
              <ListRow
                styles={styles}
                theme={theme}
                icon="person-remove-outline"
                title={t("peerProfile.deleteContact")}
                dangerTitle
                onPress={confirmDeleteContact}
              />
            </>
          ) : null}
        </View>

        {errorText ? (
          <Text style={styles.overlayErrorText}>{errorText}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

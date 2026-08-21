import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Icon from "react-native-vector-icons/Ionicons";
import Animated from "react-native-reanimated";
import {
  usePressAnimation,
  PressableRow
} from "../../../hooks/usePressAnimation";
import {
  getNotificationPermissionStatus,
  openSystemNotificationSettings,
  type MobileNotificationPermissionStatus
} from "../../../platform/notification-center";
import {
  readNotificationPreferences,
  saveNotificationPreferences,
  updateNotificationPreferences,
  type MobileNotificationPreferences,
  type NotificationPreviewMode
} from "../../../platform/notification-preferences";
import {
  getMessageSoundDisplayName,
  optionValueToMessageSound,
  pickAndroidSystemTone,
  previewTone,
  resolveToneOptions,
  selectTone,
  SYSTEM_DEFAULT_OPTION,
  type TonePickerOption
} from "../../../platform/alert-tones/tone-manager";
import { useAppTheme } from "../../../styles/app-styles";
import {
  AppSwitch,
  BottomSheet,
  BottomSheetOptionList
} from "../../../components/ui";
import type { AppStackParamList } from "../../../types/navigation";
import { AccountPageShell } from "../AccountPageShell";
import { useMeProps } from "../MeContext";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PREVIEW_MODES: NotificationPreviewMode[] = ["full", "sender", "hidden"];

const TIME_OPTIONS = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h += 1) {
    out.push(`${String(h).padStart(2, "0")}:00`);
    out.push(`${String(h).padStart(2, "0")}:30`);
  }
  return out;
})();

function getPermissionBannerCopy(
  t: ReturnType<typeof useTranslation>["t"],
  status: MobileNotificationPermissionStatus
): { title: string; subtitle: string; action: string } | null {
  if (status === "authorized") {
    return null;
  }
  // Both "denied" and "unknown" surface the same user-facing message:
  // "Enable system notifications" -> tap to jump to system settings.
  return {
    title: t("me.notificationsPage.banner.deniedTitle"),
    subtitle: t("me.notificationsPage.banner.deniedSub"),
    action: t("me.notificationsPage.banner.deniedAction")
  };
}

function SettingSwitchRow(props: {
  title: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID: string;
  disabled?: boolean;
}) {
  const { styles } = useAppTheme();
  const disabled = props.disabled === true;
  const { animatedStyle, handlePressIn, handlePressOut } = usePressAnimation();

  return (
    <AnimatedPressable
      onPress={() => {
        if (disabled) return;
        props.onValueChange(!props.value);
      }}
      disabled={disabled}
      style={[
        styles.notificationSettingRow,
        disabled ? styles.notificationRowDisabled : null,
        animatedStyle
      ]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      testID={`${props.testID}-row`}
    >
      <View style={styles.notificationSettingMain}>
        <Text style={styles.notificationSettingTitle} numberOfLines={1}>
          {props.title}
        </Text>
      </View>
      <AppSwitch
        value={props.value}
        onValueChange={props.onValueChange}
        disabled={disabled}
        testID={props.testID}
      />
    </AnimatedPressable>
  );
}

function ValueRow(props: {
  title: string;
  value: string;
  onPress: () => void;
  testID: string;
  disabled?: boolean;
}) {
  const { styles, theme } = useAppTheme();
  const disabled = props.disabled === true;
  const { animatedStyle, handlePressIn, handlePressOut } = usePressAnimation();

  return (
    <AnimatedPressable
      onPress={props.onPress}
      disabled={disabled}
      style={[
        styles.notificationValueRow,
        disabled ? styles.notificationRowDisabled : null,
        animatedStyle
      ]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      testID={props.testID}
    >
      <Text style={styles.notificationSettingTitle}>{props.title}</Text>
      <View style={styles.notificationValueRight}>
        <Text style={styles.notificationValueText} numberOfLines={1}>
          {props.value}
        </Text>
        <Icon name="chevron-forward" size={18} color={theme.colors.textSoft} />
      </View>
    </AnimatedPressable>
  );
}

export function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { styles, theme } = useAppTheme();
  const meProps = useMeProps();
  const [preferences, setPreferences] = useState<MobileNotificationPreferences>(
    () => readNotificationPreferences()
  );
  const [permissionStatus, setPermissionStatus] =
    useState<MobileNotificationPermissionStatus>("unknown");
  type ActiveSheet =
    | { kind: "time"; field: "start" | "end" }
    | { kind: "preview" }
    | { kind: "sound" }
    | null;
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [toneOptions, setToneOptions] = useState<{
    fixed: TonePickerOption[];
    system: TonePickerOption[];
    supportsSystemPicker: boolean;
  }>({ fixed: [], system: [], supportsSystemPicker: false });

  const previewOptions = useMemo(
    () =>
      PREVIEW_MODES.map(value => ({
        value,
        title: t(
          `me.notificationsPage.preview${value === "full" ? "Full" : value === "sender" ? "Sender" : "Hidden"}.title`
        )
      })),
    [t]
  );

  const previewTitleMap = useMemo(
    () =>
      previewOptions.reduce<Record<NotificationPreviewMode, string>>(
        (acc, opt) => {
          acc[opt.value] = opt.title;
          return acc;
        },
        { full: "", sender: "", hidden: "" }
      ),
    [previewOptions]
  );

  const timeOptions = useMemo(
    () => TIME_OPTIONS.map(value => ({ value, label: value })),
    []
  );

  const refreshRuntime = useCallback(async () => {
    const nextStatus = await getNotificationPermissionStatus();
    setPermissionStatus(nextStatus);
  }, []);

  async function refreshPreferences() {
    setPreferences(readNotificationPreferences());

    try {
      const remotePreferences = await meProps.onLoadNotificationSettings();
      if (remotePreferences) {
        setPreferences(saveNotificationPreferences(remotePreferences));
      }
    } catch {
      // Local preferences continue to apply; remote sync errors are recovered next refresh.
    }
  }

  useEffect(() => {
    void refreshPreferences();
    void refreshRuntime();
  }, [refreshRuntime]);

  // Refresh permission status whenever the screen regains focus
  // (e.g. user returned from system Settings via gesture or back button).
  useFocusEffect(
    useCallback(() => {
      void refreshRuntime();
    }, [refreshRuntime])
  );

  // Refresh when the app returns from background (covers the common case
  // of switching to Settings.app/System Settings to toggle the permission).
  useEffect(() => {
    const sub = AppState.addEventListener("change", state => {
      if (state === "active") {
        void refreshRuntime();
      }
    });
    return () => sub.remove();
  }, [refreshRuntime]);

  function changePreferences(patch: Partial<MobileNotificationPreferences>) {
    setPreferences(updateNotificationPreferences(patch));
    void meProps
      .onUpdateNotificationSettings(patch)
      .then(remotePreferences => {
        if (remotePreferences) {
          setPreferences(saveNotificationPreferences(remotePreferences));
        }
      })
      .catch(() => undefined);
  }

  async function openSettings() {
    await openSystemNotificationSettings();
  }

  function handleTimeSelect(value: string) {
    if (activeSheet?.kind === "time") {
      if (activeSheet.field === "start") {
        changePreferences({ quietHoursStart: value });
      } else {
        changePreferences({ quietHoursEnd: value });
      }
    }
    setActiveSheet(null);
  }

  function handlePreviewSelect(value: NotificationPreviewMode) {
    changePreferences({ previewMode: value });
    setActiveSheet(null);
  }

  async function openSoundSheet() {
    setActiveSheet({ kind: "sound" });
    setToneOptions(await resolveToneOptions(t));
  }

  async function handleToneSelect(value: string) {
    const sound = optionValueToMessageSound(value);
    try {
      await selectTone(sound);
    } catch {
      // Native module missing / channel rebuild failed → keep local preference.
    }
    setPreferences(readNotificationPreferences());
    // iOS：点行即选中 + 试听；Android：仅内置音试听一次（系统选择器自带试听）。
    if (Platform.OS === "ios" || sound === "message" || sound === "fade") {
      void previewTone(sound).catch(() => undefined);
    }
    setActiveSheet(null);
  }

  async function handleAndroidSystemPicker() {
    setActiveSheet(null);
    try {
      const result = await pickAndroidSystemTone();
      if (result.selection === "cancel") {
        return;
      }
      if (result.selection === "silent") {
        await selectTone("silent");
      } else if (result.selection === "system_default") {
        await selectTone(null);
      } else if (result.selection === "custom") {
        await selectTone(result.uri, result.title ?? undefined);
      }
      setPreferences(readNotificationPreferences());
    } catch {
      // 原生模块未注册或选择器启动失败 → 忽略。
    }
  }

  const currentSoundOptionValue =
    preferences.messageSound === null
      ? SYSTEM_DEFAULT_OPTION
      : preferences.messageSound;

  return (
    <AccountPageShell
      title={t("me.notificationsPage.title")}
      onBack={() => navigation.goBack()}
      testID="me-notification-settings-page"
    >
      <ScrollView
        style={styles.meScreenEditorScroll}
        contentContainerStyle={styles.notificationSettingsContent}
        showsVerticalScrollIndicator={false}
      >
        {(() => {
          const banner = getPermissionBannerCopy(t, permissionStatus);
          if (!banner) {
            return null;
          }
          return (
            <PressableRow
              onPress={() => {
                void openSettings();
              }}
              style={styles.notificationPermissionBanner}
              testID="me-notification-permission-banner"
            >
              <View style={styles.notificationPermissionBannerStripe} />
              <View style={styles.notificationPermissionBannerIcon}>
                <Icon
                  name="notifications-off-outline"
                  size={22}
                  color="#B45309"
                />
              </View>
              <View style={styles.notificationPermissionBannerMain}>
                <Text style={styles.notificationPermissionBannerTitle}>
                  {banner.title}
                </Text>
                <Text
                  style={styles.notificationPermissionBannerSub}
                  numberOfLines={2}
                >
                  {banner.subtitle}
                </Text>
              </View>
              <View
                style={styles.notificationPermissionBannerAction}
                testID="me-notification-permission-action"
              >
                <Text style={styles.notificationPermissionBannerActionText}>
                  {banner.action}
                </Text>
              </View>
            </PressableRow>
          );
        })()}

        <Text style={styles.meScreenSectionLabel}>
          {t("me.notificationsPage.sectionAlerts")}
        </Text>
        <View style={styles.notificationSettingsSection}>
          <SettingSwitchRow
            title={t("me.notificationsPage.messages.title")}
            value={preferences.messagesEnabled}
            onValueChange={value =>
              changePreferences({ messagesEnabled: value })
            }
            testID="me-notification-messages-switch"
          />
          <View style={styles.notificationSettingsSeparator} />
          <ValueRow
            title={t("me.notificationsPage.sound.rowTitle")}
            value={getMessageSoundDisplayName(
              preferences.messageSound,
              preferences.messageSoundLabel,
              t
            )}
            onPress={() => {
              void openSoundSheet();
            }}
            disabled={!preferences.messagesEnabled}
            testID="me-notification-sound-row"
          />
          <View style={styles.notificationSettingsSeparator} />
          <SettingSwitchRow
            title={t("me.notificationsPage.calls.title")}
            value={preferences.callsEnabled}
            onValueChange={value => changePreferences({ callsEnabled: value })}
            testID="me-notification-calls-switch"
          />
          <View style={styles.notificationSettingsSeparator} />
          <SettingSwitchRow
            title={t("me.notificationsPage.groups.title")}
            value={preferences.groupMessagesEnabled}
            onValueChange={value =>
              changePreferences({ groupMessagesEnabled: value })
            }
            testID="me-notification-groups-switch"
          />
          <View style={styles.notificationSettingsSeparator} />
          <SettingSwitchRow
            title={t("me.notificationsPage.mention.title")}
            value={preferences.mentionOnly}
            onValueChange={value => changePreferences({ mentionOnly: value })}
            disabled={!preferences.groupMessagesEnabled}
            testID="me-notification-mention-switch"
          />
          <View style={styles.notificationSettingsSeparator} />
          <SettingSwitchRow
            title={t("me.notificationsPage.banner.title")}
            value={preferences.inAppBannerEnabled}
            onValueChange={value =>
              changePreferences({ inAppBannerEnabled: value })
            }
            testID="me-notification-banner-switch"
          />
        </View>

        <Text style={styles.meScreenSectionLabel}>
          {t("me.notificationsPage.sectionContent")}
        </Text>
        <View style={styles.notificationSettingsSection}>
          <ValueRow
            title={t("me.notificationsPage.previewRowTitle")}
            value={previewTitleMap[preferences.previewMode]}
            onPress={() => setActiveSheet({ kind: "preview" })}
            testID="me-notification-preview-row"
          />
        </View>

        <Text style={styles.meScreenSectionLabel}>
          {t("me.notificationsPage.sectionQuiet")}
        </Text>
        <View style={styles.notificationSettingsSection}>
          <SettingSwitchRow
            title={t("me.notificationsPage.quiet.title")}
            value={preferences.quietHoursEnabled}
            onValueChange={value =>
              changePreferences({ quietHoursEnabled: value })
            }
            testID="me-notification-quiet-switch"
          />
          <View style={styles.notificationSettingsSeparator} />
          <ValueRow
            title={t("me.notificationsPage.quietStart")}
            value={preferences.quietHoursStart}
            onPress={() => setActiveSheet({ kind: "time", field: "start" })}
            disabled={!preferences.quietHoursEnabled}
            testID="me-notification-quiet-start"
          />
          <View style={styles.notificationSettingsSeparator} />
          <ValueRow
            title={t("me.notificationsPage.quietEnd")}
            value={preferences.quietHoursEnd}
            onPress={() => setActiveSheet({ kind: "time", field: "end" })}
            disabled={!preferences.quietHoursEnabled}
            testID="me-notification-quiet-end"
          />
          <View style={styles.notificationSettingsSeparator} />
          <SettingSwitchRow
            title={t("me.notificationsPage.quietAllowMentions")}
            value={preferences.quietHoursAllowMentions}
            onValueChange={value =>
              changePreferences({ quietHoursAllowMentions: value })
            }
            disabled={!preferences.quietHoursEnabled}
            testID="me-notification-quiet-mentions-switch"
          />
          <View style={styles.notificationSettingsSeparator} />
          <SettingSwitchRow
            title={t("me.notificationsPage.quietAllowCalls")}
            value={preferences.quietHoursAllowCalls}
            onValueChange={value =>
              changePreferences({ quietHoursAllowCalls: value })
            }
            disabled={!preferences.quietHoursEnabled}
            testID="me-notification-quiet-calls-switch"
          />
        </View>
      </ScrollView>

      <BottomSheet
        visible={activeSheet !== null}
        title={
          activeSheet?.kind === "preview"
            ? t("me.notificationsPage.previewSheetTitle")
            : activeSheet?.kind === "sound"
              ? t("me.notificationsPage.sound.sheetTitle")
              : activeSheet?.kind === "time" && activeSheet.field === "start"
                ? t("me.notificationsPage.quietStart")
                : activeSheet?.kind === "time" && activeSheet.field === "end"
                  ? t("me.notificationsPage.quietEnd")
                  : t("me.notificationsPage.timePickerTitle")
        }
        onClose={() => setActiveSheet(null)}
        testID="me-notification-time-sheet"
      >
        {activeSheet?.kind === "preview" ? (
          <BottomSheetOptionList
            options={previewOptions.map(opt => ({
              value: opt.value,
              label: opt.title
            }))}
            selectedValue={preferences.previewMode}
            onSelect={value =>
              handlePreviewSelect(value as NotificationPreviewMode)
            }
            testIDPrefix="me-notification-preview-option"
          />
        ) : activeSheet?.kind === "sound" ? (
          <ScrollView style={styles.notificationTimeSheetScroll}>
            <BottomSheetOptionList
              options={[...toneOptions.fixed, ...toneOptions.system]}
              selectedValue={currentSoundOptionValue}
              onSelect={value => {
                void handleToneSelect(value);
              }}
              testIDPrefix="me-notification-sound-option"
            />
            {toneOptions.supportsSystemPicker ? (
              <>
                <View style={styles.bottomSheetSeparator} />
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => {
                    void handleAndroidSystemPicker();
                  }}
                  style={styles.bottomSheetOptionRow}
                  testID="me-notification-sound-system-picker"
                >
                  <View style={styles.bottomSheetOptionMain}>
                    <Text style={styles.bottomSheetOptionLabel}>
                      {t("me.notificationsPage.sound.systemPicker")}
                    </Text>
                  </View>
                  <Icon
                    name="chevron-forward"
                    size={18}
                    color={theme.colors.textSoft}
                  />
                </TouchableOpacity>
              </>
            ) : null}
          </ScrollView>
        ) : (
          <ScrollView style={styles.notificationTimeSheetScroll}>
            <BottomSheetOptionList
              options={timeOptions}
              selectedValue={
                activeSheet?.kind === "time" && activeSheet.field === "start"
                  ? preferences.quietHoursStart
                  : activeSheet?.kind === "time" && activeSheet.field === "end"
                    ? preferences.quietHoursEnd
                    : undefined
              }
              onSelect={handleTimeSelect}
              testIDPrefix={
                activeSheet?.kind === "time" && activeSheet.field === "start"
                  ? "me-notification-quiet-start-option"
                  : "me-notification-quiet-end-option"
              }
            />
          </ScrollView>
        )}
      </BottomSheet>
    </AccountPageShell>
  );
}

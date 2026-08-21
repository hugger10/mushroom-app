import { useEffect, useMemo, useRef } from "react";
import {
  CommonActions,
  DefaultTheme,
  DarkTheme,
  NavigationContainer
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions
} from "@react-navigation/native-stack";
import { appNavigationRef } from "./app-navigation";
import { AddContactSheet } from "../components/overlays";
import { HomeScreen } from "../screens/HomeScreen";
import {
  AccountSecurityBlockedScreen,
  AccountSecurityDevicesScreen,
  AccountSecurityEventsScreen,
  AccountSecurityOverviewScreen,
  AccountSecurityPasswordScreen,
  AccountSecurityPrivacyScreen,
  MyProfileScreen,
  ProfileBirthdayEditScreen,
  ProfileGenderEditScreen,
  ProfileTextFieldEditScreen,
  NotificationSettingsScreen,
  ChatBackgroundScreen
} from "../features/account";
import {
  AddContactScreen,
  AddressBookMatchListScreen
} from "../features/add-contact";
import {
  StorageDataOverviewScreen,
  StorageUsageScreen
} from "../features/storage";
import { ChatMediaScreen } from "../features/chat-media";
import { MergedForwardDetailScreen } from "../features/chat";
import {
  StartDirectScreen,
  StartGroupConfigureScreen,
  StartGroupSelectScreen
} from "../features/start-conversation";
import { WorkspaceSearchScreen } from "../features/workspace-search";
import {
  PeerProfileScreen,
  PeerProfileRemarkScreen
} from "../features/peer-profile";
import {
  GroupInfoScreen,
  GroupInfoMembersScreen,
  GroupInfoProfileScreen,
  GroupInfoAnnouncementScreen,
  GroupInfoPermissionsScreen,
  GroupInfoPermissionChoiceScreen,
  GroupInfoInviteScreen
} from "../features/group-info";
import { useAppTheme } from "../styles/app-styles";
import type { useMobileAppController } from "../app/controller/useMobileAppController";
import type { AppStackParamList } from "../types/navigation";
import { ChatRoute } from "./routes/ChatRoute";
import log from "../utils/log";

const appLog = log.scope("app");

const Stack = createNativeStackNavigator<AppStackParamList>();

/**
 * Push-style routes (default for the stack): right-to-left slide with the
 * native swipe-back gesture enabled on both iOS and Android. iOS enables it
 * by default; we keep `gestureEnabled: true` explicit so Android behaves
 * the same and intent is documented.
 */
const PUSH_SCREEN_OPTIONS = {
  animation: "slide_from_right",
  gestureEnabled: true
} satisfies NativeStackNavigationOptions;

/**
 * Modal-style routes: bottom-up presentation matching iOS/Android native
 * modal sheets. Used for "create / pick" surfaces that the user is meant
 * to dismiss without affecting the back-stack semantics underneath.
 */
const MODAL_SCREEN_OPTIONS = {
  presentation: "modal",
  animation: "slide_from_bottom",
  gestureEnabled: true
} satisfies NativeStackNavigationOptions;

const GROUP_INFO_ROUTES = new Set<keyof AppStackParamList>([
  "GroupInfo",
  "GroupInfoMembers",
  "GroupInfoProfile",
  "GroupInfoAnnouncement",
  "GroupInfoPermissions",
  "GroupInfoPermissionChoice",
  "GroupInfoInvite",
  "MergedForwardDetail"
]) as Set<string>;

type Controller = ReturnType<typeof useMobileAppController>;

export function MainNavigator(props: { controller: Controller }) {
  const navigationRef = appNavigationRef;
  const { theme } = useAppTheme();
  const readyRef = useRef(false);
  // Set to true by <ChatRoute> when the user actively triggers a POP on the
  // Chat screen (toolbar back button or hardware/gesture back). The wantsChat
  // effect below uses this flag to skip the `reset` fallback so that the
  // native pop animation (current screen sliding right) plays naturally,
  // matching the animation seen when popping any other route in the stack.
  // The flag is cleared the next time the effect runs.
  const popInFlightRef = useRef(false);
  const wantsChat = Boolean(
    props.controller.activeConversation && props.controller.chatScreenProps
  );
  const navigationTheme = useMemo(() => {
    const base = theme.mode === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: theme.colors.background
      }
    };
  }, [theme]);

  useEffect(() => {
    if (!readyRef.current || !navigationRef.isReady()) {
      return;
    }

    const currentRoute = navigationRef.getCurrentRoute()?.name;

    if (wantsChat && currentRoute !== "Chat") {
      navigationRef.dispatch(CommonActions.navigate("Chat"));
      return;
    }

    // Force-reset to Home when leaving Chat or any GroupInfo* route after the
    // active conversation is cleared (e.g. user left/dissolved the group, or
    // the conversation disappeared from the server snapshot). Other stack
    // routes (e.g. AccountSecurity*) intentionally stay put.
    if (
      !wantsChat &&
      (currentRoute === "Chat" ||
        (currentRoute !== undefined && GROUP_INFO_ROUTES.has(currentRoute)))
    ) {
      // If the user actively initiated a POP on Chat (handled by ChatRoute),
      // skip the reset and let the native pop animation play. We only honor
      // the flag while the current route is still `Chat` — if pop already
      // settled on a different surface (e.g. GroupInfo* left over from a
      // `Home → Chat → GroupInfo → Chat'` topology), the flag must NOT keep
      // us from resetting back to Home, otherwise we render a blank screen
      // when GroupInfo's `activeConversation` is null.
      if (popInFlightRef.current && currentRoute === "Chat") {
        popInFlightRef.current = false;
        return;
      }
      popInFlightRef.current = false;
      navigationRef.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "Home" }]
        })
      );
      return;
    }

    // Once the pop has settled on Home, clear the in-flight flag so that
    // later passive-cleanup pushes correctly trigger the reset fallback.
    if (popInFlightRef.current && currentRoute === "Home") {
      popInFlightRef.current = false;
    }
  }, [navigationRef, wantsChat]);

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      onReady={() => {
        readyRef.current = true;
        appLog.info("navigation ready", { wantsChat });
        if (wantsChat) {
          navigationRef.dispatch(CommonActions.navigate("Chat"));
        }
      }}
    >
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
          ...PUSH_SCREEN_OPTIONS,
          contentStyle: { backgroundColor: theme.colors.background }
        }}
      >
        <Stack.Screen name="Home">
          {() =>
            props.controller.homeScreenProps ? (
              <HomeScreen {...props.controller.homeScreenProps} />
            ) : null
          }
        </Stack.Screen>
        <Stack.Screen name="Chat">
          {() => (
            <ChatRoute
              chatScreenProps={props.controller.chatScreenProps}
              popInFlightRef={popInFlightRef}
            />
          )}
        </Stack.Screen>
        <Stack.Screen
          name="AccountSecurityOverview"
          component={AccountSecurityOverviewScreen}
        />
        <Stack.Screen
          name="AccountSecurityDevices"
          component={AccountSecurityDevicesScreen}
        />
        <Stack.Screen
          name="AccountSecurityPassword"
          component={AccountSecurityPasswordScreen}
        />
        <Stack.Screen
          name="AccountSecurityPrivacy"
          component={AccountSecurityPrivacyScreen}
        />
        <Stack.Screen
          name="AccountSecurityBlocked"
          component={AccountSecurityBlockedScreen}
        />
        <Stack.Screen
          name="AccountSecurityEvents"
          component={AccountSecurityEventsScreen}
        />
        <Stack.Screen name="AddContact" component={AddContactScreen} />
        <Stack.Screen
          name="AddressBookMatchList"
          component={AddressBookMatchListScreen}
        />
        <Stack.Screen
          name="StorageDataOverview"
          component={StorageDataOverviewScreen}
        />
        <Stack.Screen name="StorageUsage" component={StorageUsageScreen} />
        <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />
        <Stack.Screen
          name="GroupInfoMembers"
          component={GroupInfoMembersScreen}
        />
        <Stack.Screen
          name="GroupInfoProfile"
          component={GroupInfoProfileScreen}
        />
        <Stack.Screen
          name="GroupInfoAnnouncement"
          component={GroupInfoAnnouncementScreen}
        />
        <Stack.Screen
          name="GroupInfoPermissions"
          component={GroupInfoPermissionsScreen}
        />
        <Stack.Screen
          name="GroupInfoPermissionChoice"
          component={GroupInfoPermissionChoiceScreen}
        />
        <Stack.Screen
          name="GroupInfoInvite"
          component={GroupInfoInviteScreen}
        />
        <Stack.Screen
          name="ChatMedia"
          component={ChatMediaScreen}
          options={{
            presentation: "card",
            animation: "slide_from_right",
            gestureEnabled: true
          }}
        />
        <Stack.Screen
          name="MergedForwardDetail"
          component={MergedForwardDetailScreen}
          options={MODAL_SCREEN_OPTIONS}
        />
        <Stack.Screen
          name="StartDirect"
          component={StartDirectScreen}
          options={MODAL_SCREEN_OPTIONS}
        />
        <Stack.Screen
          name="StartGroupSelect"
          component={StartGroupSelectScreen}
          options={MODAL_SCREEN_OPTIONS}
        />
        <Stack.Screen
          name="StartGroupConfigure"
          component={StartGroupConfigureScreen}
          options={MODAL_SCREEN_OPTIONS}
        />
        <Stack.Screen
          name="WorkspaceSearch"
          component={WorkspaceSearchScreen}
        />
        <Stack.Screen name="PeerProfile" component={PeerProfileScreen} />
        <Stack.Screen
          name="PeerProfileRemark"
          component={PeerProfileRemarkScreen}
        />
        <Stack.Screen
          name="NotificationSettings"
          component={NotificationSettingsScreen}
        />
        <Stack.Screen name="ChatBackground" component={ChatBackgroundScreen} />
        <Stack.Screen name="MyProfile" component={MyProfileScreen} />
        <Stack.Screen
          name="MyProfileFieldEdit"
          component={ProfileTextFieldEditScreen}
        />
        <Stack.Screen
          name="MyProfileGenderEdit"
          component={ProfileGenderEditScreen}
        />
        <Stack.Screen
          name="MyProfileBirthdayEdit"
          component={ProfileBirthdayEditScreen}
        />
      </Stack.Navigator>
      <AddContactSheet {...props.controller.overlayProps.addContactSheet} />
    </NavigationContainer>
  );
}

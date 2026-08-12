import {
  StackActions,
  createNavigationContainerRef
} from "@react-navigation/native";
import type { AppStackParamList } from "../types/navigation";

/**
 * 应用级 NavigationContainer ref，供非组件代码（如 view-props 构造器、actions）
 * 触发原生堆栈跳转。在 App.tsx 中通过 <NavigationContainer ref={appNavigationRef}>
 * 进行绑定。
 */
export const appNavigationRef =
  createNavigationContainerRef<AppStackParamList>();

export function navigateApp<RouteName extends keyof AppStackParamList>(
  ...args: undefined extends AppStackParamList[RouteName]
    ?
        | [screen: RouteName]
        | [screen: RouteName, params: AppStackParamList[RouteName]]
    : [screen: RouteName, params: AppStackParamList[RouteName]]
): void {
  if (!appNavigationRef.isReady()) {
    return;
  }
  // 透传可变参数：react-navigation 的 navigate 自身支持单参/双参重载
  (appNavigationRef.navigate as (...payload: unknown[]) => void)(...args);
}

/**
 * 将栈回退到已存在的 `Chat` 屏。若栈中已存在 Chat，则一次性 pop 掉其上所有
 * 屏（StackActions.popTo），避免出现 `Chat → ... → Chat'` 的夹层拓扑——这种
 * 夹层会导致中间屏在 active conversation 被清空后渲染为 null，从而出现白屏。
 * 若栈中尚无 Chat（如从 Home 直接进入 PeerProfile 后点"发消息"），则用
 * StackActions.replace 替换当前栈顶（通常是 PeerProfile），避免资料页残留
 * 在返回栈中——对齐 WhatsApp / Telegram 的"资料页 → 发消息后按返回直接
 * 回列表"行为。
 */
export function popToChat(): void {
  if (!appNavigationRef.isReady()) {
    return;
  }
  const state = appNavigationRef.getState();
  const hasChat = state?.routes?.some(route => route.name === "Chat") ?? false;
  if (hasChat) {
    appNavigationRef.dispatch(StackActions.popTo("Chat"));
    return;
  }
  appNavigationRef.dispatch(StackActions.replace("Chat"));
}

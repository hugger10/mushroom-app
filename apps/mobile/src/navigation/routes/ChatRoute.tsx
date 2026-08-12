import { useCallback, useEffect, useRef } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChatDetailScreen } from "../../screens/ChatDetailScreen";
import type { useMobileAppController } from "../../app/controller/useMobileAppController";
import type { AppStackParamList } from "../../types/navigation";

type Controller = ReturnType<typeof useMobileAppController>;
export type ChatScreenProps = NonNullable<Controller["chatScreenProps"]>;

export function ChatRoute(props: {
  chatScreenProps: ChatScreenProps | null;
  popInFlightRef: React.RefObject<boolean>;
}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { chatScreenProps, popInFlightRef } = props;

  // 一旦用户触发 POP，cleanup 会立即把 activeConversationId 置 null，
  // 外层 chatScreenProps 随之变为 null。但此时原生 pop 动画还在播放，
  // Chat 屏必须继续渲染最后一次有效的内容，否则会出现白屏。
  // 这里把最近一次非空的 props 缓存到 ref，渲染时优先取缓存值。
  const lastPropsRef = useRef<ChatScreenProps | null>(chatScreenProps);
  if (chatScreenProps) {
    lastPropsRef.current = chatScreenProps;
  }
  const effectiveProps = chatScreenProps ?? lastPropsRef.current;

  // cleanupRef 持有最新的 onBack（即 closeConversationDetail），
  // 供 beforeRemove 监听器在动画开始前同步清理 chat state。
  const cleanupRef = useRef<(() => void) | null>(
    effectiveProps?.onBack ?? null
  );
  if (effectiveProps) {
    cleanupRef.current = effectiveProps.onBack;
  }

  useEffect(() => {
    return navigation.addListener("beforeRemove", event => {
      // navigation.goBack() dispatches `GO_BACK`; hardware/gesture back from
      // native-stack also surfaces as `GO_BACK` on most platforms, while
      // `CommonActions.pop()` would emit `POP`. We must accept both, otherwise
      // the cleanup never runs and `activeConversationId` keeps the previous
      // value — making the next tap on the same conversation row a noop
      // (setState with identical value) and breaking re-entry into Chat.
      const type = event.data.action.type;
      if (type !== "GO_BACK" && type !== "POP") {
        return;
      }
      popInFlightRef.current = true;
      // Defer cleanup to the next tick: doing setState synchronously inside
      // the beforeRemove handler causes React to re-render the navigator
      // mid-event, which can interact poorly with native-stack's pop
      // animation. Yielding lets the native pop begin before chat state
      // resets.
      const cleanup = cleanupRef.current;
      if (cleanup) {
        setTimeout(cleanup, 0);
      }
    });
  }, [navigation, popInFlightRef]);

  // 工具栏返回按钮触发 navigation.goBack()，由原生 stack 播放 pop 动画，
  // 并通过上面的 beforeRemove 监听器同步触发 closeConversationDetail 清理。
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      cleanupRef.current?.();
    }
  }, [navigation]);

  if (!effectiveProps) {
    return null;
  }

  return <ChatDetailScreen {...effectiveProps} onBack={handleBack} />;
}

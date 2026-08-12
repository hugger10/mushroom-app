import { useCallback, useRef } from "react";
import { Animated } from "react-native";
import type { Message } from "@mushroom/shared";
import type { MessageMenuAnchor } from "../../MessageContextMenu";
import { hapticHeavy } from "../../../../platform/haptics";

/**
 * 气泡长按：短暂的 scale 弹性反馈 + 透传长按回调。
 *
 * 历史背景：T15 前菜单需要测量锚点位置，现在已迁到 gorhom BottomSheet，
 * 因此 anchor 仅作为 0-rect 占位以保持回调签名兼容。
 *
 * 当外部未提供 `onLongPress` 时，回退为单击行为，避免长按吞事件。
 */
export function useBubbleLongPress(args: {
  message: Message;
  onLongPress?: (message: Message, anchor: MessageMenuAnchor) => void;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleLongPress = useCallback(() => {
    if (!args.onLongPress) {
      args.onPress();
      return;
    }
    hapticHeavy();
    Animated.spring(scaleAnim, {
      toValue: 1.03,
      damping: 15,
      stiffness: 300,
      useNativeDriver: true
    }).start();
    args.onLongPress(args.message, { x: 0, y: 0, width: 0, height: 0 });
    Animated.spring(scaleAnim, {
      toValue: 1,
      damping: 15,
      stiffness: 300,
      useNativeDriver: true
    }).start();
  }, [args.onLongPress, args.onPress, args.message, scaleAnim]);

  return { scaleAnim, handleLongPress };
}

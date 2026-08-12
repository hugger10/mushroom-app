import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "../../styles/app-styles";
import type { StatusMessage } from "../../app/controller/state/status-types";
import log from "../../utils/log";

const VISIBLE_MS = 1000;
const FADE_IN_MS = 220;
const FADE_OUT_MS = 220;

type ToastProps = {
  /** Reactive status object — typically wired to controller.status. */
  message: StatusMessage;
};

/**
 * Global Toast component.
 *
 * Subscribes to the controller's `status` object and surfaces it as a
 * floating toast at the bottom of the screen. Auto-dismisses after
 * {@link VISIBLE_MS}ms.
 *
 * Visibility rules (see status-types.ts for the rationale):
 * - `user`   → render the toast.
 * - `silent` → swallow (used for background bookkeeping like the auto-refresh
 *              that runs when entering the "Me" tab).
 * - `debug`  → only forwarded to the shared logger under `__DEV__`, never rendered.
 *
 * The effect depends on `message.ts` (a monotonic timestamp) rather than
 * `message.text`, so calling `setStatus` twice with the same text still
 * re-triggers the toast — this matches user expectation for repeated actions
 * (e.g. tapping "favorite" → "unfavorite" → "favorite" again).
 *
 * Entry/exit transitions are driven by Reanimated v4 layout animations
 * (`FadeIn` / `FadeOut`), which run on the UI thread via the worklets
 * runtime and stay smooth even when the JS thread is busy.
 */
export function Toast(props: ToastProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [displayed, setDisplayed] = useState<string | null>(null);
  const isInitialRef = useRef(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isInitialRef.current) {
      isInitialRef.current = false;
      return;
    }

    const { text, level } = props.message;

    if (level === "debug") {
      if (__DEV__) {
        log.scope("status").debug(text);
      }
      // Important: do NOT return a cleanup function here. React would invoke
      // it on the NEXT effect run as well — which means a `silent`/`debug`
      // status arriving while a `user` toast is still on screen would clear
      // the dismissal timer and leave the toast stuck until another `user`
      // status replaces it. Returning `undefined` keeps the in-flight timer
      // untouched.
      return;
    }

    if (level === "silent") {
      return;
    }

    const trimmed = text?.trim?.() ?? "";
    if (!trimmed) {
      return;
    }

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    setDisplayed(trimmed);

    hideTimerRef.current = setTimeout(() => {
      setDisplayed(null);
      hideTimerRef.current = null;
    }, VISIBLE_MS);

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
    // Depend on `ts` so identical text re-triggers the toast.
  }, [props.message.ts]);

  if (!displayed) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={[styles.layer, { bottom: Math.max(insets.bottom + 64, 96) }]}
    >
      <Animated.View
        entering={FadeIn.duration(FADE_IN_MS)}
        exiting={FadeOut.duration(FADE_OUT_MS)}
        style={[
          styles.bubble,
          {
            backgroundColor: theme.colors.surfaceStrong,
            borderColor: theme.colors.border
          }
        ]}
        testID="global-toast"
      >
        <Text style={[styles.text, { color: theme.colors.text }]}>
          {displayed}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    left: 24,
    right: 24,
    alignItems: "center",
    zIndex: 200
  },
  bubble: {
    maxWidth: "100%",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8
  },
  text: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center"
  }
});

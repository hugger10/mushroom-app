/**
 * Mobile haptics platform layer (T8 — Phase B).
 *
 * Thin semantic wrapper around `react-native-haptic-feedback`. Call sites
 * should use these named helpers rather than the underlying `trigger()` so
 * platform tweaks (e.g. iOS Taptic vs Android Vibrator intensity) stay
 * centralized.
 *
 * Behavior notes:
 *  - iOS routes through the Taptic Engine (HapticFeedback API), producing
 *    fine-grained impacts. Honors the system "Reduce Motion" / vibration
 *    accessibility setting via {@link HapticOptions.ignoreAndroidSystemSettings}.
 *  - Android falls back to the vibrator API. Patterns are coarser; we
 *    standardize them through preset feedback types.
 *  - Failures are swallowed (best-effort UX feedback).
 */
import { Platform, Vibration } from "react-native";
import ReactNativeHapticFeedback, {
  HapticFeedbackTypes,
  type HapticOptions
} from "react-native-haptic-feedback";

const defaultOptions: HapticOptions = {
  enableVibrateFallback: true,
  // Honor the user's Android system vibration settings when possible. If the
  // user has disabled vibration globally we do nothing.
  ignoreAndroidSystemSettings: false
};

function safeTrigger(type: HapticFeedbackTypes) {
  try {
    ReactNativeHapticFeedback.trigger(type, defaultOptions);
  } catch {
    // best-effort feedback only
  }
}

/** Subtle tick — selection change, swipe crossing threshold, option tap. */
export function hapticLight() {
  safeTrigger(HapticFeedbackTypes.impactLight);
}

/** Medium impact — long-press menu open, recording start. */
export function hapticMedium() {
  safeTrigger(HapticFeedbackTypes.impactMedium);
}

/** Strong impact — destructive confirm, sent message ack on slow networks. */
export function hapticHeavy() {
  safeTrigger(HapticFeedbackTypes.impactHeavy);
}

/** Success notification — message sent, call accepted. */
export function hapticSuccess() {
  safeTrigger(HapticFeedbackTypes.notificationSuccess);
}

/** Warning notification — call rejected, retry needed. */
export function hapticWarning() {
  safeTrigger(HapticFeedbackTypes.notificationWarning);
}

/** Error notification — send failure, permission denied. */
export function hapticError() {
  safeTrigger(HapticFeedbackTypes.notificationError);
}

/**
 * Destructive feedback — recording cancel / slide-to-delete threshold.
 * iOS uses the taptic warning notification; Android emits a double-pulse
 * vibrate pattern closer to WhatsApp's trash-armed feel.
 *
 * Note: `react-native-haptic-feedback` maps to single preset pulses only and
 * cannot express the double-pulse pattern, so Android calls `Vibration.vibrate`
 * directly (deliberately bypassing `ignoreAndroidSystemSettings`). On Android
 * 10+ the system still suppresses vibration at the hardware layer when the user
 * has disabled it globally.
 */
export function hapticDelete() {
  if (Platform.OS === "android") {
    try {
      Vibration.vibrate([0, 60, 40, 60]);
    } catch {
      // best-effort feedback only
    }
    return;
  }
  safeTrigger(HapticFeedbackTypes.notificationWarning);
}

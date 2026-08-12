package com.outland.mushroom.pip

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import android.util.Rational
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Thin native bridge that exposes Android Picture-in-Picture to JS for the
 * in-call video overlay. Mirrors WhatsApp/Telegram: when the user presses Home
 * during a video call, the call shrinks into a system PiP window instead of
 * being torn down.
 *
 * iOS does NOT use this module — livekit's `RTCPIPView` handles iOS PiP
 * natively. All methods resolve to no-op/false on iOS via the JS wrapper.
 *
 * The actual PiP entry + mode-change reporting lives in [MainActivity]; this
 * module only relays calls and remembers the auto-enter preference so
 * `onUserLeaveHint` (Home key) can decide whether to enter PiP.
 */
class PipModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for NativeEventEmitter on Android.
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    // Required for NativeEventEmitter on Android.
  }

  @ReactMethod
  fun isPipSupported(promise: Promise) {
    val supported =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        reactContext.packageManager.hasSystemFeature(
          PackageManager.FEATURE_PICTURE_IN_PICTURE
        )
    promise.resolve(supported)
  }

  /**
   * Enable/disable auto-enter PiP on Home. We store the preference on the
   * activity; on Android 12+ the OS auto-enters via
   * `setAutoEnterEnabled(true)`, and on Android 8–11 the activity falls back
   * to entering PiP from `onUserLeaveHint`.
   */
  @ReactMethod
  fun setAutoEnterEnabled(enabled: Boolean, width: Int, height: Int, promise: Promise) {
    val activity = reactContext.currentActivity as? PipHost
    if (activity == null) {
      promise.resolve(false)
      return
    }
    activity.setPipAutoEnter(enabled, width, height)
    promise.resolve(true)
  }

  /** Imperatively enter PiP now (used as the Android 8–11 manual fallback). */
  @ReactMethod
  fun enterPipMode(width: Int, height: Int, promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.resolve(false)
      return
    }
    val activity: Activity? = reactContext.currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }
    val safeWidth = if (width > 0) width else 16
    val safeHeight = if (height > 0) height else 9
    try {
      val params = PictureInPictureParams.Builder()
        .setAspectRatio(Rational(safeWidth, safeHeight))
        .build()
      val entered = activity.enterPictureInPictureMode(params)
      promise.resolve(entered)
    } catch (error: Exception) {
      promise.reject("E_PIP_ENTER", error.message, error)
    }
  }

  @ReactMethod
  fun isInPipMode(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
      promise.resolve(false)
      return
    }
    val activity: Activity? = reactContext.currentActivity
    promise.resolve(activity?.isInPictureInPictureMode ?: false)
  }

  companion object {
    const val MODULE_NAME = "MushroomPip"
    const val EVENT_PIP_MODE_CHANGED = "MushroomPipModeChanged"
  }
}

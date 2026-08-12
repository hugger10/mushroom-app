package com.outland.mushroom

import android.app.PictureInPictureParams
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.Rational
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.outland.mushroom.pip.PipHost
import com.outland.mushroom.pip.PipModule

class MainActivity : ReactActivity(), PipHost {

  // Whether an ongoing video call wants to auto-enter PiP on Home. Updated from
  // JS via PipModule.setAutoEnterEnabled.
  private var pipAutoEnter = false
  private var pipAspectWidth = 16
  private var pipAspectHeight = 9

  override fun onCreate(savedInstanceState: Bundle?) {
    // 启用 edge-to-edge：让 App 内容延伸到 status bar / navigation bar 区域
    WindowCompat.setDecorFitsSystemWindows(window, false)
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "Mesh"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  // --- Picture-in-Picture --------------------------------------------------

  override fun setPipAutoEnter(enabled: Boolean, width: Int, height: Int) {
    pipAutoEnter = enabled
    if (width > 0 && height > 0) {
      pipAspectWidth = width
      pipAspectHeight = height
    }
    // Android 12+ can auto-enter PiP seamlessly; declare it on the params so the
    // OS shrinks the activity on Home without us racing onUserLeaveHint.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      runCatching {
        setPictureInPictureParams(buildPipParams())
      }
    }
  }

  private fun buildPipParams(): PictureInPictureParams {
    val builder = PictureInPictureParams.Builder()
      .setAspectRatio(Rational(pipAspectWidth, pipAspectHeight))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setAutoEnterEnabled(pipAutoEnter)
    }
    return builder.build()
  }

  /**
   * Fallback path for Android 8–11 (no setAutoEnterEnabled): enter PiP manually
   * when the user leaves the activity (Home key) during a video call.
   */
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (
      pipAutoEnter &&
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      Build.VERSION.SDK_INT < Build.VERSION_CODES.S &&
      !isInPictureInPictureMode
    ) {
      runCatching { enterPictureInPictureMode(buildPipParams()) }
    }
  }

  override fun onPictureInPictureModeChanged(
    isInPictureInPictureMode: Boolean,
    newConfig: Configuration
  ) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    emitPipModeChanged(isInPictureInPictureMode)
  }

  private fun emitPipModeChanged(isInPip: Boolean) {
    val reactContext: ReactContext? =
      (application as? ReactApplication)
        ?.reactHost
        ?.currentReactContext
    if (reactContext == null || !reactContext.hasActiveReactInstance()) {
      return
    }
    val payload = Arguments.createMap().apply {
      putBoolean("isInPipMode", isInPip)
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(PipModule.EVENT_PIP_MODE_CHANGED, payload)
  }
}

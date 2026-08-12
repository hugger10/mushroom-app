package com.outland.mushroom.call

import android.telecom.DisconnectCause
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * RN bridge for the self-managed telecom call module. Mirrors the minimal API
 * the JS layer needs on Android (replacing what CallKeep used to provide):
 *   - [reportIncomingCall]: surface an incoming call to the OS
 *   - [endCall]: tear down an active incoming connection
 *   - events `MushroomCallAnswer` / `MushroomCallEnd` (NativeEventEmitter)
 */
class CallConnectionModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  init {
    CallReactBridge.reactContext = reactContext
  }

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
  fun reportIncomingCall(
    callId: String,
    callerName: String,
    hasVideo: Boolean,
    promise: Promise
  ) {
    val ok =
      MeshTelecom.reportIncomingCall(
        reactApplicationContext.applicationContext,
        callId,
        callerName,
        hasVideo
      )
    promise.resolve(ok)
  }

  @ReactMethod
  fun endCall(callId: String, promise: Promise) {
    val connection = MeshConnectionService.activeConnections.remove(callId)
    if (connection != null) {
      connection.setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
      connection.destroy()
    }
    promise.resolve(null)
  }

  companion object {
    const val MODULE_NAME = "MushroomCallConnection"
    const val EVENT_ANSWER = "MushroomCallAnswer"
    const val EVENT_END = "MushroomCallEnd"
  }
}

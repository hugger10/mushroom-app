package com.outland.mushroom.call

import android.os.Build
import android.os.Bundle
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Self-managed ConnectionService for incoming calls.
 *
 * The OS binds this service when we report an incoming call
 * ([MeshTelecom.reportIncomingCall] → `TelecomManager.addNewIncomingCall`). It
 * renders the OS ringing + lock-screen call notification; the full-screen
 * incoming-call UI is our Notifee notification + CallOverlay (see
 * `notifications/calls.ts`). Answer/reject/disconnect actions are bridged to
 * JS so the by-id accept/reject path (`acceptCallById` / `rejectOrEndCallById`)
 * can rebuild the call session.
 */
class MeshConnectionService : ConnectionService() {

  override fun onCreateIncomingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest?
  ): Connection {
    val extras = request?.extras ?: Bundle()
    val callId = extras.getString(MeshTelecom.EXTRA_CALL_ID) ?: ""
    if (callId.isEmpty()) {
      return Connection.createFailedConnection(DisconnectCause(DisconnectCause.ERROR))
    }
    val callerName = extras.getString(MeshTelecom.EXTRA_CALLER_NAME) ?: ""
    val hasVideo = extras.getBoolean(MeshTelecom.EXTRA_HAS_VIDEO, false)

    val connection =
      MeshCallConnection(callId, callerName, hasVideo) { action, id ->
        emitCallEvent(action, id)
      }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      connection.setConnectionProperties(Connection.PROPERTY_SELF_MANAGED)
    }
    connection.setCallerDisplayName(callerName, TelecomManager.PRESENTATION_ALLOWED)
    // A self-managed connection does not render a system caller screen; the
    // ringtone is played by our Notifee full-screen notification (loopSound).
    // Android exposes no API to set/silence the system ringtone
    // (`Connection.setRingtone` does not exist), so we rely on the OS not
    // ringing self-managed connections. VERIFY on real devices: if some ROMs
    // still play the system ringtone, fall back to the system ringtone and
    // silence the Notifee notification instead.
    connection.setRinging()

    activeConnections[callId] = connection
    return connection
  }

  override fun onCreateOutgoingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest?
  ): Connection? {
    // Outgoing calls are driven by CallOverlay + WebRTC, not through a system
    // phone account.
    return null
  }

  private fun emitCallEvent(action: String, callId: String) {
    val reactContext = CallReactBridge.reactContext ?: return
    if (!reactContext.hasActiveReactInstance()) {
      return
    }
    val params =
      Arguments.createMap().apply {
        putString("callId", callId)
      }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(action, params)
  }

  companion object {
    /** Active incoming connections by call id. */
    val activeConnections = mutableMapOf<String, MeshCallConnection>()
  }
}

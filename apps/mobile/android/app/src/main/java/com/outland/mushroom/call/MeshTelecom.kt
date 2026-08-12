package com.outland.mushroom.call

import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager

/**
 * Self-managed telecom phone account for incoming calls.
 *
 * Registers a `CAPABILITY_SELF_MANAGED` phone account — the OS auto-enables it
 * (no "启用来电提醒" confirmation) and it requires no
 * READ_PHONE_STATE / CALL_PHONE / READ_PHONE_NUMBERS permissions. The OS still
 * rings / shows a lock-screen call notification; the full-screen incoming-call
 * UI is rendered by our Notifee notification + CallOverlay instead.
 */
object MeshTelecom {

  const val PHONE_ACCOUNT_ID = "mushroom-calls"
  const val EXTRA_CALL_ID = "mushroom_call_id"
  const val EXTRA_CALLER_NAME = "mushroom_caller_name"
  const val EXTRA_HAS_VIDEO = "mushroom_has_video"

  private fun getPhoneAccountHandle(context: Context): PhoneAccountHandle {
    val component = ComponentName(context, MeshConnectionService::class.java)
    return PhoneAccountHandle(component, PHONE_ACCOUNT_ID)
  }

  /**
   * Register (or refresh) the self-managed phone account. Idempotent: repeated
   * registration just updates the existing account. We intentionally do NOT
   * query `TelecomManager.getPhoneAccount` to check existence — that call
   * requires READ_PHONE_NUMBERS on Android 12+ and would crash.
   */
  fun ensureRegistered(context: Context) {
    val telecom = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
    val handle = getPhoneAccountHandle(context)
    val appName = context.applicationInfo.loadLabel(context.packageManager).toString()
    val account =
      PhoneAccount.Builder(handle, appName)
        .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
        .build()
    telecom.registerPhoneAccount(account)
  }

  /**
   * Report an incoming call to the system. Returns false if the OS rejected
   * the request (e.g. another active call). Never throws.
   */
  fun reportIncomingCall(
    context: Context,
    callId: String,
    callerName: String,
    hasVideo: Boolean
  ): Boolean {
    if (callId.isEmpty()) {
      return false
    }
    ensureRegistered(context)
    val telecom = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
    val extras =
      Bundle().apply {
        putString(EXTRA_CALL_ID, callId)
        putString(EXTRA_CALLER_NAME, callerName)
        putBoolean(EXTRA_HAS_VIDEO, hasVideo)
      }
    return try {
      telecom.addNewIncomingCall(getPhoneAccountHandle(context), extras)
      true
    } catch (e: Exception) {
      false
    }
  }
}

package com.outland.mushroom.xiaomi

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.xiaomi.mipush.sdk.MiPushMessage
import com.xiaomi.mipush.sdk.PushMessageReceiver
import org.json.JSONObject

/**
 * Receives Mi-Push messages from the Xiaomi SDK and, for incoming-call
 * payloads, wakes a HeadlessJS task so the JS layer can show the system call UI
 * (CallKeep) and a full-screen notification — even when the app has been
 * swiped away.
 *
 * The server delivers `call.invite` to Xiaomi devices as a **pass-through**
 * message (so it does not auto-display a plain notification and the payload is
 * available here). Chat messages keep using normal Mi-Push notifications.
 */
class XiaomiPushReceiver : PushMessageReceiver() {

  override fun onReceivePassThroughMessage(context: Context, message: MiPushMessage) {
    val payload = extractPayload(message) ?: return
    dispatchToHeadlessTask(context.applicationContext, payload)
  }

  override fun onNotificationMessageClicked(context: Context, message: MiPushMessage) {
    // When a chat-message notification is tapped, hand the payload to the
    // headless task too, so the badge/open-conversation logic runs even from a
    // cold start. The JS task decides what (if anything) to display.
    val payload = extractPayload(message) ?: return
    dispatchToHeadlessTask(context.applicationContext, payload)
  }

  private fun extractPayload(message: MiPushMessage): String? {
    val content = message.content?.takeIf { it.isNotBlank() }
    if (content != null && content.trimStart().startsWith("{")) {
      return content
    }

    // Server attaches the JSON payload under `mushroom_payload` extra as a
    // fallback for notification-type messages.
    val extra = message.extra?.get(EXTRA_PAYLOAD_KEY)
    if (!extra.isNullOrBlank()) {
      return extra
    }

    // No structured JSON found in `content` and no `mushroom_payload` extra.
    // Return the raw `content` (which may be null or plain text); the JS
    // payload parser treats a non-JSON value as "no actionable payload" and
    // the caller bails out via the `?: return` guards above.
    return content
  }

  private fun dispatchToHeadlessTask(context: Context, payloadJson: String) {
    try {
      // Guard: only spin up the headless service for call payloads, which are
      // the time-critical, background-must-ring case. Other types are handled
      // by the foreground/FCM paths.
      val type =
        try {
          JSONObject(payloadJson).optString("type")
        } catch (_: Exception) {
          ""
        }
      if (type != "call.invite" && type != "call.missed") {
        return
      }

      val intent = Intent(context, XiaomiHeadlessService::class.java)
      intent.putExtra(XiaomiHeadlessService.EXTRA_PAYLOAD, payloadJson)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    } catch (error: Exception) {
      Log.w(TAG, "Failed to dispatch Xiaomi push to headless task", error)
    }
  }

  companion object {
    private const val TAG = "XiaomiPushReceiver"
    private const val EXTRA_PAYLOAD_KEY = "mushroom_payload"
  }
}

package com.outland.mushroom.xiaomi

import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * HeadlessJS bridge that runs the JS `XiaomiCallPush` task when a Mi-Push
 * call payload arrives while the app is backgrounded/killed. The JS task
 * reports the incoming call to CallKeep and shows a full-screen notification.
 */
class XiaomiHeadlessService : HeadlessJsTaskService() {

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val payload = intent?.getStringExtra(EXTRA_PAYLOAD) ?: return null
    val data: Bundle =
      Bundle().apply {
        putString(EXTRA_PAYLOAD, payload)
      }
    return HeadlessJsTaskConfig(
      TASK_KEY,
      Arguments.fromBundle(data),
      // Allow up to 30s — enough to register the CallKit/CallKeep call and post
      // the notification. The call's own timeout governs the ring duration.
      30_000,
      // allowedInForeground: surface the call even if the app process is alive
      // but not in the foreground.
      true
    )
  }

  companion object {
    const val EXTRA_PAYLOAD = "payload"
    private const val TASK_KEY = "XiaomiCallPush"
  }
}

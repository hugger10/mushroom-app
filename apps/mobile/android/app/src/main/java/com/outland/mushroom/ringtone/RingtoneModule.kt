package com.outland.mushroom.ringtone

import android.app.Activity
import android.content.Intent
import android.media.RingtoneManager
import android.net.Uri
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

/**
 * 消息铃声系统选择器封装（对齐 element-x-android）。
 *
 * 只做一件事：拉起系统 `ACTION_RINGTONE_PICKER`，把选择结果映射为可区分的 selection：
 *   - `cancel`         用户取消 → 保持原选择
 *   - `silent`         选择「静音」（picker 返回 null URI）
 *   - `system_default` 选择「跟随系统」（返回 URI == 系统默认通知 URI）
 *   - `custom`         具体铃声 → `{ uri, title }`
 *
 * 注意：区分 `silent` 与 `system_default` 必须由原生完成——两者在 picker 返回的 URI
 * 上表现不同（null vs 默认 URI），若都折叠为 `uri: null` JS 侧将无法区分。
 */
class RingtoneModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var pendingPromise: Promise? = null

  override fun getName(): String = MODULE_NAME

  init {
    reactApplicationContext.addActivityEventListener(this)
  }

  @ReactMethod
  fun launchMessageSoundPicker(existingUri: String?, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("ERR_NO_ACTIVITY", "No current activity to launch ringtone picker")
      return
    }
    if (pendingPromise != null) {
      // 旧 Activity 已销毁但 promise 未 resolve（配置变更/进程回收）——
      // resolve 掉旧的以免后续调用被永久 ERR_PICKER_BUSY 阻塞。
      pendingPromise!!.resolve(
        selectionMap("cancel", null, null)
      )
      pendingPromise = null
    }

    val defaultUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    val intent =
      Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
        putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_NOTIFICATION)
        putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
        putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, true)
        putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI, defaultUri)
        if (!existingUri.isNullOrBlank() && existingUri.startsWith("content://")) {
          putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(existingUri))
        }
      }

    pendingPromise = promise
    try {
      activity.startActivityForResult(intent, REQUEST_CODE)
    } catch (error: Exception) {
      pendingPromise = null
      promise.reject("ERR_LAUNCH_PICKER", error.message, error)
    }
  }

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?
  ) {
    if (requestCode != REQUEST_CODE) {
      return
    }
    val promise = pendingPromise
    pendingPromise = null
    if (promise == null) {
      return
    }

    if (resultCode != Activity.RESULT_OK || data == null) {
      promise.resolve(selectionMap("cancel", null, null))
      return
    }

    val pickedUri: Uri? = data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
    if (pickedUri == null) {
      promise.resolve(selectionMap("silent", null, null))
      return
    }

    val defaultUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    if (pickedUri == defaultUri) {
      promise.resolve(selectionMap("system_default", null, null))
      return
    }

    val title =
      RingtoneManager
        .getRingtone(reactApplicationContext, pickedUri)
        ?.getTitle(reactApplicationContext)
    promise.resolve(selectionMap("custom", pickedUri.toString(), title))
  }

  override fun onNewIntent(intent: Intent) {
    // no-op
  }

  private fun selectionMap(
    selection: String,
    uri: String?,
    title: String?
  ): WritableMap {
    return Arguments.createMap().apply {
      putString("selection", selection)
      putString("uri", uri)
      putString("title", title)
    }
  }

  private companion object {
    const val MODULE_NAME = "MushroomRingtone"
    const val REQUEST_CODE = 0x4d5243
  }
}

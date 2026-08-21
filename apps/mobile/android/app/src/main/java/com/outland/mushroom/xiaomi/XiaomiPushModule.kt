package com.outland.mushroom.xiaomi

import android.content.pm.PackageManager
import android.os.Bundle
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.xiaomi.mipush.sdk.MiPushClient
import com.xiaomi.mipush.sdk.PushConfiguration
import com.xiaomi.push.service.module.PushChannelRegion

class XiaomiPushModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for NativeEventEmitter compatibility.
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    // Required for NativeEventEmitter compatibility.
  }

  @ReactMethod
  fun isAvailable(promise: Promise) {
    val appId = readMetaDataValue(APP_ID_META_DATA)
    val appKey = readMetaDataValue(APP_KEY_META_DATA)
    promise.resolve(!appId.isNullOrBlank() && !appKey.isNullOrBlank())
  }

  @ReactMethod
  fun getConfiguration(promise: Promise) {
    try {
      val configuration = Arguments.createMap()
      configuration.putString("appId", readMetaDataValue(APP_ID_META_DATA))
      configuration.putString("appKey", readMetaDataValue(APP_KEY_META_DATA))
      configuration.putString("region", readMetaDataValue(REGION_META_DATA))
      configuration.putBoolean("sdkAvailable", true)
      promise.resolve(configuration)
    } catch (error: Exception) {
      promise.reject("ERR_XIAOMI_CONFIG", error.message, error)
    }
  }

  @ReactMethod
  fun registerPush(promise: Promise) {
    val appId = readMetaDataValue(APP_ID_META_DATA)
    val appKey = readMetaDataValue(APP_KEY_META_DATA)
    if (appId.isNullOrBlank() || appKey.isNullOrBlank()) {
      promise.reject("ERR_XIAOMI_REGISTER", "Missing Xiaomi push AppId/AppKey")
      return
    }

    try {
      val pushConfiguration = PushConfiguration()
      resolvePushChannelRegion(readMetaDataValue(REGION_META_DATA))?.let { region ->
        pushConfiguration.setRegion(region)
      }
      MiPushClient.registerPush(
        reactApplicationContext.applicationContext,
        appId,
        appKey,
        pushConfiguration
      )
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("ERR_XIAOMI_REGISTER", error.message, error)
    }
  }

  @ReactMethod
  fun getRegId(promise: Promise) {
    try {
      val regId = MiPushClient.getRegId(reactApplicationContext.applicationContext)
      promise.resolve(regId)
    } catch (error: Exception) {
      promise.reject("ERR_XIAOMI_REGID", error.message, error)
    }
  }

  @ReactMethod
  fun getAppRegion(promise: Promise) {
    try {
      val region = MiPushClient.getAppRegion(reactApplicationContext.applicationContext)
      promise.resolve(normalizeRegion(region))
    } catch (error: Exception) {
      promise.reject("ERR_XIAOMI_REGION", error.message, error)
    }
  }

  private fun readMetaDataValue(key: String): String? {
    val appInfo =
      reactApplicationContext.packageManager.getApplicationInfo(
        reactApplicationContext.packageName,
        PackageManager.GET_META_DATA
      )
    val metaData: Bundle = appInfo.metaData ?: return null
    return metaData.getString(key)?.trim()?.takeIf { it.isNotEmpty() }
  }

  private fun resolvePushChannelRegion(rawRegion: String?): PushChannelRegion =
    when (normalizeRegion(rawRegion)) {
      "china" -> PushChannelRegion.China
      "global" -> PushChannelRegion.Global
      "europe" -> PushChannelRegion.Europe
      "russia" -> PushChannelRegion.Russia
      "india" -> PushChannelRegion.India
      else -> PushChannelRegion.China
    }

  private fun normalizeRegion(rawRegion: String?): String? {
    val normalized = rawRegion?.trim()?.lowercase() ?: return null
    return when (normalized) {
      "mainland" -> "china"
      "singapore" -> "global"
      "china", "global", "europe", "russia", "india" -> normalized
      else -> null
    }
  }

  companion object {
    private const val MODULE_NAME = "XiaomiPushBridge"
    private const val APP_ID_META_DATA = "mushroom.xiaomi.push.APP_ID"
    private const val APP_KEY_META_DATA = "mushroom.xiaomi.push.APP_KEY"
    private const val REGION_META_DATA = "mushroom.xiaomi.push.REGION"
  }
}

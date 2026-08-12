package com.outland.mushroom.xiaomi

import android.content.pm.PackageManager
import android.os.Bundle
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

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
    promise.resolve(resolveMiPushClientClass() != null)
  }

  @ReactMethod
  fun getConfiguration(promise: Promise) {
    try {
      val configuration = Arguments.createMap()
      configuration.putString("appId", readMetaDataValue(APP_ID_META_DATA))
      configuration.putString("appKey", readMetaDataValue(APP_KEY_META_DATA))
      configuration.putString("region", readMetaDataValue(REGION_META_DATA))
      configuration.putBoolean("sdkAvailable", resolveMiPushClientClass() != null)
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
      val miPushClientClass = resolveMiPushClientClass()
      if (miPushClientClass == null) {
        promise.reject(
          "ERR_XIAOMI_REGISTER",
          "Xiaomi MiPush SDK AAR is missing from android/app/libs"
        )
        return
      }

      configureRegion(miPushClientClass, readMetaDataValue(REGION_META_DATA))
      val registerMethod =
        miPushClientClass.getMethod(
          "registerPush",
          android.content.Context::class.java,
          String::class.java,
          String::class.java
        )
      registerMethod.invoke(null, reactApplicationContext.applicationContext, appId, appKey)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("ERR_XIAOMI_REGISTER", error.message, error)
    }
  }

  @ReactMethod
  fun getRegId(promise: Promise) {
    try {
      val miPushClientClass = resolveMiPushClientClass()
      if (miPushClientClass == null) {
        promise.resolve(null)
        return
      }

      val getRegIdMethod =
        miPushClientClass.getMethod("getRegId", android.content.Context::class.java)
      val regId = getRegIdMethod.invoke(null, reactApplicationContext.applicationContext)
      promise.resolve(regId?.toString())
    } catch (error: Exception) {
      promise.reject("ERR_XIAOMI_REGID", error.message, error)
    }
  }

  @ReactMethod
  fun getAppRegion(promise: Promise) {
    try {
      val miPushClientClass = resolveMiPushClientClass()
      if (miPushClientClass == null) {
        promise.resolve(null)
        return
      }

      val getAppRegionMethod =
        miPushClientClass.getMethod("getAppRegion", android.content.Context::class.java)
      val region = getAppRegionMethod.invoke(null, reactApplicationContext.applicationContext)
      promise.resolve(region?.toString()?.trim()?.lowercase())
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

  private fun resolveMiPushClientClass(): Class<*>? =
    try {
      Class.forName("com.xiaomi.mipush.sdk.MiPushClient")
    } catch (_: ClassNotFoundException) {
      null
    }

  private fun configureRegion(miPushClientClass: Class<*>, rawRegion: String?) {
    val normalizedRegion =
      when (rawRegion?.trim()?.lowercase()) {
        "europe" -> "Europe"
        "russia" -> "Russia"
        "india" -> "India"
        else -> "Global"
      }

    val setRegionMethod =
      miPushClientClass.methods.firstOrNull { method ->
        method.name == "setRegion" && method.parameterTypes.size == 1
      } ?: return
    val enumClass = setRegionMethod.parameterTypes.firstOrNull() ?: return
    val enumConstants = enumClass.enumConstants ?: return
    val enumValue =
      enumConstants.firstOrNull { constant ->
        constant.toString().equals(normalizedRegion, ignoreCase = true)
      } ?: return
    setRegionMethod.invoke(null, enumValue)
  }

  companion object {
    private const val MODULE_NAME = "XiaomiPushBridge"
    private const val APP_ID_META_DATA = "mushroom.xiaomi.push.APP_ID"
    private const val APP_KEY_META_DATA = "mushroom.xiaomi.push.APP_KEY"
    private const val REGION_META_DATA = "mushroom.xiaomi.push.REGION"
  }
}

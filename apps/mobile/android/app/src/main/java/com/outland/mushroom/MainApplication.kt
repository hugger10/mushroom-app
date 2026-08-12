package com.outland.mushroom

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.livekit.reactnative.LiveKitReactNative
import com.livekit.reactnative.audio.AudioType
import com.outland.mushroom.call.CallConnectionPackage
import com.outland.mushroom.pip.PipPackage
import com.outland.mushroom.ringtone.RingtonePackage
import com.outland.mushroom.voice.VoiceRecorderPackage
import com.outland.mushroom.xiaomi.XiaomiPushPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(VoiceRecorderPackage())
          add(XiaomiPushPackage())
          add(PipPackage())
          add(RingtonePackage())
          add(CallConnectionPackage())
        },
    )
  }

  override fun onCreate() {
    // Must run before any other RN initialization so LiveKit/WebRTC can set up
    // its audio device module. CommunicationAudioType is used because the app
    // both publishes and consumes audio during calls.
    LiveKitReactNative.setup(this, AudioType.CommunicationAudioType())
    super.onCreate()
    loadReactNative(this)
  }
}

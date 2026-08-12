module.exports = {
  assets: ["../../node_modules/react-native-vector-icons/Fonts"],
  dependencies: {
    "react-native-audio-recorder-player": {
      platforms: {
        android: null
      }
    },
    "react-native-document-picker": {
      platforms: {
        android: null,
        ios: null
      }
    },
    // Android does not use CallKeep (incoming calls go through our Notifee
    // full-screen notification + CallOverlay pipeline; see
    // `system-call.ts`), so exclude its native code from the Android build.
    // iOS still autolinks CallKeep for CallKit.
    "react-native-callkeep": {
      platforms: {
        android: null
      }
    }
  }
};

package com.outland.mushroom.call

import com.facebook.react.bridge.ReactApplicationContext

/**
 * Holds the React context so the native [MeshConnectionService] (a system
 * component, not a RN module) can emit call events (answer/end) back to JS.
 * Populated once by [CallConnectionModule] on construction.
 */
object CallReactBridge {
  var reactContext: ReactApplicationContext? = null
}

import UIKit
import FirebaseCore
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import livekit_react_native

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Place LiveKit/WebRTC setup above any other RN initialization so its audio
    // session and WebRTC globals are ready before the bridge starts.
    LivekitReactNative.setup()

    if
      FirebaseApp.app() == nil,
      Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil
    {
      FirebaseApp.configure()
    } else if FirebaseApp.app() == nil {
      NSLog("[push] GoogleService-Info.plist is missing; skipping Firebase configuration.")
    }

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "Mesh",
      in: window,
      launchOptions: launchOptions
    )

    // Register PushKit (VoIP) so incoming calls can wake the app from a
    // killed/background state and synchronously report to CallKit. Must run
    // after the RN bridge starts so the event emitter can flush to JS.
    VoipPushManager.register()

    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

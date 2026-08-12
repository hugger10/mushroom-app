import Foundation
import PushKit
import CallKit
import React

/// Native bridge that wires iOS PushKit (VoIP) → CallKit → JS.
///
/// Why this exists:
///   A killed/background iOS app cannot be reliably woken by a normal
///   `content-available` data push, so the JS background handler never runs and
///   no incoming-call UI appears. Apple's only supported mechanism is a VoIP
///   push delivered via PushKit, and since iOS 13 the app **must** report a new
///   incoming call to CallKit *synchronously* inside
///   `didReceiveIncomingPushWith` or the system terminates the app.
///
/// Responsibilities:
///   1. Register a `PKPushRegistry` for the `.voIP` type on launch.
///   2. Forward the VoIP credential (token) to JS so it can be registered with
///      the server as `voip_token`.
///   3. On an incoming VoIP push, synchronously call CallKeep's
///      `reportNewIncomingCall` (the JS layer / CallKeep then drives answer /
///      decline), and surface the payload to JS via events.
///
/// CallKit answer/decline actions continue to be handled by `react-native-callkeep`
/// (RNCallKeep), which owns the `CXProvider`. We only originate the call report
/// here so it happens early enough to satisfy the OS constraint.
@objc(VoipPushManager)
class VoipPushManager: RCTEventEmitter, PKPushRegistryDelegate {

  private static var sharedInstance: VoipPushManager?
  private static var cachedToken: String?
  private static var pendingEvents: [(String, [String: Any])] = []
  private var hasListeners = false

  override init() {
    super.init()
    VoipPushManager.sharedInstance = self
  }

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }

  override func supportedEvents() -> [String]! {
    return ["voipTokenReceived", "voipPushReceived"]
  }

  override func startObserving() {
    hasListeners = true
    // Flush anything that arrived before JS subscribed (cold start via push).
    if let token = VoipPushManager.cachedToken {
      sendEvent(withName: "voipTokenReceived", body: ["token": token])
    }
    let pending = VoipPushManager.pendingEvents
    VoipPushManager.pendingEvents = []
    for (name, body) in pending {
      sendEvent(withName: name, body: body)
    }
  }

  override func stopObserving() {
    hasListeners = false
  }

  /// Called from AppDelegate at launch to register the PushKit registry.
  @objc static func register() {
    let registry = PKPushRegistry(queue: DispatchQueue.main)
    // Retain the registry for the app lifetime.
    PushRegistryHolder.shared.registry = registry
    registry.delegate = VoipPushManager.sharedInstance ?? VoipPushManager()
    registry.desiredPushTypes = [.voIP]
  }

  /// JS pull for the current token (covers the race where JS asks before the
  /// credential callback has fired).
  @objc func getToken(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(VoipPushManager.cachedToken)
  }

  private func emit(_ name: String, _ body: [String: Any]) {
    if hasListeners {
      sendEvent(withName: name, body: body)
    } else {
      VoipPushManager.pendingEvents.append((name, body))
    }
  }

  // MARK: - PKPushRegistryDelegate

  func pushRegistry(
    _ registry: PKPushRegistry,
    didUpdate pushCredentials: PKPushCredentials,
    for type: PKPushType
  ) {
    guard type == .voIP else { return }
    let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    VoipPushManager.cachedToken = token
    emit("voipTokenReceived", ["token": token])
  }

  func pushRegistry(
    _ registry: PKPushRegistry,
    didInvalidatePushTokenFor type: PKPushType
  ) {
    guard type == .voIP else { return }
    VoipPushManager.cachedToken = nil
    emit("voipTokenReceived", ["token": ""])
  }

  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }

    let data = payload.dictionaryPayload
    let callId = (data["call_id"] as? String) ?? UUID().uuidString
    let pushType = (data["type"] as? String) ?? "call.invite"

    // A `call.missed` VoIP push means the caller cancelled / the call timed out
    // before this device answered. It must DISMISS any ringing CallKit call, not
    // start a new one. iOS 13+ still requires that every VoIP push reports a
    // call synchronously, so we report then immediately end (a brief flash, the
    // same approach FaceTime uses for cancelled calls).
    if pushType == "call.missed" {
      RNCallKeep.reportNewIncomingCall(
        callId,
        handle: (data["conversation_id"] as? String) ?? "mushroom",
        handleType: "generic",
        hasVideo: false,
        localizedCallerName: (data["title"] as? String) ?? "Mushroom",
        supportsHolding: false,
        supportsDTMF: false,
        supportsGrouping: false,
        supportsUngrouping: false,
        fromPushKit: true,
        payload: data,
        withCompletionHandler: {
          RNCallKeep.endCall(withUUID: callId, reason: 2)
          completion()
        }
      )
      // Let JS converge on the normal missed-call cleanup (clear notification +
      // endSystemCall) so in-memory state stays consistent.
      emit("voipPushReceived", normalizedPayload(from: data))
      return
    }

    let callerName =
      (data["conversation_name"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        ?? (data["title"] as? String)
        ?? "Mushroom"
    let conversationId = (data["conversation_id"] as? String) ?? "mushroom"
    let mediaType = Int((data["media_type"] as? String) ?? "1") ?? 1
    let hasVideo = mediaType == 2

    // MUST happen synchronously here. Hand off to RNCallKeep (Objective-C class
    // method) which owns the CXProvider so answer/decline routes back to JS.
    RNCallKeep.reportNewIncomingCall(
      callId,
      handle: conversationId,
      handleType: "generic",
      hasVideo: hasVideo,
      localizedCallerName: callerName,
      supportsHolding: false,
      supportsDTMF: false,
      supportsGrouping: false,
      supportsUngrouping: false,
      fromPushKit: true,
      payload: data,
      withCompletionHandler: {
        completion()
      }
    )

    // Surface the payload to JS so it can connect WebRTC once the user answers.
    emit("voipPushReceived", normalizedPayload(from: data))
  }

  private func normalizedPayload(from data: [AnyHashable: Any]) -> [String: Any] {
    var result: [String: Any] = [:]
    for (key, value) in data {
      if let stringKey = key as? String {
        result[stringKey] = value
      }
    }
    return result
  }
}

/// Strong reference holder so the PKPushRegistry isn't deallocated.
private final class PushRegistryHolder {
  static let shared = PushRegistryHolder()
  var registry: PKPushRegistry?
}

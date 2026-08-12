import Foundation
import React

/// Native bridge for the message notification sound system (sound.md §5.2-A).
///
/// Responsibilities:
///   1. `getSystemTones` — return the 17 iOS system alert tones that actually
///      exist on this device (`/System/Library/Audio/UISounds/New/`). On the
///      simulator this list is empty (the audio files are device-only).
///   2. `setTone` — copy the selected tone into the app sandbox under the
///      fixed filename `Library/Sounds/currentAlert.*`, and write the shared
///      `NotificationToneState.json` into the App Group container so the
///      Notification Service Extension can honour the selection in
///      background/lock-screen delivery.
///   3. `checkToneFile` — whether the fixed sandbox file exists (used for the
///      reinstall-fallback check in JS).
///
/// Why the fixed-filename copy (aligned with element-x-ios currentAlert.caf):
/// iOS `UNNotificationSound(named:)` can only reference files inside the app
/// container, so system tones must be copied into `Library/Sounds/` and all
/// display paths reference the fixed name — switching tones only overwrites
/// the file, no notification code changes.
@objc(AlertToneManager)
class AlertToneManager: NSObject {

  private static let appGroupId = "group.com.outland.mushroom"
  private static let systemTonesRoot = "/System/Library/Audio/UISounds/New/"
  private static let systemToneNames = [
    "Bloom", "Calypso", "Anticipate", "Choo_Choo", "Descent", "Fanfare",
    "Ladder", "Minuet", "News_Flash", "Noir", "Sherwood_Forest", "Spell",
    "Suspense", "Telegraph", "Tiptoes", "Typewriters", "Update"
  ]

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  /// Return the system tones available on this device (name only, no path).
  @objc func getSystemTones(_ resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
    let available = AlertToneManager.systemToneNames.filter { name in
      FileManager.default.fileExists(
        atPath: "\(AlertToneManager.systemTonesRoot)\(name).caf"
      )
    }
    resolve(available)
  }

  /// Copy the selected tone to `Library/Sounds/<filename>` and refresh the
  /// shared NSE state file (`state` = "default" | "silent" | filename).
  /// Empty `source` means "default / silent" → no copy, only the state file is
  /// updated.
  @objc func setTone(_ source: String,
                     filename: String,
                     state: String,
                     resolver resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      try copyToneIfNeeded(source: source, filename: filename)
      try writeSharedState(sound: state)
      resolve(nil)
    } catch {
      reject("ERR_SET_TONE", error.localizedDescription, error)
    }
  }

  /// Whether `Library/Sounds/<filename>` currently exists.
  @objc func checkToneFile(_ filename: String,
                           resolver resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(existsInSoundsDir(filename))
  }

  // MARK: - Internal

  private func copyToneIfNeeded(source: String, filename: String) throws {
    guard !source.isEmpty, !filename.isEmpty else {
      return // default / silent — nothing to copy
    }

    guard let sourceUrl = resolveSourceUrl(source) else {
      throw NSError(
        domain: "AlertToneManager",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Unknown tone source: \(source)"]
      )
    }

    let soundsDir = try soundsDirectory()
    let destinationUrl = soundsDir.appendingPathComponent(filename)
    if FileManager.default.fileExists(atPath: destinationUrl.path) {
      try FileManager.default.removeItem(at: destinationUrl)
    }
    try FileManager.default.copyItem(at: sourceUrl, to: destinationUrl)
  }

  private func resolveSourceUrl(_ source: String) -> URL? {
    if source == "message" || source == "fade" {
      return Bundle.main.url(forResource: source, withExtension: "wav")
    }
    if source.hasPrefix("system:") {
      let name = String(source.dropFirst("system:".count))
      return URL(fileURLWithPath: "\(AlertToneManager.systemTonesRoot)\(name).caf")
    }
    return nil
  }

  private func soundsDirectory() throws -> URL {
    let library = FileManager.default.urls(
      for: .libraryDirectory, in: .userDomainMask
    )[0]
    let soundsDir = library.appendingPathComponent("Sounds")
    if !FileManager.default.fileExists(atPath: soundsDir.path) {
      try FileManager.default.createDirectory(
        at: soundsDir,
        withIntermediateDirectories: true
      )
    }
    return soundsDir
  }

  private func existsInSoundsDir(_ filename: String) -> Bool {
    guard let soundsDir = try? soundsDirectory() else {
      return false
    }
    return FileManager.default.fileExists(
      atPath: soundsDir.appendingPathComponent(filename).path
    )
  }

  /// Write `{ "sound": <state> }` into the App Group container.
  private func writeSharedState(sound: String) throws {
    guard let container = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: AlertToneManager.appGroupId
    ) else {
      throw NSError(
        domain: "AlertToneManager",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey:
          "App Group container unavailable: \(AlertToneManager.appGroupId)"]
      )
    }
    let stateUrl = container.appendingPathComponent("NotificationToneState.json")
    let payload = ["sound": sound]
    let data = try JSONSerialization.data(withJSONObject: payload)
    try data.write(to: stateUrl, options: [.atomic])
  }
}

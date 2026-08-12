import UserNotifications

/// Notification Service Extension (sound.md §5.2-A②).
///
/// The main app writes its message-sound preference to the App Group shared
/// file `NotificationToneState.json`; this extension reads it when a push with
/// `mutable-content` arrives and overrides `content.sound` so the chosen tone
/// plays on the lock screen / background even when the app is killed.
class NotificationService: UNNotificationServiceExtension {

  private static let appGroupId = "group.com.outland.mushroom"

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    var content = request.content

    if let sound = readSharedSound() {
      switch sound {
      case "silent":
        content.sound = nil
      case "default":
        content.sound = UNNotificationSound.defaultSound
      default:
        // File name (e.g. currentAlert.wav) resolved from the main app
        // container Library/Sounds/ — element-x production verifies this chain.
        content.sound = UNNotificationSound(
          named: UNNotificationSoundName(sound)
        )
      }
    }

    // Title/body pass through the server-provided alert untouched.
    contentHandler(content)
  }

  override func serviceExtensionTimeWillExpire() {
    // The system delivers the original content unchanged when we run out of time.
  }

  private func readSharedSound() -> String? {
    guard let container = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: Self.appGroupId
    ) else {
      return nil
    }
    let stateUrl = container.appendingPathComponent("NotificationToneState.json")
    guard
      let data = try? Data(contentsOf: stateUrl),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let sound = json["sound"] as? String,
      !sound.isEmpty
    else {
      return nil
    }
    return sound
  }
}

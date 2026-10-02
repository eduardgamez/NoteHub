import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        ReminderStore.canCreateActivity = { UIApplication.shared.applicationState == .active }
        ReminderStore.beginActivityUpdate = {
            var identifier = UIBackgroundTaskIdentifier.invalid
            let finish = {
                if identifier != .invalid {
                    UIApplication.shared.endBackgroundTask(identifier)
                    identifier = .invalid
                }
            }
            identifier = UIApplication.shared.beginBackgroundTask(withName: "Update reminder activity", expirationHandler: finish)
            return finish
        }
        return true
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) { completionHandler([.banner, .sound, .list]) }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        guard let id = response.notification.request.content.userInfo["targetId"] as? String else { completionHandler(); return }
        Task { @MainActor in
            if response.actionIdentifier == UNNotificationDefaultActionIdentifier {
                ReminderStore.navigationRequest = .init(targetId: id)
                NotificationCenter.default.post(name: Notification.Name("NoteHubNotificationOpened"), object: nil)
            } else if response.actionIdentifier == UNNotificationDismissActionIdentifier,
                      let due = response.notification.request.content.userInfo["due"] as? Double {
                await ReminderStore.dismissNotification(id: id, due: due)
            } else if response.actionIdentifier == "delete" { await ReminderStore.change(id: id, delete: true) }
            else if response.actionIdentifier.hasPrefix("check:") { await ReminderStore.change(id: id, itemId: String(response.actionIdentifier.dropFirst(6)), done: true) }
            NotificationCenter.default.post(name: Notification.Name("NoteHubActionsChanged"), object: nil)
            completionHandler()
        }
    }
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

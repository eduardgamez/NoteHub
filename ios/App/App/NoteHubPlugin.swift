import Capacitor
import UserNotifications
import ActivityKit
import UIKit
import Security

@objc(NoteHubPlugin)
public class NoteHubPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NoteHubPlugin"
    public let jsName = "NoteHubNative"
    public let pluginMethods: [CAPPluginMethod] = ["permission", "openSettings", "sync", "refreshActivity", "pendingActions", "acknowledge", "pendingNavigation", "acknowledgeNavigation", "authGet", "authSet", "authRemove", "keyboardLock"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }

    private func authQuery(_ call: CAPPluginCall) -> [String: Any]? {
        guard let key = call.getString("key"), key.hasPrefix("sb-"), key.contains("-auth-token") else {
            call.reject("Invalid session storage key"); return nil
        }
        return [kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: "com.eduardgamez.notehub.auth",
                kSecAttrAccount as String: key]
    }
    @objc func authGet(_ call: CAPPluginCall) {
        guard var query = authQuery(call) else { return }
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { call.resolve([:]); return }
        guard status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
            call.reject("Could not read saved session (\(status))"); return
        }
        call.resolve(["value": value])
    }
    @objc func authSet(_ call: CAPPluginCall) {
        guard var query = authQuery(call) else { return }
        guard let value = call.getString("value"), let data = value.data(using: .utf8) else { call.reject("Invalid session"); return }
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            query.merge(attributes) { _, new in new }
            status = SecItemAdd(query as CFDictionary, nil)
        }
        guard status == errSecSuccess else { call.reject("Could not save session (\(status))"); return }
        call.resolve()
    }
    @objc func authRemove(_ call: CAPPluginCall) {
        guard let query = authQuery(call) else { return }
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { call.reject("Could not remove session (\(status))"); return }
        call.resolve()
    }

    // While writing in a document the web layer moves the blocks above the keyboard itself.
    @objc func keyboardLock(_ call: CAPPluginCall) {
        let locked = call.getBool("locked") ?? false
        DispatchQueue.main.async {
            NoteHubViewController.keepsPagePinned = locked
            if locked { self.bridge?.webView?.scrollView.contentOffset = .zero }
        }
        call.resolve()
    }

    private var navigationObserver: NSObjectProtocol?
    private var permissionObserver: NSObjectProtocol?
    private var actionsObserver: NSObjectProtocol?
    public override func load() {
        // A tick on the widget reaches the open app at once instead of on its next poll.
        actionsObserver = NotificationCenter.default.addObserver(forName: Notification.Name("NoteHubActionsChanged"), object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("actionsChanged", data: [:])
        }
        navigationObserver = NotificationCenter.default.addObserver(forName: Notification.Name("NoteHubNotificationOpened"), object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("notificationOpened", data: [:])
        }
        permissionObserver = NotificationCenter.default.addObserver(forName: NotificationPermission.changed, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("permissionChanged", data: [:])
        }
    }
    deinit {
        if let navigationObserver { NotificationCenter.default.removeObserver(navigationObserver) }
        if let permissionObserver { NotificationCenter.default.removeObserver(permissionObserver) }
        if let actionsObserver { NotificationCenter.default.removeObserver(actionsObserver) }
    }
    @objc func pendingNavigation(_ call: CAPPluginCall) { Task { @MainActor in
        if let request = ReminderStore.navigationRequest {
            call.resolve(["navigation": ["id": request.id, "targetId": request.targetId]])
        } else { call.resolve([:]) }
    } }
    @objc func acknowledgeNavigation(_ call: CAPPluginCall) { Task { @MainActor in
        if ReminderStore.navigationRequest?.id == call.getString("id") { ReminderStore.navigationRequest = nil }
        call.resolve()
    } }
    @objc func permission(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        if call.getBool("request") == true {
            center.requestAuthorization(options: [.alert, .sound, .badge]) { _, error in
                if let error { call.reject(error.localizedDescription); return }
                center.getNotificationSettings { call.resolve(["enabled": $0.authorizationStatus == .authorized || $0.authorizationStatus == .provisional]) }
            }
        } else { center.getNotificationSettings { call.resolve(["enabled": $0.authorizationStatus == .authorized || $0.authorizationStatus == .provisional]) } }
    }
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async { NotificationPermission.openSettings(); call.resolve() }
    }
    @objc func sync(_ call: CAPPluginCall) {
        guard let raw = call.getArray("items") else { call.reject("Datos de calendario inválidos"); return }
        // Decode each entry separately: one malformed item must not cancel every other notice.
        let items = raw.compactMap { entry in
            (try? JSONSerialization.data(withJSONObject: entry)).flatMap { try? JSONDecoder().decode(ReminderItem.self, from: $0) }
        }
        Task { @MainActor in
            // Native actions remain authoritative until the web has persisted and acknowledged them.
            var next = items
            for action in ReminderStore.actions {
                if action.kind == "delete" { next.removeAll { $0.id == action.targetId } }
                else if let index = next.firstIndex(where: { $0.id == action.targetId }), let task = next[index].checklist.firstIndex(where: { $0.id == action.itemId }), let done = action.done { next[index].checklist[task].done = done }
            }
            ReminderStore.items = next
            await ReminderStore.syncActivities(allowCreation: UIApplication.shared.applicationState == .active)
            let center = UNUserNotificationCenter.current()
            center.getPendingNotificationRequests { pending in
                center.removePendingNotificationRequests(withIdentifiers: pending.filter { $0.identifier.hasPrefix("task:") || $0.identifier.hasPrefix("event:") }.map(\.identifier))
                let upcoming = next.filter { $0.due > Date().timeIntervalSince1970 }.sorted { $0.due < $1.due }.prefix(60)
                var categories = next.filter { $0.kind == "event" }.map { item in
                    var actions = item.checklist.filter { !$0.done }.prefix(3).map { UNNotificationAction(identifier: "check:\($0.id)", title: "✓ \($0.text)", options: []) }
                    actions.append(UNNotificationAction(identifier: "delete", title: "Borrar", options: .destructive))
                    return UNNotificationCategory(identifier: item.id, actions: actions, intentIdentifiers: [])
                }
                categories.append(UNNotificationCategory(identifier: "notehub-reminder", actions: [], intentIdentifiers: [], options: .customDismissAction))
                center.setNotificationCategories(Set(categories))
                for item in upcoming {
                    let content = ReminderStore.notificationContent(for: item)
                    let date = Date(timeIntervalSince1970: item.due)
                    // Pin the time zone so the notice fires at the saved instant even after travelling or a zone change.
                    let components = Calendar.current.dateComponents([.timeZone, .year, .month, .day, .hour, .minute, .second], from: date)
                    center.add(UNNotificationRequest(identifier: item.id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false))) { error in
                        if let error { NSLog("NoteHub: could not schedule %@: %@", item.id, error.localizedDescription) }
                    }
                }
                // Notices for items deleted elsewhere would otherwise linger in Notification Center and open nothing.
                let known = Set(next.map(\.id))
                center.getDeliveredNotifications { delivered in
                    center.removeDeliveredNotifications(withIdentifiers: delivered.map(\.request.identifier).filter { ($0.hasPrefix("task:") || $0.hasPrefix("event:")) && !known.contains($0) })
                }
                call.resolve(["scheduled": upcoming.count])
            }
        }
    }
    @objc func refreshActivity(_ call: CAPPluginCall) { Task { @MainActor in
        await ReminderStore.syncActivities(allowCreation: UIApplication.shared.applicationState == .active)
        call.resolve()
    } }
    @objc func pendingActions(_ call: CAPPluginCall) { Task { @MainActor in
        let data = try? JSONEncoder().encode(ReminderStore.actions)
        call.resolve(["actions": (data.flatMap { try? JSONSerialization.jsonObject(with: $0) }) ?? []])
    } }
    @objc func acknowledge(_ call: CAPPluginCall) { Task { @MainActor in
        let ids = Set(call.getArray("ids", String.self) ?? [])
        ReminderStore.actions.removeAll { ids.contains($0.id) }
        call.resolve()
    } }

}
// Notifications are always on from the app's side; the only switch is iOS Settings.
enum NotificationPermission {
    static let changed = Notification.Name("NoteHubNotificationPermissionChanged")
    private static var alertShown = false
    static func openSettings() {
        let target: String
        if #available(iOS 16.0, *) { target = UIApplication.openNotificationSettingsURLString } else { target = UIApplication.openSettingsURLString }
        if let url = URL(string: target) { UIApplication.shared.open(url) }
    }
    // Runs natively each time the app becomes active, so it does not depend on the web layer having loaded.
    static func check(presentingFrom window: UIWindow?) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
                    DispatchQueue.main.async { NotificationCenter.default.post(name: changed, object: nil) }
                }
            case .denied:
                DispatchQueue.main.async {
                    // iOS shows its own prompt only once; after a denial the user has to be sent to Settings.
                    guard !alertShown, var presenter = window?.rootViewController else { return }
                    while let next = presenter.presentedViewController { presenter = next }
                    if presenter is UIAlertController { return }
                    alertShown = true
                    let alert = UIAlertController(title: "Activa las notificaciones", message: "NoteHub necesita las notificaciones para avisarte de tus recordatorios y eventos. Actívalas en Ajustes del iPhone.", preferredStyle: .alert)
                    alert.addAction(UIAlertAction(title: "Ahora no", style: .cancel) { _ in alertShown = false })
                    alert.addAction(UIAlertAction(title: "Abrir Ajustes", style: .default) { _ in alertShown = false; openSettings() })
                    presenter.present(alert, animated: true)
                }
            default:
                DispatchQueue.main.async { NotificationCenter.default.post(name: changed, object: nil) }
            }
        }
    }
}
class NoteHubViewController: CAPBridgeViewController {
    // iOS scrolls the whole page up to reveal a focused field, dragging the toolbars and buttons with it.
    static var keepsPagePinned = false
    private var offsetObservation: NSKeyValueObservation?

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NoteHubPlugin())
        hideFormAccessoryBar()
        offsetObservation = webView?.scrollView.observe(\.contentOffset) { scrollView, _ in
            if NoteHubViewController.keepsPagePinned && scrollView.contentOffset != .zero { scrollView.contentOffset = .zero }
        }
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardWillChangeFrame(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
    }

    // The ^ v ✓ bar WebKit puts above the keyboard only pushes the field away from it.
    private func hideFormAccessoryBar() {
        guard let content = webView?.scrollView.subviews.first(where: { String(describing: type(of: $0)).hasPrefix("WKContent") }) else { return }
        let base: AnyClass = type(of: content)
        let name = "\(NSStringFromClass(base))_NoteHubNoAccessory"
        if base == NSClassFromString(name) { return }
        var subclass: AnyClass? = NSClassFromString(name)
        if subclass == nil, let created = objc_allocateClassPair(base, name, 0), let method = class_getInstanceMethod(UIView.self, #selector(getter: UIResponder.inputAccessoryView)) {
            let noBar: @convention(block) (AnyObject) -> UIView? = { _ in nil }
            class_addMethod(created, #selector(getter: UIResponder.inputAccessoryView), imp_implementationWithBlock(noBar), method_getTypeEncoding(method))
            objc_registerClassPair(created)
            subclass = created
        }
        if let subclass { object_setClass(content, subclass) }
    }

    @objc private func keyboardWillChangeFrame(_ notification: Notification) {
        guard let webView, let frame = (notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue else { return }
        let keyboard = webView.convert(frame, from: nil)
        let height = max(0, webView.bounds.maxY - keyboard.minY)
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('notehub-keyboard', { detail: { height: \(Int(height.rounded())) } }))")
    }
}

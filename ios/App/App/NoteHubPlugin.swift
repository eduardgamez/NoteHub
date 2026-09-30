import Capacitor
import UserNotifications
import ActivityKit

@objc(NoteHubPlugin)
public class NoteHubPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NoteHubPlugin"
    public let jsName = "NoteHubNative"
    public let pluginMethods: [CAPPluginMethod] = ["permission", "sync", "pendingActions", "acknowledge", "showReminder"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }

    @objc func permission(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        if call.getBool("request") == true {
            center.requestAuthorization(options: [.alert, .sound, .badge]) { _, error in
                if let error { call.reject(error.localizedDescription); return }
                center.getNotificationSettings { call.resolve(["enabled": $0.authorizationStatus == .authorized || $0.authorizationStatus == .provisional]) }
            }
        } else { center.getNotificationSettings { call.resolve(["enabled": $0.authorizationStatus == .authorized || $0.authorizationStatus == .provisional]) } }
    }
    @objc func sync(_ call: CAPPluginCall) {
        guard let raw = call.getArray("items"), let data = try? JSONSerialization.data(withJSONObject: raw), let items = try? JSONDecoder().decode([ReminderItem].self, from: data) else { call.reject("Datos de calendario inválidos"); return }
        Task { @MainActor in
            // Native actions remain authoritative until the web has persisted and acknowledged them.
            var next = items
            for action in ReminderStore.actions {
                if action.kind == "delete" { next.removeAll { $0.id == action.targetId } }
                else if let index = next.firstIndex(where: { $0.id == action.targetId }), let task = next[index].checklist.firstIndex(where: { $0.id == action.itemId }), let done = action.done { next[index].checklist[task].done = done }
            }
            ReminderStore.items = next
            await ReminderStore.updateActivities()
            let center = UNUserNotificationCenter.current()
            center.getPendingNotificationRequests { pending in
                center.removePendingNotificationRequests(withIdentifiers: pending.filter { $0.identifier.hasPrefix("task:") || $0.identifier.hasPrefix("event:") }.map(\.identifier))
                let upcoming = next.filter { $0.due > Date().timeIntervalSince1970 }.sorted { $0.due < $1.due }.prefix(60)
                let categories = next.map { item in
                    var actions = item.checklist.filter { !$0.done }.prefix(3).map { UNNotificationAction(identifier: "check:\($0.id)", title: "✓ \($0.text)", options: []) }
                    actions.append(UNNotificationAction(identifier: "delete", title: "Borrar", options: .destructive))
                    return UNNotificationCategory(identifier: item.id, actions: actions, intentIdentifiers: [])
                }
                center.setNotificationCategories(Set(categories))
                for item in upcoming {
                    let content = UNMutableNotificationContent()
                    content.title = item.title
                    content.body = item.checklist.filter { !$0.done }.prefix(3).map(\.text).joined(separator: " · ")
                    if content.body.isEmpty { content.body = item.kind == "event" ? "Tu evento empieza ahora" : "Recordatorio de NoteHub" }
                    content.sound = .default; content.categoryIdentifier = item.id
                    content.userInfo = ["targetId": item.id]
                    let date = Date(timeIntervalSince1970: item.due)
                    let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
                    center.add(UNNotificationRequest(identifier: item.id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)))
                }
                call.resolve(["scheduled": upcoming.count])
            }
        }
    }
    @objc func pendingActions(_ call: CAPPluginCall) { Task { @MainActor in
        let data = try? JSONEncoder().encode(ReminderStore.actions)
        call.resolve(["actions": (data.flatMap { try? JSONSerialization.jsonObject(with: $0) }) ?? []])
    } }
    @objc func acknowledge(_ call: CAPPluginCall) { Task { @MainActor in
        let ids = Set(call.getArray("ids", String.self) ?? [])
        ReminderStore.actions.removeAll { ids.contains($0.id) }
        call.resolve()
    } }
    @objc func showReminder(_ call: CAPPluginCall) { Task { @MainActor in
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.reject("Activa Actividades en directo en los ajustes de NoteHub del iPhone."); return }
        guard let id = call.getString("id"), let item = ReminderStore.items.first(where: { $0.id == id }) else { call.reject("Este recordatorio ya no existe."); return }
        if Activity<ReminderAttributes>.activities.contains(where: { $0.attributes.id == id }) { call.resolve(); return }
        do {
            _ = try Activity<ReminderAttributes>.request(attributes: .init(id: id), content: ActivityContent(state: .init(title: item.title, checklist: Array(item.checklist.prefix(8))), staleDate: nil), pushType: nil)
            call.resolve()
        } catch { call.reject(error.localizedDescription) }
    } }
}
class NoteHubViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(NoteHubPlugin()) }
}

import Foundation
import ActivityKit
import AppIntents
import UserNotifications

struct ReminderItem: Codable, Hashable, Identifiable {
    var id: String
    var title: String
    var kind: String
    var due: Double
    var checklist: [ReminderTask]
}
struct ReminderTask: Codable, Hashable, Identifiable { var id: String; var text: String; var done: Bool }
struct ReminderAction: Codable { var id = UUID().uuidString; var targetId: String; var kind: String; var itemId: String?; var done: Bool? }
struct ReminderAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable { var title: String; var checklist: [ReminderTask] }
    var id: String
}

@MainActor enum ReminderStore {
    static var items: [ReminderItem] {
        get { decode("reminders", as: [ReminderItem].self) ?? [] }
        set { encode(newValue, key: "reminders") }
    }
    static var actions: [ReminderAction] {
        get { decode("actions", as: [ReminderAction].self) ?? [] }
        set { encode(newValue, key: "actions") }
    }
    static func decode<T: Decodable>(_ key: String, as: T.Type) -> T? {
        guard let data = UserDefaults.standard.data(forKey: "notehub.\(key)") else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
    static func encode<T: Encodable>(_ value: T, key: String) { if let data = try? JSONEncoder().encode(value) { UserDefaults.standard.set(data, forKey: "notehub.\(key)") } }
    static func change(id: String, itemId: String? = nil, delete: Bool = false, done: Bool? = nil) async {
        var current = items
        guard let index = current.firstIndex(where: { $0.id == id }) else { return }
        if delete {
            actions.append(ReminderAction(targetId: id, kind: "delete"))
            current.remove(at: index)
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id])
            UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [id])
        } else if let itemId, let task = current[index].checklist.firstIndex(where: { $0.id == itemId }) {
            let nextDone = done ?? !current[index].checklist[task].done
            guard current[index].checklist[task].done != nextDone else { return }
            current[index].checklist[task].done = nextDone
            actions.append(ReminderAction(targetId: id, kind: "check", itemId: itemId, done: current[index].checklist[task].done))
        }
        items = current
        await updateActivities()
    }
    static func updateActivities() async {
        for activity in Activity<ReminderAttributes>.activities {
            if let item = items.first(where: { $0.id == activity.attributes.id }) {
                await activity.update(ActivityContent(state: .init(title: item.title, checklist: Array(item.checklist.prefix(8))), staleDate: nil))
            } else { await activity.end(nil, dismissalPolicy: .immediate) }
        }
    }
}

struct CheckReminderIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Marcar tarea"
    @Parameter(title: "Recordatorio") var reminderId: String
    @Parameter(title: "Tarea") var taskId: String
    init() {}
    init(reminderId: String, taskId: String) { self.reminderId = reminderId; self.taskId = taskId }
    func perform() async throws -> some IntentResult { await ReminderStore.change(id: reminderId, itemId: taskId); return .result() }
}
struct DeleteReminderIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Borrar recordatorio"
    @Parameter(title: "Recordatorio") var reminderId: String
    init() {}
    init(reminderId: String) { self.reminderId = reminderId }
    func perform() async throws -> some IntentResult { await ReminderStore.change(id: reminderId, delete: true); return .result() }
}

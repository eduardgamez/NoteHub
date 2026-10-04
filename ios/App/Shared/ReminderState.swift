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
    var end: Double? = nil
}
struct ReminderTask: Codable, Hashable, Identifiable { var id: String; var text: String; var done: Bool }
struct ReminderAction: Codable { var id = UUID().uuidString; var targetId: String; var kind: String; var itemId: String?; var done: Bool? }
struct ReminderAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable { var title: String; var checklist: [ReminderTask]; var kind: String? = nil; var targetId: String? = nil; var due: Double? = nil; var end: Double? = nil }
    var id: String
}

@MainActor enum ReminderStore {
    static var canCreateActivity: () -> Bool = { false }
    // The app supplies a background execution lease; the widget extension never uses UIApplication.
    static var beginActivityUpdate: () -> (() -> Void) = { {} }
    private static var activityUpdateTask: Task<Void, Never>?
    private static func scheduleActivityUpdate() {
        if activityUpdateTask != nil { refreshAgain = true; return }
        let finish = beginActivityUpdate()
        activityUpdateTask = Task { @MainActor in
            defer { activityUpdateTask = nil; finish() }
            await updateActivities()
        }
    }
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
    static func change(id: String, itemId: String? = nil, delete: Bool = false, done: Bool? = nil, waitForActivity: Bool = true) async {
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
        if waitForActivity { await updateActivities() }
        else { scheduleActivityUpdate() }
    }
    struct NavigationRequest: Codable { var id = UUID().uuidString; var targetId: String }
    static var navigationRequest: NavigationRequest? {
        get { decode("notificationNavigation", as: NavigationRequest.self) }
        set { encode(newValue, key: "notificationNavigation") }
    }
    nonisolated static func notificationContent(for item: ReminderItem) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        // iOS does not show a notice with neither title nor body.
        let title = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
        content.title = title.isEmpty ? (item.kind == "event" ? "Evento" : "Recordatorio") : item.title
        content.sound = .default
        content.userInfo = ["targetId": item.id, "due": item.due]
        if item.kind == "event" {
            content.body = item.checklist.filter { !$0.done }.prefix(3).map(\.text).joined(separator: " · ")
            if content.body.isEmpty { content.body = "Tu evento empieza ahora" }
            content.categoryIdentifier = item.id
        } else {
            content.categoryIdentifier = "notehub-reminder"
        }
        return content
    }
    struct Presentation: Codable { var targetId: String; var due: Double; var activityId: String }
    // Events and reminders live in separate activities: iOS can start a scheduled reminder on top of an
    // ongoing event without the app running, and swiping the reminder away leaves the event underneath.
    enum Slot: String, CaseIterable { case event = "notehub-event", reminder = "notehub-reminder" }
    static var dismissed: [String: Double] {
        get { decode("dismissedActivities", as: [String: Double].self) ?? [:] }
        set { encode(newValue, key: "dismissedActivities") }
    }
    static var presentations: [String: Presentation] {
        get { decode("activityPresentations", as: [String: Presentation].self) ?? [:] }
        set { encode(newValue, key: "activityPresentations") }
    }
    static var enabledAt: Double {
        get {
            if let value = decode("activitiesEnabledAt", as: Double.self) { return value }
            let value = Date().timeIntervalSince1970
            encode(value, key: "activitiesEnabledAt")
            return value
        }
        set { encode(newValue, key: "activitiesEnabledAt") }
    }
    // Only reminders that have become due since enabling the feature join the queue.
    // Dismissal is tied to the due date so moving an item to a new time enables it again.
    static func dueReminder(now: Double) -> ReminderItem? {
        let activatedAt = enabledAt
        return items.filter { $0.kind == "task" && dismissed[$0.id] != $0.due && $0.due <= now && $0.due >= activatedAt }
            .sorted { $0.due > $1.due }.first
    }
    static func ongoingEvent(now: Double) -> ReminderItem? {
        items.filter { $0.kind == "event" && dismissed[$0.id] != $0.due && $0.due <= now && ($0.end ?? $0.due) > now }
            .sorted { $0.due > $1.due }.first
    }
    // The item in front: a due reminder covers the ongoing event.
    static func visibleItem(now: Double) -> ReminderItem? { dueReminder(now: now) ?? ongoingEvent(now: now) }
    static func visibleItem(in slot: Slot, now: Double) -> ReminderItem? {
        slot == .event ? ongoingEvent(now: now) : dueReminder(now: now)
    }
    static func upcomingItem(in slot: Slot, now: Double) -> ReminderItem? {
        items.filter { $0.due > now && dismissed[$0.id] != $0.due &&
            (slot == .event ? $0.kind == "event" && ($0.end ?? $0.due) > $0.due : $0.kind == "task") }
            .sorted { $0.due < $1.due }.first
    }
    static func content(for item: ReminderItem) -> ActivityContent<ReminderAttributes.ContentState> {
        // A higher score keeps the reminder above the event on the Lock Screen and in the Dynamic Island.
        ActivityContent(state: .init(title: item.title, checklist: Array(item.checklist.prefix(8)), kind: item.kind,
                                    targetId: item.id, due: item.due, end: item.end),
                        staleDate: item.end.map { Date(timeIntervalSince1970: $0) },
                        relevanceScore: item.kind == "event" ? 50 : 100)
    }
    static func dismiss(id: String, due: Double) async {
        dismissed[id] = due
        // A LiveActivityIntent can update the activities without opening the app.
        await syncActivities(allowCreation: true)
    }
    static func dismissNotification(id: String, due: Double) async {
        guard items.contains(where: { $0.id == id && $0.kind == "task" && $0.due == due }) else { return }
        dismissed[id] = due
        // Updating an existing activity also works during a background notification callback.
        await syncActivities(allowCreation: canCreateActivity())
    }
    private static var syncing = false
    private static var refreshAgain = false
    private static var queuedCreation = false
    static func syncActivities(allowCreation: Bool = true, now: Double = Date().timeIntervalSince1970) async {
        if syncing { refreshAgain = true; queuedCreation = queuedCreation || allowCreation; return }
        syncing = true
        defer { syncing = false }
        var canCreate = allowCreation
        repeat {
            refreshAgain = false
            queuedCreation = false
            let all = Activity<ReminderAttributes>.activities
            // Retire activities from earlier implementations (per-reminder and the single shared agenda).
            for activity in all where Slot(rawValue: activity.attributes.id) == nil {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            for slot in Slot.allCases { await reconcile(slot, all: all, allowCreation: canCreate, now: now) }
            canCreate = canCreate || queuedCreation
        } while refreshAgain
    }
    private static func isLive(_ activity: Activity<ReminderAttributes>) -> Bool {
        activity.activityState != .dismissed && activity.activityState != .ended
    }
    private static func reconcile(_ slot: Slot, all: [Activity<ReminderAttributes>], allowCreation: Bool, now: Double) async {
        // A widget the user swiped away never comes back. iOS may drop it from the list while the app is
        // closed, so a started activity that has vanished counts as dismissed too.
        if let previous = presentations[slot.rawValue], !all.contains(where: { $0.id == previous.activityId && isLive($0) }) {
            if all.contains(where: { $0.id == previous.activityId && $0.activityState == .dismissed })
                || (!all.contains(where: { $0.id == previous.activityId }) && previous.due <= now) {
                dismissed[previous.targetId] = previous.due
            }
            presentations[slot.rawValue] = nil
        }
        let mine = all.filter { $0.attributes.id == slot.rawValue && isLive($0) }
        var current = mine.first { $0.id == presentations[slot.rawValue]?.activityId } ?? mine.first
        for extra in mine where extra.id != current?.id { await extra.end(nil, dismissalPolicy: .immediate) }
        let visible = visibleItem(in: slot, now: now)
        var next = visible
        if next == nil, #available(iOS 26.0, *) { next = upcomingItem(in: slot, now: now) }
        guard let item = next else {
            presentations[slot.rawValue] = nil
            if let current { await current.end(nil, dismissalPolicy: .immediate) }
            return
        }
        if #available(iOS 26.0, *), let scheduled = current, scheduled.activityState == .pending {
            // The scheduled date cannot be changed by an update: cancel and reschedule.
            if visible != nil || scheduled.content.state.targetId != item.id || scheduled.content.state.due != item.due {
                presentations[slot.rawValue] = nil
                await scheduled.end(nil, dismissalPolicy: .immediate)
                current = nil
            }
        } else if visible == nil, let active = current {
            presentations[slot.rawValue] = nil
            await active.end(nil, dismissalPolicy: .immediate)
            current = nil
        }
        let value = content(for: item)
        if let current {
            observeDismissal(of: current)
            await current.update(value)
            presentations[slot.rawValue] = .init(targetId: item.id, due: item.due, activityId: current.id)
        } else if allowCreation && ActivityAuthorizationInfo().areActivitiesEnabled {
            do {
                let activity: Activity<ReminderAttributes>
                if item.due > now {
                    guard #available(iOS 26.0, *) else { return }
                    activity = try Activity.request(attributes: .init(id: slot.rawValue), content: value, pushType: nil, style: .standard,
                        alertConfiguration: .init(title: "\(item.title)", body: "", sound: .default), start: Date(timeIntervalSince1970: item.due))
                } else {
                    activity = try Activity.request(attributes: .init(id: slot.rawValue), content: value, pushType: nil)
                }
                presentations[slot.rawValue] = .init(targetId: item.id, due: item.due, activityId: activity.id)
                observeDismissal(of: activity)
            } catch { NSLog("NoteHub: could not start %@ activity: %@", slot.rawValue, error.localizedDescription) }
        }
    }
    private static var observedActivityIds: Set<String> = []
    private static func observeDismissal(of activity: Activity<ReminderAttributes>) {
        guard observedActivityIds.insert(activity.id).inserted else { return }
        Task { @MainActor in
            defer { observedActivityIds.remove(activity.id) }
            for await state in activity.activityStateUpdates {
                if state == .dismissed || state == .ended {
                    if let entry = presentations.first(where: { $0.value.activityId == activity.id }) {
                        presentations[entry.key] = nil
                        if state == .dismissed {
                            dismissed[entry.value.targetId] = entry.value.due
                            await syncActivities(allowCreation: canCreateActivity())
                        }
                    }
                    break
                }
            }
        }
    }
    static func updateActivities() async { await syncActivities(allowCreation: false) }

}

struct CheckReminderIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Marcar tarea"
    @Parameter(title: "Recordatorio") var reminderId: String
    @Parameter(title: "Tarea") var taskId: String
    init() {}
    init(reminderId: String, taskId: String) { self.reminderId = reminderId; self.taskId = taskId }
    func perform() async throws -> some IntentResult {
        // Persist the tap before returning, but don't lock the toggle while ActivityKit renders it.
        await ReminderStore.change(id: reminderId, itemId: taskId, waitForActivity: false)
        return .result()
    }
}
struct DeleteReminderIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Borrar recordatorio"
    @Parameter(title: "Recordatorio") var reminderId: String
    init() {}
    init(reminderId: String) { self.reminderId = reminderId }
    func perform() async throws -> some IntentResult { await ReminderStore.change(id: reminderId, delete: true); return .result() }
}

struct DismissReminderIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Quitar de la pantalla bloqueada"
    @Parameter(title: "Aviso") var reminderId: String
    @Parameter(title: "Hora") var due: Double
    init() {}
    init(reminderId: String, due: Double) { self.reminderId = reminderId; self.due = due }
    func perform() async throws -> some IntentResult { await ReminderStore.dismiss(id: reminderId, due: due); return .result() }
}

import XCTest
import Capacitor
import ActivityKit
import UserNotifications
@testable import App

final class ReminderTests: XCTestCase {
    func testAuthSessionSurvivesPluginRecreationAndIsRemovedOnSignOut() throws {
        let key = "sb-qa-\(UUID().uuidString)-auth-token"
        func invoke(_ method: String, _ options: [String: Any], plugin: NoteHubPlugin = NoteHubPlugin()) throws -> [String: Any] {
            var output: [String: Any] = [:]
            var failure: String?
            let call = CAPPluginCall(callbackId: "qa", methodName: method, options: options, success: { result, _ in
                output = result?.data ?? [:]
            }, error: { error in failure = error?.message ?? "Unknown keychain error" })!
            switch method {
            case "authSet": plugin.authSet(call)
            case "authGet": plugin.authGet(call)
            default: plugin.authRemove(call)
            }
            if let failure { throw NSError(domain: "AuthQA", code: 1, userInfo: [NSLocalizedDescriptionKey: failure]) }
            return output
        }
        defer { _ = try? invoke("authRemove", ["key": key]) }
        _ = try invoke("authSet", ["key": key, "value": "first-refresh-token"])
        XCTAssertEqual(try invoke("authGet", ["key": key])["value"] as? String, "first-refresh-token")
        _ = try invoke("authSet", ["key": key, "value": "rotated-refresh-token"])
        XCTAssertEqual(try invoke("authGet", ["key": key])["value"] as? String, "rotated-refresh-token")
        _ = try invoke("authRemove", ["key": key])
        XCTAssertNil(try invoke("authGet", ["key": key])["value"])
    }
    @MainActor func seed() {
        ReminderStore.actions = []
        ReminderStore.completedAt = [:]
        ReminderStore.dismissed = [:]
        ReminderStore.presentations = [:]
        ReminderStore.enabledAt = 0
        ReminderStore.items = [ReminderItem(id: "task:qa", title: "Prueba", kind: "task", due: Date().timeIntervalSince1970 - 60,
            checklist: [ReminderTask(id: "one", text: "Primera", done: false), ReminderTask(id: "two", text: "Segunda", done: false)])]
    }
    @MainActor func clean() { ReminderStore.items = []; ReminderStore.actions = [] }
    @MainActor func testReminderNotificationContainsOnlyItsTitle() {
        seed(); defer { clean() }
        let content = ReminderStore.notificationContent(for: ReminderStore.items[0])
        XCTAssertEqual(content.title, "Prueba")
        XCTAssertEqual(content.body, "")
        XCTAssertEqual(content.subtitle, "")
        XCTAssertEqual(content.categoryIdentifier, "notehub-reminder")
        XCTAssertEqual(content.userInfo["targetId"] as? String, "task:qa")
        XCTAssertEqual(content.userInfo["due"] as? Double, ReminderStore.items[0].due)
        XCTAssertNotNil(content.sound)
    }
    @MainActor func testTickIntentPersistsAbsoluteState() async throws {
        seed(); defer { clean() }
        _ = try await CheckReminderIntent(reminderId: "task:qa", taskId: "one", done: true).perform()
        XCTAssertTrue(ReminderStore.items[0].checklist[0].done)
        XCTAssertFalse(ReminderStore.items[0].checklist[1].done)
        XCTAssertEqual(ReminderStore.actions.count, 1)
        XCTAssertEqual(ReminderStore.actions[0].done, true)
        // A repeated tap from a stale widget keeps the state the user saw instead of flipping it back.
        _ = try await CheckReminderIntent(reminderId: "task:qa", taskId: "one", done: true).perform()
        XCTAssertTrue(ReminderStore.items[0].checklist[0].done)
        XCTAssertEqual(ReminderStore.actions.count, 1)
        _ = try await CheckReminderIntent(reminderId: "task:qa", taskId: "one", done: false).perform()
        XCTAssertFalse(ReminderStore.items[0].checklist[0].done)
        XCTAssertEqual(ReminderStore.actions.last?.done, false)
    }
    @MainActor func testTickedTaskLeavesWidgetAfterGracePeriod() async throws {
        seed(); defer { clean(); ReminderStore.completedAt = [:] }
        _ = try await CheckReminderIntent(reminderId: "task:qa", taskId: "one", done: true).perform()
        let now = Date().timeIntervalSince1970
        XCTAssertEqual(ReminderStore.content(for: ReminderStore.items[0], now: now).state.checklist.map(\.id), ["one", "two"])
        let later = ReminderStore.content(for: ReminderStore.items[0], now: now + ReminderStore.completionGrace + 0.1).state
        XCTAssertEqual(later.checklist.map(\.id), ["two"])
        XCTAssertEqual(later.completed, 1)
        // Unticking within the grace period keeps the task on the widget.
        _ = try await CheckReminderIntent(reminderId: "task:qa", taskId: "one", done: false).perform()
        XCTAssertEqual(ReminderStore.content(for: ReminderStore.items[0], now: now + 5).state.checklist.map(\.id), ["one", "two"])
    }
    @MainActor func testClearingNotificationRestoresOngoingEventWithoutDeletingReminder() async {
        seed(); defer { clean() }
        let now = Date().timeIntervalSince1970
        let due = ReminderStore.items[0].due
        ReminderStore.items.append(ReminderItem(id: "event:qa", title: "Clase", kind: "event", due: now - 300, checklist: [], end: now + 3600))
        XCTAssertEqual(ReminderStore.visibleItem(now: now)?.id, "task:qa")
        await ReminderStore.dismissNotification(id: "task:qa", due: due)
        XCTAssertEqual(ReminderStore.visibleItem(now: now)?.id, "event:qa")
        XCTAssertEqual(ReminderStore.items.count, 2)
        XCTAssertTrue(ReminderStore.actions.isEmpty)
        ReminderStore.items[0].due = now - 30
        await ReminderStore.dismissNotification(id: "task:qa", due: due)
        XCTAssertEqual(ReminderStore.visibleItem(now: now)?.id, "task:qa")
        await ReminderStore.dismissNotification(id: "event:qa", due: now - 300)
        XCTAssertNil(ReminderStore.dismissed["event:qa"])
        clean()
        await ReminderStore.updateActivities()
    }
    @MainActor func testDeleteIntentIsDurableAndDoesNotRepeat() async throws {
        seed(); defer { clean() }
        _ = try await DeleteReminderIntent(reminderId: "task:qa").perform()
        XCTAssertTrue(ReminderStore.items.isEmpty)
        XCTAssertEqual(ReminderStore.actions.first?.kind, "delete")
        _ = try await DeleteReminderIntent(reminderId: "task:qa").perform()
        XCTAssertEqual(ReminderStore.actions.count, 1)
    }
    @MainActor func testRapidWidgetTapsPreserveEveryChangeInOrder() async throws {
        seed(); defer { clean() }
        for index in 0..<20 {
            _ = try await CheckReminderIntent(reminderId: "task:qa", taskId: "one", done: index % 2 == 0).perform()
            XCTAssertEqual(ReminderStore.items[0].checklist[0].done, index % 2 == 0)
        }
        XCTAssertFalse(ReminderStore.items[0].checklist[0].done)
        XCTAssertEqual(ReminderStore.actions.count, 20)
        XCTAssertEqual(ReminderStore.actions.map(\.done), (0..<20).map { Optional($0 % 2 == 0) })
        XCTAssertFalse(ReminderStore.items[0].checklist[1].done)
    }
    @MainActor func testMissingTaskDoesNotQueueChanges() async {
        seed(); defer { clean() }
        await ReminderStore.change(id: "task:qa", itemId: "missing")
        await ReminderStore.change(id: "missing", delete: true)
        XCTAssertTrue(ReminderStore.actions.isEmpty)
        XCTAssertFalse(ReminderStore.items[0].checklist[0].done)
    }
    @MainActor func testRepeatedNotificationActionDoesNotUncheckTask() async {
        seed(); defer { clean() }
        await ReminderStore.change(id: "task:qa", itemId: "one", done: true)
        await ReminderStore.change(id: "task:qa", itemId: "one", done: true)
        XCTAssertTrue(ReminderStore.items[0].checklist[0].done)
        XCTAssertEqual(ReminderStore.actions.count, 1)
    }
    @MainActor func testReminderShowsOverEventAndDismissalLeavesEvent() async throws {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { throw XCTSkip("Live Activities disabled by simulator settings") }
        seed()
        let now = Date().timeIntervalSince1970
        ReminderStore.items.append(ReminderItem(id: "event:qa", title: "Clase", kind: "event", due: now - 300, checklist: [], end: now + 3600))
        await ReminderStore.syncActivities()
        func slot(_ id: String) -> Activity<ReminderAttributes>? {
            Activity<ReminderAttributes>.activities.first { $0.attributes.id == id && $0.activityState == .active }
        }
        let reminder = try XCTUnwrap(slot("notehub-reminder"))
        let event = try XCTUnwrap(slot("notehub-event"))
        XCTAssertEqual(reminder.content.state.targetId, "task:qa")
        XCTAssertEqual(event.content.state.targetId, "event:qa")
        XCTAssertGreaterThan(reminder.content.relevanceScore, event.content.relevanceScore)
        await ReminderStore.syncActivities()
        XCTAssertEqual(slot("notehub-reminder")?.id, reminder.id)
        XCTAssertEqual(slot("notehub-event")?.id, event.id)
        _ = try await DismissReminderIntent(reminderId: "task:qa", due: ReminderStore.items[0].due).perform()
        XCTAssertNil(slot("notehub-reminder"))
        XCTAssertEqual(slot("notehub-event")?.id, event.id)
        XCTAssertEqual(ReminderStore.items.count, 2)
        XCTAssertTrue(ReminderStore.actions.isEmpty)
        await ReminderStore.syncActivities(now: now + 3601)
        XCTAssertNil(slot("notehub-event"))
        clean()
        await ReminderStore.updateActivities()
    }
    @MainActor func testReminderDuringOngoingEventIsScheduledAheadOfTime() async throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Scheduling requires iOS 26") }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { throw XCTSkip("Live Activities disabled") }
        seed()
        let now = Date().timeIntervalSince1970
        ReminderStore.items[0].due = now + 600
        ReminderStore.items.append(ReminderItem(id: "event:qa", title: "Clase", kind: "event", due: now - 300, checklist: [], end: now + 3600))
        await ReminderStore.syncActivities()
        let event = try XCTUnwrap(Activity<ReminderAttributes>.activities.first { $0.attributes.id == "notehub-event" })
        let reminder = try XCTUnwrap(Activity<ReminderAttributes>.activities.first { $0.attributes.id == "notehub-reminder" })
        XCTAssertEqual(event.activityState, .active)
        XCTAssertEqual(reminder.activityState, .pending)
        XCTAssertEqual(reminder.content.state.targetId, "task:qa")
        clean()
        await ReminderStore.updateActivities()
    }
    @MainActor func testSelectionWaitsForDueTimeAndHonorsEventEnd() {
        seed(); defer { clean() }
        let now = Date().timeIntervalSince1970
        ReminderStore.items[0].due = now + 60
        ReminderStore.items.append(ReminderItem(id: "event:qa", title: "Clase", kind: "event", due: now - 300, checklist: [], end: now + 30))
        XCTAssertEqual(ReminderStore.visibleItem(now: now)?.id, "event:qa")
        XCTAssertNil(ReminderStore.visibleItem(now: now + 31))
        XCTAssertEqual(ReminderStore.visibleItem(now: now + 61)?.id, "task:qa")
        ReminderStore.dismissed["task:qa"] = now + 60
        XCTAssertNil(ReminderStore.visibleItem(now: now + 61))
        ReminderStore.items[0].due = now + 120
        XCTAssertEqual(ReminderStore.visibleItem(now: now + 121)?.id, "task:qa")
    }
    @MainActor func testVanishedActivityCountsAsDismissedAndDoesNotReturn() async throws {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { throw XCTSkip("Live Activities disabled") }
        seed()
        let now = Date().timeIntervalSince1970
        ReminderStore.items = [ReminderItem(id: "event:ongoing", title: "Clase actual", kind: "event", due: now - 300, checklist: [], end: now + 3600)]
        ReminderStore.presentations = ["notehub-event": .init(targetId: "event:ongoing", due: now - 300, activityId: "swiped-while-closed")]
        await ReminderStore.syncActivities()
        XCTAssertNil(Activity<ReminderAttributes>.activities.first { $0.attributes.id == "notehub-event" && $0.activityState == .active })
        XCTAssertEqual(ReminderStore.dismissed["event:ongoing"], now - 300)
        clean()
        await ReminderStore.updateActivities()
    }
    @MainActor func testUpcomingItemIsScheduledWithoutBeingShownEarly() async throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Scheduling requires iOS 26") }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { throw XCTSkip("Live Activities disabled") }
        seed()
        ReminderStore.items[0].due = Date().timeIntervalSince1970 + 3600
        await ReminderStore.syncActivities()
        let activity = try XCTUnwrap(Activity<ReminderAttributes>.activities.first { $0.attributes.id == "notehub-reminder" })
        XCTAssertEqual(activity.activityState, .pending)
        clean()
        await ReminderStore.updateActivities()
    }
    @MainActor func testLiveActivityReflectsTickAndDeletion() async throws {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { throw XCTSkip("Live Activities disabled by simulator settings") }
        seed()
        let activity = try Activity<ReminderAttributes>.request(attributes: .init(id: "notehub-reminder"), content: ActivityContent(state: .init(title: "Prueba", checklist: ReminderStore.items[0].checklist, kind: "task", targetId: "task:qa", due: ReminderStore.items[0].due), staleDate: nil), pushType: nil)
        let updated = expectation(description: "Activity reflects the tick")
        let updates = Task { @MainActor in
            for await value in activity.contentUpdates {
                if value.state.checklist.first?.done == true { updated.fulfill(); break }
            }
        }
        _ = try await CheckReminderIntent(reminderId: "task:qa", taskId: "one", done: true).perform()
        await fulfillment(of: [updated], timeout: 3)
        updates.cancel()
        let ended = expectation(description: "Activity ends after deletion")
        let observer = Task { @MainActor in
            for await value in activity.activityStateUpdates {
                if value == .ended || value == .dismissed { ended.fulfill(); break }
            }
        }
        _ = try await DeleteReminderIntent(reminderId: "task:qa").perform()
        await fulfillment(of: [ended], timeout: 3)
        observer.cancel()
        clean()
    }

}

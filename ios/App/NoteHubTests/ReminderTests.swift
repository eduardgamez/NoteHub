import XCTest
import ActivityKit
@testable import App

final class ReminderTests: XCTestCase {
    @MainActor func seed() {
        ReminderStore.actions = []
        ReminderStore.items = [ReminderItem(id: "task:qa", title: "Prueba", kind: "task", due: Date().timeIntervalSince1970 + 3600,
            checklist: [ReminderTask(id: "one", text: "Primera", done: false), ReminderTask(id: "two", text: "Segunda", done: false)])]
    }
    @MainActor func clean() { ReminderStore.items = []; ReminderStore.actions = [] }
    @MainActor func testTickIntentPersistsAbsoluteState() async throws {
        seed(); defer { clean() }
        _ = try await CheckReminderIntent(reminderId: "task:qa", taskId: "one").perform()
        XCTAssertTrue(ReminderStore.items[0].checklist[0].done)
        XCTAssertFalse(ReminderStore.items[0].checklist[1].done)
        XCTAssertEqual(ReminderStore.actions.count, 1)
        XCTAssertEqual(ReminderStore.actions[0].done, true)
        _ = try await CheckReminderIntent(reminderId: "task:qa", taskId: "one").perform()
        XCTAssertFalse(ReminderStore.items[0].checklist[0].done)
        XCTAssertEqual(ReminderStore.actions.last?.done, false)
    }
    @MainActor func testDeleteIntentIsDurableAndDoesNotRepeat() async throws {
        seed(); defer { clean() }
        _ = try await DeleteReminderIntent(reminderId: "task:qa").perform()
        XCTAssertTrue(ReminderStore.items.isEmpty)
        XCTAssertEqual(ReminderStore.actions.first?.kind, "delete")
        _ = try await DeleteReminderIntent(reminderId: "task:qa").perform()
        XCTAssertEqual(ReminderStore.actions.count, 1)
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
    @MainActor func testLiveActivityReflectsTickAndDeletion() async throws {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { throw XCTSkip("Live Activities disabled by simulator settings") }
        seed()
        let activity = try Activity<ReminderAttributes>.request(attributes: .init(id: "task:qa"), content: ActivityContent(state: .init(title: "Prueba", checklist: ReminderStore.items[0].checklist), staleDate: nil), pushType: nil)
        let updated = expectation(description: "Activity reflects the tick")
        let updates = Task { @MainActor in
            for await value in activity.contentUpdates {
                if value.state.checklist.first?.done == true { updated.fulfill(); break }
            }
        }
        _ = try await CheckReminderIntent(reminderId: "task:qa", taskId: "one").perform()
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

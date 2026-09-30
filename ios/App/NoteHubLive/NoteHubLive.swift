import WidgetKit
import SwiftUI
import ActivityKit

@main struct NoteHubLive: WidgetBundle { var body: some Widget { ReminderLiveActivity() } }
struct ReminderLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ReminderAttributes.self) { context in
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Recordatorio ·").font(.system(.caption, design: .serif)).foregroundStyle(.secondary)
                    Spacer()
                    Button(intent: DeleteReminderIntent(reminderId: context.attributes.id)) { Image(systemName: "trash").foregroundStyle(.red.opacity(0.7)) }.buttonStyle(.plain)
                }
                Text(context.state.title).font(.headline)
                ForEach(context.state.checklist) { task in
                    Button(intent: CheckReminderIntent(reminderId: context.attributes.id, taskId: task.id)) {
                        HStack(spacing: 10) {
                            Image(systemName: task.done ? "checkmark.square.fill" : "square").foregroundStyle(task.done ? Color(red: 0.19, green: 0.36, blue: 0.33) : .secondary)
                            Text(task.text).strikethrough(task.done).foregroundStyle(task.done ? .secondary : .primary).lineLimit(2)
                            Spacer()
                        }
                    }.buttonStyle(.plain)
                }
                if context.state.checklist.isEmpty { Text("Abre NoteHub para ver el recordatorio").font(.caption).foregroundStyle(.secondary) }
            }.padding(16).activityBackgroundTint(Color(white: 0.96)).activitySystemActionForegroundColor(.black)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Image(systemName: "bell") }
                DynamicIslandExpandedRegion(.center) { Text(context.state.title).lineLimit(1) }
                DynamicIslandExpandedRegion(.bottom) {
                    if let task = context.state.checklist.first(where: { !$0.done }) {
                        Button(intent: CheckReminderIntent(reminderId: context.attributes.id, taskId: task.id)) { Label(task.text, systemImage: "square").lineLimit(1) }
                    } else { Text("Tareas completadas").font(.caption) }
                }
            } compactLeading: { Image(systemName: "bell") } compactTrailing: { Text("\(context.state.checklist.filter(\.done).count)/\(context.state.checklist.count)").font(.caption2) } minimal: { Image(systemName: "bell") }
        }
    }
}

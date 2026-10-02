import WidgetKit
import SwiftUI
import ActivityKit

@main struct NoteHubLive: WidgetBundle { var body: some Widget { ReminderLiveActivity() } }
struct ReminderLiveActivity: Widget {
    private let cardBackground = Color(red: 0.98, green: 0.96, blue: 0.89)
    private let headerBackground = Color(red: 0.86, green: 0.82, blue: 0.73)
    private let cardLabel = Color(red: 0.49, green: 0.48, blue: 0.44)
    private let contentInset: CGFloat = 16
    private let cardText = Color(red: 0.15, green: 0.15, blue: 0.14)
    private let cardSecondary = Color(red: 0.36, green: 0.36, blue: 0.34)
    private let cardTitle = Color(red: 0.30, green: 0.30, blue: 0.28)
    private func eventHours(_ state: ReminderAttributes.ContentState) -> String? {
        guard let start = state.due, let end = state.end else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_ES")
        formatter.timeZone = .autoupdatingCurrent
        formatter.dateFormat = "HH:mm"
        return "de \(formatter.string(from: Date(timeIntervalSince1970: start))) a \(formatter.string(from: Date(timeIntervalSince1970: end)))"
    }
    private func heading(_ state: ReminderAttributes.ContentState, compact: Bool, remainingTasks: Int) -> some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                if state.kind == "event" {
                    Text("EN CURSO:")
                        .font(.system(size: 10, weight: .medium))
                        .tracking(0.5)
                        .foregroundStyle(cardLabel)
                }
                Text(state.title)
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(cardTitle)
                    .lineLimit(state.checklist.isEmpty ? nil : 2)
                    .fixedSize(horizontal: false, vertical: true)
                if state.kind == "event", let hours = eventHours(state) {
                    Text(hours)
                        .font(.subheadline)
                        .foregroundStyle(cardSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if remainingTasks > 0 {
                Spacer(minLength: 0)
                Text("+ \(remainingTasks) tareas")
                    .font(.system(size: 11))
                    .foregroundStyle(cardSecondary)
                    .lineLimit(1)
                    .frame(width: 66, alignment: .trailing)
                    .accessibilityLabel("\(remainingTasks) tareas más en NoteHub")
            }
        }
        .padding(.vertical, compact ? 8 : 12)
        .frame(minHeight: compact ? 36 : 44, alignment: .center)
    }
    private func cardContent(_ state: ReminderAttributes.ContentState, targetId: String, taskLimit: Int, columns: Int = 1, compact: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            TaskColumnsLayout(columns: columns, rowGap: compact ? 6 : 10) {
                heading(state, compact: compact, remainingTasks: state.checklist.count - taskLimit)
                ForEach(Array(state.checklist.prefix(taskLimit))) { task in
                    Toggle(isOn: task.done, intent: CheckReminderIntent(reminderId: state.targetId ?? targetId, taskId: task.id)) {
                        Text(task.text)
                    }
                    .toggleStyle(ReminderTaskToggleStyle())
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, contentInset)
        .padding(.bottom, state.checklist.isEmpty ? 0 : compact ? 6 : 10)
    }
    private func lockScreenCard(_ state: ReminderAttributes.ContentState, targetId: String) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                NoteHubMark()
                Text("NoteHub").font(.system(size: 16, weight: .semibold)).foregroundStyle(cardText)
                    .offset(y: 2)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, contentInset)
            .frame(height: state.checklist.isEmpty ? 46 : 36)
            .background(headerBackground.opacity(0.94))
            if state.checklist.isEmpty {
                cardContent(state, targetId: targetId, taskLimit: 0)
            } else {
                WidgetBodyLayout(maximumHeight: 124) {
                    ViewThatFits(in: .vertical) {
                        cardContent(state, targetId: targetId, taskLimit: state.checklist.count)
                            .fixedSize(horizontal: false, vertical: true)
                        cardContent(state, targetId: targetId, taskLimit: state.checklist.count, columns: 2)
                            .fixedSize(horizontal: false, vertical: true)
                        ForEach(Array((0...state.checklist.count).reversed()), id: \.self) { limit in
                            cardContent(state, targetId: targetId, taskLimit: limit, columns: 2, compact: true)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ReminderAttributes.self) { context in
            lockScreenCard(context.state, targetId: context.attributes.id)
            .foregroundStyle(cardText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(cardBackground.opacity(0.90))
            .clipShape(ContainerRelativeShape())
            .overlay { ContainerRelativeShape().stroke(cardLabel, lineWidth: 0.75).padding(0.375) }
            .activityBackgroundTint(Color.clear)
            .activitySystemActionForegroundColor(.black)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) { NoteHubMark(); Text("NoteHub").font(.caption) }
                }
                DynamicIslandExpandedRegion(.center) { Text(context.state.title).lineLimit(1) }
                DynamicIslandExpandedRegion(.bottom) {
                    if context.state.kind != "event" {
                        if let task = context.state.checklist.first(where: { !$0.done }) {
                            Toggle(isOn: task.done, intent: CheckReminderIntent(reminderId: context.state.targetId ?? context.attributes.id, taskId: task.id)) { Text(task.text) }
                                .toggleStyle(ReminderTaskToggleStyle())
                        } else { Text(context.state.checklist.isEmpty ? "Recordatorio" : "Tareas completadas").font(.caption) }
                    }
                }
            } compactLeading: {
                if context.state.kind == "event" { NoteHubMark() } else { Image(systemName: "bell") }
            } compactTrailing: {
                if context.state.kind == "event" { Text(context.state.title).font(.caption2).lineLimit(1) }
                else { Text("\(context.state.checklist.filter(\.done).count)/\(context.state.checklist.count)").font(.caption2) }
            } minimal: {
                if context.state.kind == "event" { NoteHubMark() } else { Image(systemName: "bell") }
            }
        }
    }
}

private struct NoteHubMark: View {
    var body: some View {
        Text("N")
            .font(.system(size: 14, weight: .bold, design: .serif))
            .foregroundStyle(Color.white)
            .frame(width: 24, height: 24)
            .background(Color(red: 0.13, green: 0.13, blue: 0.12), in: RoundedRectangle(cornerRadius: 5))
            .accessibilityHidden(true)
    }
}

private struct ReminderTaskToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(spacing: 8) {
                Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square")
                    .font(.system(size: 22))
                    .frame(width: 22, height: 22)
                    .foregroundStyle(configuration.isOn ? Color(red: 0.19, green: 0.36, blue: 0.33) : Color(red: 0.36, green: 0.36, blue: 0.34))
                configuration.label
                    .strikethrough(configuration.isOn)
                    .foregroundStyle(configuration.isOn ? Color(red: 0.36, green: 0.36, blue: 0.34) : Color(red: 0.15, green: 0.15, blue: 0.14))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .font(.system(size: 16))
        .contentTransition(.identity)
        .transition(.identity)
        .animation(nil, value: configuration.isOn)
    }
}

private struct TaskColumnsLayout: Layout {
    var columns: Int
    private let columnGap: CGFloat = 14
    var rowGap: CGFloat
    private let headingGap: CGFloat = 0
    private struct Plan {
        var size: CGSize
        var widths: [CGFloat]
        var positions: [CGPoint]
    }
    private func plan(width: CGFloat, subviews: Subviews) -> Plan {
        guard !subviews.isEmpty else { return Plan(size: .zero, widths: [], positions: []) }
        if columns == 1 {
            var y: CGFloat = 0
            var positions: [CGPoint] = []
            for (index, view) in subviews.enumerated() {
                positions.append(CGPoint(x: 0, y: y))
                y += view.sizeThatFits(.init(width: width, height: nil)).height
                if index < subviews.count - 1 { y += index == 0 ? headingGap : rowGap }
            }
            return Plan(size: CGSize(width: width, height: y),
                        widths: Array(repeating: width, count: subviews.count), positions: positions)
        }
        let columnWidth = max(0, (width - columnGap) / 2)
        let count = subviews.count - 1
        // The title has a full-width reserved section; both task columns start below it.
        let headingWidth = width
        let headingHeight = subviews[0].sizeThatFits(.init(width: headingWidth, height: nil)).height
        let sizes = subviews.dropFirst().map { $0.sizeThatFits(.init(width: columnWidth, height: nil)) }
        func rowsHeight(_ range: Range<Int>) -> CGFloat {
            range.reduce(CGFloat.zero) { $0 + sizes[$1].height } + CGFloat(max(0, range.count - 1)) * rowGap
        }
        // Keep task order down the left column, then down the right; balance their actual heights.
        var split = count
        var bestHeight = CGFloat.infinity
        for candidate in stride(from: count, through: 0, by: -1) {
            let left = rowsHeight(0..<candidate)
            let right = rowsHeight(candidate..<count)
            let height = headingHeight + (count > 0 ? headingGap + max(left, right) : 0)
            if height < bestHeight { bestHeight = height; split = candidate }
        }
        var positions = [CGPoint.zero]
        var widths = [headingWidth]
        var leftY = headingHeight + headingGap
        var rightY = headingHeight + headingGap
        for index in 0..<count {
            if index < split {
                positions.append(CGPoint(x: 0, y: leftY))
                leftY += sizes[index].height + rowGap
            } else {
                positions.append(CGPoint(x: columnWidth + columnGap, y: rightY))
                rightY += sizes[index].height + rowGap
            }
            widths.append(columnWidth)
        }
        return Plan(size: CGSize(width: width, height: bestHeight), widths: widths, positions: positions)
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        plan(width: proposal.width ?? 332, subviews: subviews).size
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let layout = plan(width: bounds.width, subviews: subviews)
        for index in subviews.indices {
            let point = layout.positions[index]
            subviews[index].place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), anchor: .topLeading,
                                  proposal: .init(width: layout.widths[index], height: nil))
        }
    }
}

// Propose the system's height limit to the fitter, but report only the chosen content's height.
// This keeps the header at the top and lets the card grow down without an empty fixed-height body.
private struct WidgetBodyLayout: Layout {
    var maximumHeight: CGFloat
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let content = subviews.first else { return .zero }
        return content.sizeThatFits(.init(width: proposal.width, height: maximumHeight))
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, anchor: .topLeading,
                             proposal: .init(width: bounds.width, height: maximumHeight))
    }
}

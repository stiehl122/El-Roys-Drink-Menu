import EventKit
import Foundation

enum CalendarReminderError: LocalizedError, Equatable {
  case accessDenied
  case unavailable
  case saveFailed(String)

  var errorDescription: String? {
    switch self {
    case .accessDenied:
      return "Calendar access was not granted. You can enable it in Settings."
    case .unavailable:
      return "Calendar reminders are not available on this device."
    case .saveFailed(let message):
      return message
    }
  }
}

struct CalendarReminderResult: Equatable {
  var title: String
  var startDate: Date
}

protocol CalendarReminderServicing {
  func scheduleMenuReview(for restaurantName: String) async throws -> CalendarReminderResult
}

final class EventKitCalendarReminderService: CalendarReminderServicing {
  private let eventStore: EKEventStore
  private let calendar: Calendar

  init(eventStore: EKEventStore = EKEventStore(), calendar: Calendar = .current) {
    self.eventStore = eventStore
    self.calendar = calendar
  }

  func scheduleMenuReview(for restaurantName: String) async throws -> CalendarReminderResult {
    let status = EKEventStore.authorizationStatus(for: .event)
    let granted: Bool

    switch status {
    case .fullAccess, .authorized:
      granted = true
    case .notDetermined:
      granted = try await requestCalendarAccess()
    case .writeOnly:
      granted = true
    case .denied, .restricted:
      granted = false
    @unknown default:
      granted = false
    }

    guard granted else { throw CalendarReminderError.accessDenied }
    guard let targetCalendar = eventStore.defaultCalendarForNewEvents else {
      throw CalendarReminderError.unavailable
    }

    let restaurant = restaurantName.trimmingCharacters(in: .whitespacesAndNewlines)
    let title = "Review \(restaurant.isEmpty ? "restaurant" : restaurant) menus"
    let start = nextReviewDate()
    let event = EKEvent(eventStore: eventStore)
    event.title = title
    event.notes = "Open El Roy's Manager to review drinks, food, featured specials, and recent menu updates before service."
    event.calendar = targetCalendar
    event.startDate = start
    event.endDate = start.addingTimeInterval(30 * 60)
    event.addAlarm(EKAlarm(relativeOffset: -15 * 60))

    do {
      try eventStore.save(event, span: .thisEvent, commit: true)
      return CalendarReminderResult(title: title, startDate: start)
    } catch {
      throw CalendarReminderError.saveFailed(error.localizedDescription)
    }
  }

  private func requestCalendarAccess() async throws -> Bool {
    try await eventStore.requestFullAccessToEvents()
  }

  private func nextReviewDate() -> Date {
    let now = Date()
    var components = calendar.dateComponents([.year, .month, .day], from: now)
    components.hour = 16
    components.minute = 0
    components.second = 0

    let todayAtFour = calendar.date(from: components) ?? now.addingTimeInterval(60 * 60)
    if todayAtFour > now.addingTimeInterval(60 * 60) {
      return todayAtFour
    }
    return calendar.date(byAdding: .day, value: 1, to: todayAtFour) ?? now.addingTimeInterval(24 * 60 * 60)
  }
}

import { subscribeCalendarEvents } from '../services/calendarService'
import type { CalendarEvent } from '../types'
import { useSharedSubscription } from './useCollectionSubscription'

export function useCalendarEvents() {
  return useSharedSubscription<CalendarEvent>('calendarEvents:all', (onData, onError) => subscribeCalendarEvents(onData, onError))
}

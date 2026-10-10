import { subscribeAllMeetings, subscribeClientMeetings } from '../services/meetingService'
import type { Meeting } from '../types'
import { useCollectionSubscription, useSharedSubscription } from './useCollectionSubscription'

export function useAllMeetings() {
  return useSharedSubscription<Meeting>('meetings:all', (onData, onError) => subscribeAllMeetings(onData, onError))
}

export function useClientMeetings(clientId: string | undefined) {
  return useCollectionSubscription<Meeting>(
    (onData, onError) => subscribeClientMeetings(clientId ?? '__none__', onData, onError),
    [clientId]
  )
}

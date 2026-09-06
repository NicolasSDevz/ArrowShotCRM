import { useEffect, useMemo } from 'react'
import { subscribeMyNotifications, deleteNotifications } from '../services/notificationService'
import type { AppNotification } from '../types'
import { isNotificationStale } from '../types/notification'
import { useCollectionSubscription } from './useCollectionSubscription'

/** The viewer's own notifications. The platform owner isn't special here —
 *  they receive their own copy of every platform action (see
 *  notifyAdminsOfAction), so the badge count and mark-as-read stay meaningful
 *  per person. */
export function useNotifications(userId: string | undefined) {
  const { data, loading } = useCollectionSubscription<AppNotification>(
    (onData, onError) => subscribeMyNotifications(userId ?? '__none__', onData, onError),
    [userId]
  )

  const sorted = useMemo(
    () =>
      [...data]
        .filter((n) => !isNotificationStale(n))
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)),
    [data]
  )
  const unreadCount = useMemo(() => sorted.filter((n) => !n.read).length, [sorted])

  // 30-day retention has no backend job to enforce it — whichever client
  // loads a stale row just deletes it. Cheap and safe: same effect, run by
  // many users over time, just deletes the same already-gone doc harmlessly.
  useEffect(() => {
    const stale = data.filter(isNotificationStale)
    if (stale.length > 0) deleteNotifications(stale).catch(() => {})
  }, [data])

  return { notifications: sorted, ownNotifications: sorted, unreadCount, loading }
}

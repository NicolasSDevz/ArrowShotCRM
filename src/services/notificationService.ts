import { collection, addDoc, doc, updateDoc, deleteDoc, where, serverTimestamp, type FirestoreError } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { AppNotification, EntityType, NotificationType } from '../types'
import { collectionService } from './firestore'

const COLLECTION = 'notifications'
const base = collectionService<AppNotification>(COLLECTION)

export async function createNotification(params: {
  userId: string
  type: NotificationType
  message: string
  actorName?: string
  entityType?: EntityType
  entityId?: string
}) {
  // Secondary side-effect: a failure here (rules, rede) must never reject the
  // user action that triggered it — callers `await` this inline, sometimes
  // inside a Promise.all over several recipients.
  try {
    await addDoc(collection(db, COLLECTION), {
      userId: params.userId,
      type: params.type,
      message: params.message,
      actorName: params.actorName ?? null,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      read: false,
      createdAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('createNotification falhou (ação principal não afetada)', err)
  }
}

/** No orderBy on purpose — a single equality filter needs no composite
 *  index. The hook sorts newest-first client-side instead.
 *
 *  `isAdmin` skips the `userId` filter entirely: Bruno (Admin) sees every
 *  notification in the platform, not just his own (see firestore.rules —
 *  admin read access mirrors this query). */
export function subscribeMyNotifications(
  userId: string,
  isAdmin: boolean,
  onData: (items: AppNotification[]) => void,
  onError?: (err: FirestoreError) => void
) {
  const constraints = isAdmin ? [] : [where('userId', '==', userId)]
  return base.subscribe(constraints, onData, onError)
}

export async function markNotificationRead(id: string) {
  await updateDoc(doc(db, COLLECTION, id), { read: true })
}

export async function markAllNotificationsRead(notifications: AppNotification[]) {
  await Promise.all(notifications.filter((n) => !n.read).map((n) => markNotificationRead(n.id)))
}

export async function deleteNotification(id: string) {
  await deleteDoc(doc(db, COLLECTION, id))
}

/** Best-effort cleanup for the 30-day retention policy — called from
 *  useNotifications whenever stale rows show up in a snapshot. Failures are
 *  swallowed by the caller; there's no backend job to retry them, so the
 *  next snapshot just tries again. */
export async function deleteNotifications(notifications: AppNotification[]) {
  await Promise.all(notifications.map((n) => deleteNotification(n.id)))
}

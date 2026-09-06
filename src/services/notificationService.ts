import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  where,
  query,
  getDocs,
  serverTimestamp,
  type FirestoreError,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import type { AppNotification, EntityType, NotificationType } from '../types'
import { collectionService } from './firestore'

const COLLECTION = 'notifications'
const base = collectionService<AppNotification>(COLLECTION)

/** The platform owner. Identified by the `admin` role or, as a fallback, this
 *  e-mail (used only to route the owner's own notifications — see memory). */
const OWNER_EMAIL = 'gestorarrowshotmkt@gmail.com'

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

// --- admin CC ---------------------------------------------------------------

let adminIdCache: { ids: string[]; at: number } | null = null
const ADMIN_CACHE_TTL = 5 * 60 * 1000

/** Ids of the platform owner/admin account(s). Cached for 5 min — the roster
 *  rarely changes and this runs on every notified action. */
async function getAdminUserIds(): Promise<string[]> {
  if (adminIdCache && Date.now() - adminIdCache.at < ADMIN_CACHE_TTL) return adminIdCache.ids
  try {
    const usersCol = collection(db, 'users')
    const [byRole, byEmail] = await Promise.all([
      getDocs(query(usersCol, where('role', '==', 'admin'))),
      getDocs(query(usersCol, where('email', '==', OWNER_EMAIL))),
    ])
    const ids = new Set<string>()
    byRole.docs.forEach((d) => {
      if ((d.data() as { active?: boolean }).active !== false) ids.add(d.id)
    })
    byEmail.docs.forEach((d) => ids.add(d.id))
    const arr = [...ids]
    adminIdCache = { ids: arr, at: Date.now() }
    return arr
  } catch (err) {
    // Unauthenticated contexts (public approval portal) can't read `users`.
    console.error('getAdminUserIds falhou', err)
    return adminIdCache?.ids ?? []
  }
}

/** CC the platform owner/admin on an action so they see everything that
 *  happens on the platform, regardless of who did it or which client.
 *
 *  - Skips the actor themselves (no self-notifications).
 *  - Skips ids in `alreadyNotified` (direct recipients) so there's no
 *    duplicate when the owner was already a recipient.
 *  - `message` should already read as a full sentence with the actor's name,
 *    e.g. `Ciane concluiu "Gestor de Tráfego — Semanal" — Help Gestão`.
 *
 *  Fire-and-forget, like createNotification — never rejects the caller. */
export async function notifyAdminsOfAction(params: {
  type: NotificationType
  message: string
  actorId: string
  actorName: string
  entityType?: EntityType
  entityId?: string
  alreadyNotified?: string[]
}) {
  try {
    const adminIds = await getAdminUserIds()
    const skip = new Set([params.actorId, ...(params.alreadyNotified ?? [])])
    await Promise.all(
      adminIds
        .filter((id) => !skip.has(id))
        .map((userId) =>
          createNotification({
            userId,
            type: params.type,
            message: params.message,
            actorName: params.actorName,
            entityType: params.entityType,
            entityId: params.entityId,
          })
        )
    )
  } catch (err) {
    console.error('notifyAdminsOfAction falhou (ação principal não afetada)', err)
  }
}

// --- subscription ----------------------------------------------------------

/** A viewer's own notifications, newest-first sorted client-side (a single
 *  equality filter needs no composite index). The owner isn't special here —
 *  they get their own copy of every action via notifyAdminsOfAction, so this
 *  stays one row per recipient and `read`/badge stay meaningful per person. */
export function subscribeMyNotifications(
  userId: string,
  onData: (items: AppNotification[]) => void,
  onError?: (err: FirestoreError) => void
) {
  return base.subscribe([where('userId', '==', userId)], onData, onError)
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

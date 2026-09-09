import { collection, addDoc, where, orderBy, limit, serverTimestamp, type FirestoreError } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { Activity, ActivityAction, EntityType } from '../types'
import { collectionService } from './firestore'

const COLLECTION = 'activities'
const base = collectionService<Activity>(COLLECTION)

export async function logActivity(params: {
  entityType: EntityType
  entityId: string
  clientId?: string
  action: ActivityAction
  message: string
  userId: string
  userName: string
}) {
  // Best-effort audit trail: a failure here (rules, rede) must never reject
  // the user action that triggered it — callers `await` this inline.
  try {
    await addDoc(collection(db, COLLECTION), {
      entityType: params.entityType,
      entityId: params.entityId,
      clientId: params.clientId ?? null,
      action: params.action,
      message: params.message,
      userId: params.userId,
      userName: params.userName,
      createdAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('logActivity falhou (ação principal não afetada)', err)
  }
}

export function subscribeActivities(
  entityType: EntityType,
  entityId: string,
  onData: (items: Activity[]) => void,
  onError?: (err: FirestoreError) => void
) {
  return base.subscribe(
    [where('entityType', '==', entityType), where('entityId', '==', entityId), orderBy('createdAt', 'desc')],
    onData,
    onError
  )
}

/** Todos os eventos de upsell (ordenados no cliente — filtro de campo único,
 *  sem índice composto). O card "Upsell" do Dashboard recorta os do mês. */
export function subscribeUpsellActivities(
  onData: (items: Activity[]) => void,
  onError?: (err: FirestoreError) => void
) {
  return base.subscribe([where('action', '==', 'upsell')], onData, onError)
}

export function subscribeClientActivities(
  clientId: string,
  onData: (items: Activity[]) => void,
  onError?: (err: FirestoreError) => void
) {
  return base.subscribe(
    [where('clientId', '==', clientId), orderBy('createdAt', 'desc'), limit(50)],
    onData,
    onError
  )
}

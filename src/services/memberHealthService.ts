import { doc, onSnapshot, serverTimestamp, writeBatch, deleteDoc, type Unsubscribe } from 'firebase/firestore'
import { db } from '../firebase/config'
import { EMERGENCY_KEYS, type MemberEmergency, type MemberHealth } from '../types'

const HEALTH_COLLECTION = 'memberHealth'
const EMERGENCY_COLLECTION = 'memberEmergency'

/** Full confidential record — the subscription errors out for non-admins
 *  (Firestore rules), which the caller surfaces as "sem permissão". */
export function subscribeMemberHealth(
  memberId: string,
  onData: (data: MemberHealth | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, HEALTH_COLLECTION, memberId),
    (snap) => onData(snap.exists() ? (snap.data() as MemberHealth) : null),
    (err) => {
      console.error(err)
      onError?.(err)
    }
  )
}

/** Non-confidential subset — readable by any internal team member. */
export function subscribeMemberEmergency(
  memberId: string,
  onData: (data: MemberEmergency | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, EMERGENCY_COLLECTION, memberId),
    (snap) => onData(snap.exists() ? (snap.data() as MemberEmergency) : null),
    (err) => {
      console.error(err)
      onError?.(err)
    }
  )
}

/** Persists the health record and, atomically, refreshes its public emergency
 *  mirror. `setDoc` (no merge) so fields the admin cleared actually disappear —
 *  the Firestore SDK is configured with ignoreUndefinedProperties, so empty
 *  optional fields are simply omitted. */
export async function saveMemberHealth(memberId: string, data: MemberHealth, userId: string) {
  const emergency: MemberEmergency = {}
  for (const key of EMERGENCY_KEYS) {
    const value = data[key]
    if (value !== undefined && value !== '') {
      // key is constrained to the shared subset, so the assignment is safe
      ;(emergency as Record<string, unknown>)[key] = value
    }
  }

  const batch = writeBatch(db)
  batch.set(doc(db, HEALTH_COLLECTION, memberId), {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  })
  batch.set(doc(db, EMERGENCY_COLLECTION, memberId), {
    ...emergency,
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
}

/** Cascade for the team-member deletion — the confidential medical record and
 *  its public mirror must not outlive the roster entry. Admin-only writes
 *  (Firestore rules); best-effort so a manager-initiated member deletion
 *  isn't blocked by it (managers can't see this data anyway). */
export async function deleteMemberHealthRecord(memberId: string) {
  await Promise.all([
    deleteDoc(doc(db, HEALTH_COLLECTION, memberId)).catch((err) =>
      console.error('Falha ao remover ficha de saúde do membro', err)
    ),
    deleteDoc(doc(db, EMERGENCY_COLLECTION, memberId)).catch((err) =>
      console.error('Falha ao remover mirror de emergência do membro', err)
    ),
  ])
}

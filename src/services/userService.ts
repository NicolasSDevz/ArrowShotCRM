import { doc, setDoc, getDoc, serverTimestamp, orderBy, type FirestoreError } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { AppUser, UserRole } from '../types'
import { collectionService } from './firestore'

const COLLECTION = 'users'
const base = collectionService<AppUser>(COLLECTION)

/** Creates the Firestore profile doc for a freshly authenticated user, if
 *  missing. Always starts as an active 'employee' — the security rules only
 *  allow self-provisioning at that level; an admin then adjusts the role.
 *  The very first admin is set by hand in the Firebase Console (accounts are
 *  created there too — see README). */
export async function ensureUserProfile(uid: string, email: string, name: string, photoURL?: string) {
  const ref = doc(db, COLLECTION, uid)
  const snap = await getDoc(ref)
  if (snap.exists()) return snap.data() as AppUser

  const profile = {
    name,
    email,
    photoURL: photoURL ?? null,
    role: 'employee' as UserRole,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  await setDoc(ref, profile)
  return { id: uid, ...profile } as unknown as AppUser
}

export function getUserProfile(uid: string) {
  return base.getById(uid)
}

export function subscribeUsers(onData: (items: AppUser[]) => void, onError?: (err: FirestoreError) => void) {
  return base.subscribe([orderBy('name', 'asc')], onData, onError)
}

export async function updateUserRole(uid: string, role: UserRole, actingUserId: string) {
  await base.update(uid, { role }, actingUserId)
}

export async function updateUserActive(uid: string, active: boolean, actingUserId: string) {
  await base.update(uid, { active }, actingUserId)
}

export async function updateUserPhoto(uid: string, photoURL: string) {
  await base.update(uid, { photoURL }, uid)
}

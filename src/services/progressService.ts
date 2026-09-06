import {
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  type FirestoreError,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import type { ModuleProgress } from '../types'

const COLLECTION = 'moduleProgress'
const colRef = collection(db, COLLECTION)

function progressId(userId: string, moduleId: string) {
  return `${userId}_${moduleId}`
}

export async function completeModule(params: {
  userId: string
  trailId: string
  moduleId: string
  quizScore: number
  checklistDone: boolean
}) {
  const { userId, trailId, moduleId, quizScore, checklistDone } = params
  const ref = doc(db, COLLECTION, progressId(userId, moduleId))

  // Redoing a module must never lower the recorded quiz score or reset the
  // original completion date (setDoc replaces the whole doc).
  const snap = await getDoc(ref)
  const prev = snap.exists() ? (snap.data() as Partial<ModuleProgress>) : null

  await setDoc(ref, {
    userId,
    trailId,
    moduleId,
    completed: true,
    quizScore: prev?.completed ? Math.max(prev.quizScore ?? 0, quizScore) : quizScore,
    checklistDone: checklistDone || !!prev?.checklistDone,
    completedAt: prev?.completedAt ?? serverTimestamp(),
  })
}

/** All progress docs for one user, across every trail — filtered client-side
 *  per trail/module to keep this to a single listener and avoid extra indexes. */
export function subscribeUserProgress(
  userId: string,
  onData: (items: ModuleProgress[]) => void,
  onError?: (err: FirestoreError) => void
) {
  const q = query(colRef, where('userId', '==', userId))
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as ModuleProgress)),
    onError
  )
}

/** Admin-only: progress across every employee, for the "progresso por funcionário" view. */
export function subscribeAllProgress(
  onData: (items: ModuleProgress[]) => void,
  onError?: (err: FirestoreError) => void
) {
  return onSnapshot(
    colRef,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as ModuleProgress)),
    onError
  )
}

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  serverTimestamp,
  type DocumentReference,
  type FirestoreError,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import type { ModuleProgress } from '../types'

const COLLECTION = 'moduleProgress'
const colRef = collection(db, COLLECTION)

const BATCH_LIMIT = 400

async function deleteRefsInChunks(refs: DocumentReference[]) {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref)
    await batch.commit()
  }
}

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

/** Admin cascade — drops every learner's progress for a module. Without this,
 *  a deleted module's completed-progress docs keep inflating the "módulos
 *  concluídos" counter (can exceed the total) and skew the average score. */
export async function deleteProgressForModule(moduleId: string) {
  const snap = await getDocs(query(colRef, where('moduleId', '==', moduleId)))
  await deleteRefsInChunks(snap.docs.map((d) => d.ref))
}

/** Same, for a whole trail — catches progress whose module wasn't in the
 *  caller's (possibly stale) module list. */
export async function deleteProgressForTrail(trailId: string) {
  const snap = await getDocs(query(colRef, where('trailId', '==', trailId)))
  await deleteRefsInChunks(snap.docs.map((d) => d.ref))
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

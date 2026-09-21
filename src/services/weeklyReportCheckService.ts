import { doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, type FirestoreError, type Unsubscribe } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { WeeklyReportCheck } from '../types/weeklyReportCheck'

const COLLECTION = 'weeklyReportChecks'

function docId(userId: string, weekKey: string) {
  return `${userId}_${weekKey}`
}

export function subscribeWeeklyReportCheck(
  userId: string,
  weekKey: string,
  onData: (data: WeeklyReportCheck | null) => void,
  onError?: (err: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, COLLECTION, docId(userId, weekKey)),
    (snap) => onData(snap.exists() ? (snap.data() as WeeklyReportCheck) : null),
    onError
  )
}

/** Garante que o doc da semana existe, com todos os clientes elegíveis de
 *  agora presentes em `checks` (novos entram como não enviados) — nunca
 *  sobrescreve um check que já existia. Chamado toda vez que o widget monta
 *  numa segunda-feira. */
export async function ensureWeeklyReportCheck(userId: string, weekKey: string, eligibleClientIds: string[]) {
  const ref = doc(db, COLLECTION, docId(userId, weekKey))
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    const checks = Object.fromEntries(eligibleClientIds.map((id) => [id, false]))
    await setDoc(ref, { userId, weekKey, checks, completedAt: null, updatedAt: serverTimestamp() })
    return
  }
  const data = snap.data() as WeeklyReportCheck
  const existing = data.checks ?? {}
  const missing = eligibleClientIds.filter((id) => !(id in existing))
  if (missing.length === 0) return
  await updateDoc(ref, {
    ...Object.fromEntries(missing.map((id) => [`checks.${id}`, false])),
    updatedAt: serverTimestamp(),
  })
}

/** Marca (ou desmarca) 1 cliente. `allDone` é calculado pelo chamador (já
 *  tem o estado local pós-clique) e grava/limpa `completedAt`. */
export async function setWeeklyReportCheckItem(userId: string, weekKey: string, clientId: string, done: boolean, allDone: boolean) {
  const ref = doc(db, COLLECTION, docId(userId, weekKey))
  await updateDoc(ref, {
    [`checks.${clientId}`]: done,
    completedAt: allDone ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  })
}

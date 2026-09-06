import {
  orderBy,
  where,
  getDocs,
  query,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import type { Optimization, OptimizationInput, OptimizationSchedule, OptimizationScheduleRow } from '../types'
import { collectionService } from './firestore'
import { logActivity } from './activityService'
import { notifyAdminsOfAction } from './notificationService'
import { getClientName } from './clientLookup'

const COLLECTION = 'optimizations'
const base = collectionService<Optimization>(COLLECTION)

const SCHEDULE_REF = doc(db, 'settings', 'optimizationSchedule')

/* ---------------- registros de otimização ---------------- */

export async function createOptimization(data: OptimizationInput, userId: string, userName: string) {
  const id = await base.create(data, userId)
  await logActivity({
    entityType: 'client',
    entityId: data.clientId,
    clientId: data.clientId,
    action: 'created',
    message: 'registrou uma otimização de campanhas',
    userId,
    userName,
  })
  const clientName = await getClientName(data.clientId)
  await notifyAdminsOfAction({
    type: 'planning_saved',
    message: `${userName} registrou uma otimização${clientName ? ` — ${clientName}` : ''}`,
    actorId: userId,
    actorName: userName,
    entityType: 'client',
    entityId: data.clientId,
  })
  return id
}

export async function updateOptimization(id: string, data: Partial<Optimization>, userId: string) {
  await base.update(id, data, userId)
}

export async function deleteOptimization(id: string) {
  await base.remove(id)
}

/** Registros de um cliente. Sem orderBy no Firestore (evita índice composto)
 *  — a UI ordena por data desc. */
export function subscribeClientOptimizations(
  clientId: string,
  onData: (items: Optimization[]) => void,
  onError?: (err: FirestoreError) => void
) {
  return base.subscribe([where('clientId', '==', clientId)], onData, onError)
}

/** Registros de hoje (todos os clientes) — para o widget do Dashboard saber
 *  quais otimizações já foram feitas. Range num único campo, sem índice. */
export function subscribeTodayOptimizations(
  startOfTodayMs: number,
  onData: (items: Optimization[]) => void,
  onError?: (err: FirestoreError) => void
) {
  return base.subscribe(
    [where('date', '>=', new Date(startOfTodayMs)), orderBy('date', 'desc')],
    onData,
    onError
  )
}

/** One-shot — usado na cascata de exclusão de cliente. */
export async function getClientOptimizations(clientId: string): Promise<Optimization[]> {
  const snap = await getDocs(query(base.colRef, where('clientId', '==', clientId)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Optimization)
}

/* ---------------- calendário global ---------------- */

export function subscribeOptimizationSchedule(
  onData: (schedule: OptimizationSchedule) => void,
  onError?: (err: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(
    SCHEDULE_REF,
    (snap) => onData(snap.exists() ? (snap.data() as OptimizationSchedule) : { rows: [] }),
    (err) => {
      console.error(err)
      onError?.(err)
    }
  )
}

export async function getOptimizationSchedule(): Promise<OptimizationSchedule> {
  const snap = await getDoc(SCHEDULE_REF)
  return snap.exists() ? (snap.data() as OptimizationSchedule) : { rows: [] }
}

export async function setOptimizationSchedule(rows: OptimizationScheduleRow[], userId: string) {
  await setDoc(SCHEDULE_REF, { rows, updatedAt: serverTimestamp(), updatedBy: userId })
}

/** Ajusta (ou cria) a linha do calendário de um cliente — usado no editor de
 *  "dias de otimização" dentro da aba Otimizações da ficha do cliente. */
export async function setClientOptimizationRow(
  current: OptimizationScheduleRow[],
  row: OptimizationScheduleRow,
  userId: string
) {
  const next = current.filter((r) => r.clientId !== row.clientId)
  if (row.weekdays.length > 0 && row.userId) next.push(row)
  await setOptimizationSchedule(next, userId)
}

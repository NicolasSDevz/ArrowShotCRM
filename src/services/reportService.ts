import { orderBy, where, getDocs, query, type FirestoreError } from 'firebase/firestore'
import type { Report, ReportInput } from '../types'
import { collectionService } from './firestore'
import { logActivity } from './activityService'

const COLLECTION = 'reports'
const base = collectionService<Report>(COLLECTION)

export async function createReport(data: ReportInput, userId: string, userName: string) {
  const id = await base.create(data, userId)
  await logActivity({
    entityType: 'report',
    entityId: id,
    clientId: data.clientId,
    action: 'created',
    message: `gerou o relatório ${data.type === 'weekly' ? 'semanal' : 'mensal'}`,
    userId,
    userName,
  })
  return id
}

export async function deleteReport(report: Report, userId: string, userName: string) {
  await base.remove(report.id)
  await logActivity({
    entityType: 'report',
    entityId: report.id,
    clientId: report.clientId,
    action: 'deleted',
    message: 'excluiu um relatório',
    userId,
    userName,
  })
}

export function getReport(id: string) {
  return base.getById(id)
}

export function subscribeReports(onData: (items: Report[]) => void, onError?: (err: FirestoreError) => void) {
  return base.subscribe([orderBy('createdAt', 'desc')], onData, onError)
}

/** One-shot fetch — used by the client-deletion cascade so a deleted client's
 *  reports don't linger in the Relatórios list showing "—" as the client. */
export async function getClientReports(clientId: string): Promise<Report[]> {
  const snap = await getDocs(query(base.colRef, where('clientId', '==', clientId)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Report)
}

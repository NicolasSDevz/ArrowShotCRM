import { orderBy, where, doc, writeBatch, type DocumentReference, type QueryConstraint, type FirestoreError } from 'firebase/firestore'
import type { AppUser, Client } from '../types'
import { db } from '../firebase/config'
import { collectionService } from './firestore'
import { logActivity } from './activityService'
import { createNotification, notifyAdminsOfAction } from './notificationService'
import { getClientTasks } from './taskService'
import { getClientContents } from './contentService'
import { getClientCalendarEvents } from './calendarService'
import { getClientMeetings } from './meetingService'
import { getClientReports } from './reportService'
import { getClientFiles, deleteFile } from './fileService'
import { getInternalStaffIds } from '../utils/userLookup'

const COLLECTION = 'clients'
const base = collectionService<Client>(COLLECTION)

/** `users`, when given, notifies the whole internal team (everyone but the
 *  creator) that a new client was registered. Optional + defaults to []
 *  purely so this stays callable from anywhere that doesn't happen to have
 *  the users list handy — no notification fires in that case. */
export async function createClient(
  data: Omit<Client, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
  userId: string,
  userName: string,
  users: AppUser[] = []
) {
  const id = await base.create(data, userId)
  await logActivity({
    entityType: 'client',
    entityId: id,
    clientId: id,
    action: 'created',
    message: `criou o cliente "${data.companyName}"`,
    userId,
    userName,
  })

  const hasTraffic = !!data.modules?.paidTraffic
  const hasSocial = !!data.modules?.socialMedia
  const serviceLabel = hasTraffic && hasSocial ? 'Ambos' : hasTraffic ? 'Tráfego' : hasSocial ? 'Social Mídia' : 'Não definido'
  const message = `🆕 Novo cliente cadastrado: ${data.companyName}\nServiço: ${serviceLabel}\nCadastrado por: ${userName}`

  const recipientIds = getInternalStaffIds(users).filter((uid) => uid !== userId)
  await Promise.all(
    recipientIds.map((recipientId) =>
      createNotification({
        userId: recipientId,
        type: 'new_client',
        message,
        actorName: userName,
        entityType: 'client',
        entityId: id,
      })
    )
  )

  return id
}

export async function updateClient(
  id: string,
  data: Partial<Client>,
  userId: string,
  userName: string
) {
  await base.update(id, data, userId)
  await logActivity({
    entityType: 'client',
    entityId: id,
    clientId: id,
    action: 'updated',
    message: 'atualizou os dados do cliente',
    userId,
    userName,
  })
}

/** Firestore caps a batch at 500 writes — commit in chunks so deleting a
 *  long-lived client (years of recurring tasks + weekly content) never fails
 *  the whole cascade. The client doc goes last, so a mid-cascade failure
 *  leaves the client visible (recoverable) rather than a ghost with missing
 *  children. */
const BATCH_LIMIT = 400

async function commitDeletesInChunks(refs: DocumentReference[]) {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref)
    await batch.commit()
  }
}

/** Deletes a client and cascades to everything that references it — Firestore
 *  has no referential integrity, so orphans would otherwise linger (invisible
 *  in most of the UI, but still counted by code that queries a collection
 *  directly, and reports would keep showing "—" as the client).
 *
 *  Left untouched on purpose: activities/approvals/comments (the audit trail;
 *  their delete rules are admin-only and with the client gone they're already
 *  unreachable in the UI). */
export async function deleteClient(client: Client, userId: string, userName: string) {
  const [tasks, contents, calendarEvents, meetings, reports, files] = await Promise.all([
    getClientTasks(client.id),
    getClientContents(client.id),
    getClientCalendarEvents(client.id),
    getClientMeetings(client.id),
    getClientReports(client.id),
    getClientFiles(client.id),
  ])

  // Files carry a binary in Storage — remove those individually (Storage +
  // metadata doc), not via the Firestore batch. Best-effort per file.
  await Promise.all(
    files.map((f) => deleteFile(f).catch((err) => console.error('Falha ao remover arquivo do cliente', err)))
  )

  await commitDeletesInChunks([
    ...tasks.map((t) => doc(db, 'tasks', t.id)),
    ...contents.map((c) => doc(db, 'contents', c.id)),
    ...calendarEvents.map((e) => doc(db, 'calendarEvents', e.id)),
    ...meetings.map((m) => doc(db, 'meetings', m.id)),
    ...reports.map((r) => doc(db, 'reports', r.id)),
    doc(db, 'clients', client.id),
  ])

  await logActivity({
    entityType: 'client',
    entityId: client.id,
    clientId: client.id,
    action: 'deleted',
    message: `excluiu o cliente "${client.companyName}" (${tasks.length} tarefa(s), ${contents.length} conteúdo(s), ${calendarEvents.length} evento(s), ${meetings.length} reunião(ões), ${reports.length} relatório(s) e ${files.length} arquivo(s) removidos junto)`,
    userId,
    userName,
  })
  await notifyAdminsOfAction({
    type: 'client_deleted',
    message: `${userName} excluiu o cliente "${client.companyName}"`,
    actorId: userId,
    actorName: userName,
    entityType: 'client',
  })
}

export function getClient(id: string) {
  return base.getById(id)
}

export function subscribeClients(
  onData: (items: Client[]) => void,
  filters?: { status?: string },
  onError?: (err: FirestoreError) => void
) {
  const constraints: QueryConstraint[] = [orderBy('companyName', 'asc')]
  if (filters?.status) constraints.unshift(where('status', '==', filters.status))
  return base.subscribe(constraints, onData, onError)
}

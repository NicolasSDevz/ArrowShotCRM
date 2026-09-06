import { orderBy, where, getDocs, query, type QueryConstraint, type FirestoreError } from 'firebase/firestore'
import { format } from 'date-fns'
import type { AppUser, Content, ContentStatus } from '../types'
import { collectionService } from './firestore'
import { logActivity } from './activityService'
import { createNotification, notifyAdminsOfAction } from './notificationService'
import { getClientName } from './clientLookup'
import { findUserIdByName } from '../utils/userLookup'
import { CONTENT_STATUS_LABEL, CONTENT_FORMAT_LABEL, CONTENT_TYPE_LABEL } from '../types/content'

/** Content statuses the platform owner is CC'd on (see spec / notifyAdminsOfAction). */
const NOTABLE_CONTENT_STATUSES: ContentStatus[] = ['waiting_client', 'approved', 'published']

const COLLECTION = 'contents'
const base = collectionService<Content>(COLLECTION)

export async function createContent(
  data: Omit<Content, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
  userId: string,
  userName: string,
  opts?: { skipAdminCc?: boolean }
) {
  const id = await base.create(data, userId)
  await logActivity({
    entityType: 'content',
    entityId: id,
    clientId: data.clientId,
    action: 'created',
    message: `criou o conteúdo "${data.title}"`,
    userId,
    userName,
  })
  // `skipAdminCc` for the bulk paths (gerar pauta, importar calendário) —
  // those fire one summary notification instead of one per card.
  if (!opts?.skipAdminCc) {
    const clientName = await getClientName(data.clientId)
    await notifyAdminsOfAction({
      type: 'content_created',
      message: `${userName} criou o conteúdo "${data.title}"${clientName ? ` — ${clientName}` : ''}`,
      actorId: userId,
      actorName: userName,
      entityType: 'content',
      entityId: id,
    })
  }
  return id
}

export async function updateContent(id: string, data: Partial<Content>, userId: string, userName: string) {
  await base.update(id, data, userId)
  await logActivity({
    entityType: 'content',
    entityId: id,
    clientId: data.clientId,
    action: 'updated',
    message: 'atualizou o conteúdo',
    userId,
    userName,
  })
  if (data.status && NOTABLE_CONTENT_STATUSES.includes(data.status)) {
    const full = await getContent(id)
    const clientName = await getClientName(full?.clientId ?? data.clientId)
    await notifyAdminsOfAction({
      type: data.status === 'published' ? 'content_published' : data.status === 'approved' ? 'content_approved' : 'content_review_requested',
      message: `${userName} moveu o conteúdo "${full?.title ?? ''}" para "${CONTENT_STATUS_LABEL[data.status]}"${clientName ? ` — ${clientName}` : ''}`,
      actorId: userId,
      actorName: userName,
      entityType: 'content',
      entityId: id,
    })
  }
}

/** `notify`, when given, fires the internal review notifications (6 e 7 do
 *  sistema de notificações): moving to "Aguardando Cliente" pings Ciane for
 *  review, moving to "Aprovado" pings Nicolas that it's ready to schedule.
 *  Optional — callers without the client name / users list handy just skip
 *  the notification, the status change itself is unaffected. */
export async function moveContentStatus(
  content: Content,
  newStatus: ContentStatus,
  newOrder: number,
  userId: string,
  userName: string,
  notify?: { clientName: string; users: AppUser[] }
) {
  await base.update(content.id, { status: newStatus, order: newOrder }, userId)
  if (newStatus !== content.status) {
    await logActivity({
      entityType: 'content',
      entityId: content.id,
      clientId: content.clientId,
      action: 'status_changed',
      message: `moveu de "${CONTENT_STATUS_LABEL[content.status]}" para "${CONTENT_STATUS_LABEL[newStatus]}"`,
      userId,
      userName,
    })

    if (notify) {
      const formatLabel = CONTENT_FORMAT_LABEL[content.type] ?? CONTENT_TYPE_LABEL[content.type]
      const dateLabel = content.scheduledDate ? format(content.scheduledDate.toDate(), 'dd/MM/yyyy') : 'sem data definida'

      if (newStatus === 'waiting_client') {
        const cianeId = findUserIdByName(notify.users, 'Ciane')
        if (cianeId && cianeId !== userId) {
          await createNotification({
            userId: cianeId,
            type: 'content_review_requested',
            message: `🎨 Conteúdo aguardando sua revisão — ${notify.clientName}\n"${content.title}" — ${formatLabel} — ${dateLabel}`,
            actorName: userName,
            entityType: 'content',
            entityId: content.id,
          })
        }
      } else if (newStatus === 'approved') {
        const nicolasId = findUserIdByName(notify.users, 'Nicolas')
        if (nicolasId && nicolasId !== userId) {
          await createNotification({
            userId: nicolasId,
            type: 'content_ready_to_schedule',
            message: `✅ Conteúdo aprovado — ${notify.clientName}\n"${content.title}" está pronto para agendar`,
            actorName: userName,
            entityType: 'content',
            entityId: content.id,
          })
        }
      }
    }

    if (NOTABLE_CONTENT_STATUSES.includes(newStatus)) {
      const clientName = notify?.clientName ?? (await getClientName(content.clientId))
      await notifyAdminsOfAction({
        type: newStatus === 'published' ? 'content_published' : newStatus === 'approved' ? 'content_approved' : 'content_review_requested',
        message: `${userName} moveu o conteúdo "${content.title}" para "${CONTENT_STATUS_LABEL[newStatus]}"${clientName ? ` — ${clientName}` : ''}`,
        actorId: userId,
        actorName: userName,
        entityType: 'content',
        entityId: content.id,
      })
    }
  }
}

export async function deleteContent(content: Content, userId: string, userName: string) {
  await base.remove(content.id)
  await logActivity({
    entityType: 'content',
    entityId: content.id,
    clientId: content.clientId,
    action: 'deleted',
    message: `excluiu o conteúdo "${content.title}"`,
    userId,
    userName,
  })
}

export function getContent(id: string) {
  return base.getById(id)
}

export interface ContentFilters {
  clientId?: string
  status?: ContentStatus
  platform?: string
}

export function subscribeContents(
  onData: (items: Content[]) => void,
  filters: ContentFilters = {},
  onError?: (err: FirestoreError) => void
) {
  const constraints: QueryConstraint[] = []
  if (filters.clientId) constraints.push(where('clientId', '==', filters.clientId))
  if (filters.status) constraints.push(where('status', '==', filters.status))
  if (filters.platform) constraints.push(where('platform', '==', filters.platform))
  constraints.push(orderBy('order', 'asc'))
  return base.subscribe(constraints, onData, onError)
}

// Ordered by createdAt, not scheduledDate: Firestore's orderBy silently drops
// documents that don't have the sorted field at all, and freshly created
// content has no scheduledDate yet — it would vanish from every "all contents"
// view (Social Media board, Dashboard, Calendar) until someone set a date.
export function subscribeAllContents(onData: (items: Content[]) => void, onError?: (err: FirestoreError) => void) {
  return base.subscribe([orderBy('createdAt', 'asc')], onData, onError)
}

/** One-shot fetch (not a live listener) — used by side-effects like the
 *  client-deletion cascade, which needs a snapshot to batch-delete. */
export async function getClientContents(clientId: string): Promise<Content[]> {
  const snap = await getDocs(query(base.colRef, where('clientId', '==', clientId)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Content)
}

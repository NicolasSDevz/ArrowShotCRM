import { collection, addDoc, where, orderBy, serverTimestamp, type FirestoreError } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { Approval, Content } from '../types'
import { collectionService } from './firestore'
import { logActivity } from './activityService'
import { updateContent } from './contentService'
import { createNotification } from './notificationService'
import { getClient } from './clientService'

const COLLECTION = 'approvals'
const base = collectionService<Approval>(COLLECTION)

export async function approveContent(content: Content, userId: string, userName: string, comment?: string) {
  await addDoc(collection(db, COLLECTION), {
    contentId: content.id,
    clientId: content.clientId,
    action: 'approved',
    comment: comment ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  })

  await updateContent(content.id, { status: 'approved' }, userId, userName)

  await logActivity({
    entityType: 'content',
    entityId: content.id,
    clientId: content.clientId,
    action: 'approved',
    message: 'aprovou o conteúdo',
    userId,
    userName,
  })

  if (content.assignedTo && content.assignedTo !== userId) {
    await createNotification({
      userId: content.assignedTo,
      type: 'content_approved',
      message: `${userName} aprovou o conteúdo "${content.title}"`,
      entityType: 'content',
      entityId: content.id,
    })
  }
}

export async function requestContentChange(
  content: Content,
  userId: string,
  userName: string,
  comment: string
) {
  await addDoc(collection(db, COLLECTION), {
    contentId: content.id,
    clientId: content.clientId,
    action: 'change_requested',
    comment,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  })

  await updateContent(content.id, { status: 'production' }, userId, userName)

  await logActivity({
    entityType: 'content',
    entityId: content.id,
    clientId: content.clientId,
    action: 'change_requested',
    message: `solicitou alteração: "${comment.slice(0, 80)}${comment.length > 80 ? '…' : ''}"`,
    userId,
    userName,
  })

  if (content.assignedTo && content.assignedTo !== userId) {
    await createNotification({
      userId: content.assignedTo,
      type: 'change_requested',
      message: `${userName} pediu alteração em "${content.title}"`,
      entityType: 'content',
      entityId: content.id,
    })
  }
}

/** Turns on the public approval link for this content. The link itself
 *  (unguessable content id + token) is the access control — see the "public
 *  shareable read" branch in firestore.rules. */
export async function generateApprovalLink(
  content: Content,
  userId: string,
  userName: string,
  /** Internal ids to notify when the client acts on the link — owner/admin +
   *  assignee. Captured here because the public page can't read `users`. */
  notifyUserIds: string[] = []
) {
  const token = crypto.randomUUID()
  const client = await getClient(content.clientId)
  const ids = Array.from(new Set([...notifyUserIds, ...(content.assignedTo ? [content.assignedTo] : [])]))
  await updateContent(
    content.id,
    { approvalToken: token, clientNameSnapshot: client?.companyName ?? '', approvalNotifyUserIds: ids },
    userId,
    userName
  )
  return `${window.location.origin}/aprovar/${content.id}/${token}`
}

export async function revokeApprovalLink(content: Content, userId: string, userName: string) {
  await updateContent(content.id, { approvalToken: null }, userId, userName)
}

export function subscribeApprovals(
  contentId: string,
  onData: (items: Approval[]) => void,
  onError?: (err: FirestoreError) => void
) {
  return base.subscribe([where('contentId', '==', contentId), orderBy('createdAt', 'desc')], onData, onError)
}

import { orderBy, where, getDocs, query, type QueryConstraint, type FirestoreError } from 'firebase/firestore'
import { format } from 'date-fns'
import type { Meeting, MeetingActionItem, MeetingInput } from '../types'
import { MEETING_TYPE_LABEL } from '../types/meeting'
import { collectionService } from './firestore'
import { logActivity } from './activityService'
import { createTask } from './taskService'
import { notifyAdminsOfAction } from './notificationService'
import { getClientName } from './clientLookup'
import { isClientMeetingType } from '../types/meeting'

const COLLECTION = 'meetings'
const base = collectionService<Meeting>(COLLECTION)

/** Turns every not-yet-materialized action item (no `taskId` yet) into a
 *  real task, linked back via `taskId` on the item itself — called right
 *  before writing the meeting doc, so the ids get saved together. Items
 *  that already have a `taskId` (editing a previously saved meeting) or an
 *  empty description are left untouched — re-saving never duplicates
 *  tasks. */
async function materializeActionItems(
  items: MeetingActionItem[],
  meetingDate: Meeting['date'],
  clientId: string | undefined,
  userId: string,
  userName: string
): Promise<MeetingActionItem[]> {
  const dateLabel = format(meetingDate.toDate(), 'dd/MM/yyyy')
  const result: MeetingActionItem[] = []
  for (const item of items) {
    const description = item.description.trim()
    if (item.taskId || !description) {
      result.push(item)
      continue
    }
    const taskId = await createTask(
      {
        title: description,
        description: `Originada da reunião de ${dateLabel}`,
        clientId,
        assignedTo: item.assignedTo,
        dueDate: item.dueDate ?? null,
        priority: 'normal',
        status: 'todo',
        checklist: [],
        order: Date.now(),
      },
      userId,
      userName,
      { skipAdminCc: true } // covered by the meeting_created notification below
    )
    result.push({ ...item, taskId })
  }
  return result
}

export async function createMeeting(data: MeetingInput, userId: string, userName: string) {
  const actionItems = await materializeActionItems(data.actionItems, data.date, data.clientId, userId, userName)
  const id = await base.create({ ...data, actionItems }, userId)
  await logActivity({
    entityType: 'meeting',
    entityId: id,
    clientId: data.clientId,
    action: 'created',
    message: `registrou a reunião "${MEETING_TYPE_LABEL[data.type]}"`,
    userId,
    userName,
  })
  const clientName = data.clientId ? await getClientName(data.clientId) : ''
  const suffix = clientName ? ` — ${clientName}` : ''
  const verb = isClientMeetingType(data.type) ? 'agendou a reunião com cliente' : 'registrou a reunião'
  await notifyAdminsOfAction({
    type: 'meeting_created',
    message: `${userName} ${verb}: ${MEETING_TYPE_LABEL[data.type]}${suffix}`,
    actorId: userId,
    actorName: userName,
    entityType: 'meeting',
    entityId: id,
  })
  return id
}

export async function updateMeeting(id: string, data: MeetingInput, userId: string, userName: string) {
  const actionItems = await materializeActionItems(data.actionItems, data.date, data.clientId, userId, userName)
  await base.update(id, { ...data, actionItems }, userId)
  await logActivity({
    entityType: 'meeting',
    entityId: id,
    clientId: data.clientId,
    action: 'updated',
    message: 'atualizou o registro da reunião',
    userId,
    userName,
  })
}

export async function deleteMeeting(meeting: Meeting, userId: string, userName: string) {
  await base.remove(meeting.id)
  await logActivity({
    entityType: 'meeting',
    entityId: meeting.id,
    clientId: meeting.clientId,
    action: 'deleted',
    message: `excluiu o registro da reunião de ${format(meeting.date.toDate(), 'dd/MM/yyyy')}`,
    userId,
    userName,
  })
}

export function getMeeting(id: string) {
  return base.getById(id)
}

export function subscribeAllMeetings(onData: (items: Meeting[]) => void, onError?: (err: FirestoreError) => void) {
  return base.subscribe([orderBy('date', 'desc')], onData, onError)
}

export function subscribeClientMeetings(
  clientId: string,
  onData: (items: Meeting[]) => void,
  onError?: (err: FirestoreError) => void
) {
  const constraints: QueryConstraint[] = [where('clientId', '==', clientId), orderBy('date', 'desc')]
  return base.subscribe(constraints, onData, onError)
}

/** One-shot fetch — used by the client-deletion cascade so meetings tied to
 *  a deleted client don't linger forever pointing at a clientId that no
 *  longer exists. */
export async function getClientMeetings(clientId: string): Promise<Meeting[]> {
  const snap = await getDocs(query(base.colRef, where('clientId', '==', clientId)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Meeting)
}

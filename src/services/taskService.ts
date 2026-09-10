import { orderBy, where, getDocs, query, Timestamp, type QueryConstraint, type FirestoreError } from 'firebase/firestore'
import { addDays, startOfDay, isBefore, isSameDay, format } from 'date-fns'
import type { Client, Task, TaskStatus } from '../types'
import { collectionService } from './firestore'
import { logActivity } from './activityService'
import { createNotification, notifyAdminsOfAction } from './notificationService'
import { getClientName } from './clientLookup'
import { getClientOwnerIds } from '../types/client'
import { nextRecurrenceDate, type ChecklistItem } from '../types/task'

const HIGH_PRIORITIES: Task['priority'][] = ['high', 'urgent']

const COLLECTION = 'tasks'
const base = collectionService<Task>(COLLECTION)

export async function createTask(
  data: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
  userId: string,
  userName: string,
  opts?: { skipAdminCc?: boolean }
) {
  const id = await base.create(data, userId)
  await logActivity({
    entityType: 'task',
    entityId: id,
    clientId: data.clientId,
    action: 'created',
    message: `criou a tarefa "${data.title}"`,
    userId,
    userName,
  })
  if (data.assignedTo && data.assignedTo !== userId) {
    await createNotification({
      userId: data.assignedTo,
      type: 'task_assigned',
      message: `${userName} atribuiu a tarefa "${data.title}" a você`,
      entityType: 'task',
      entityId: id,
    })
  }
  // `skipAdminCc` for the bulk/auto paths (onboarding workflow, meeting action
  // items) — those already produce their own summary notification.
  if (!opts?.skipAdminCc) {
    const clientName = await getClientName(data.clientId)
    const suffix = clientName ? ` — ${clientName}` : ''
    const high = HIGH_PRIORITIES.includes(data.priority) ? ' (prioridade Alta)' : ''
    await notifyAdminsOfAction({
      type: 'task_created',
      message: `${userName} criou a tarefa "${data.title}"${high}${suffix}`,
      actorId: userId,
      actorName: userName,
      entityType: 'task',
      entityId: id,
      alreadyNotified: data.assignedTo ? [data.assignedTo] : [],
    })
  }
  return id
}

export async function updateTask(id: string, data: Partial<Task>, userId: string, userName: string) {
  await base.update(id, data, userId)
  await logActivity({
    entityType: 'task',
    entityId: id,
    clientId: data.clientId,
    action: 'updated',
    message: 'atualizou a tarefa',
    userId,
    userName,
  })
  if (data.assignedTo && data.assignedTo !== userId) {
    await createNotification({
      userId: data.assignedTo,
      type: 'task_assigned',
      message: data.title
        ? `${userName} atribuiu a tarefa "${data.title}" a você`
        : `${userName} atribuiu uma tarefa a você`,
      entityType: 'task',
      entityId: id,
    })
  }
  // Owner CC: only for the changes the spec calls out — priority raised to
  // Alta/Urgente. "Concluída" is covered by notifyTaskCompleted.
  if (data.priority && HIGH_PRIORITIES.includes(data.priority)) {
    const full = await getTask(id)
    const clientName = await getClientName(full?.clientId)
    const suffix = clientName ? ` — ${clientName}` : ''
    await notifyAdminsOfAction({
      type: 'task_updated',
      message: `${userName} definiu prioridade Alta na tarefa "${full?.title ?? data.title ?? ''}"${suffix}`,
      actorId: userId,
      actorName: userName,
      entityType: 'task',
      entityId: id,
      alreadyNotified: data.assignedTo ? [data.assignedTo] : [],
    })
  }
}

/** No backend scheduler exists in this project (see recurrence comment on
 *  Task) — this is the manual stand-in: spawns the next occurrence as a fresh
 *  task, one day after this one's due date (or from today if it had none). */
export async function duplicateRecurringTask(task: Task, userId: string, userName: string) {
  if (!task.recurrence) return
  const after = task.dueDate ? addDays(task.dueDate.toDate(), 1) : new Date()
  const nextDueDate = Timestamp.fromDate(nextRecurrenceDate(task.recurrence, after))

  return createTask(
    {
      title: task.title,
      description: task.description,
      clientId: task.clientId,
      assignedTo: task.assignedTo,
      dueDate: nextDueDate,
      priority: task.priority,
      status: 'todo',
      checklist: (task.checklist ?? []).map((item) => ({ ...item, done: false })),
      order: Date.now(),
      recurrence: task.recurrence,
    },
    userId,
    userName
  )
}

export async function deleteTask(task: Task, userId: string, userName: string) {
  await base.remove(task.id)
  await logActivity({
    entityType: 'task',
    entityId: task.id,
    clientId: task.clientId,
    action: 'deleted',
    message: `excluiu a tarefa "${task.title}"`,
    userId,
    userName,
  })
}

export function getTask(id: string) {
  return base.getById(id)
}

/** Salva o checklist inteiro da tarefa. É um update PONTUAL (só o campo
 *  `checklist` + `updatedAt`/`updatedBy` que o collectionService acrescenta) —
 *  nunca sobrescreve o documento. O Firestore não permite endereçar um item
 *  do array por caminho, então gravamos o array completo, que é o correto.
 *  Propaga o erro para o chamador (a UI reverte o checkbox e mostra um toast)
 *  em vez de deixar a falha passar silenciosa. */
export async function setTaskChecklist(taskId: string, checklist: ChecklistItem[], userId: string) {
  await base.update(taskId, { checklist }, userId)
}

export interface TaskFilters {
  clientId?: string
  assignedTo?: string
  status?: TaskStatus
}

export function subscribeTasks(
  onData: (items: Task[]) => void,
  filters: TaskFilters = {},
  onError?: (err: FirestoreError) => void
) {
  const constraints: QueryConstraint[] = []
  if (filters.clientId) constraints.push(where('clientId', '==', filters.clientId))
  if (filters.assignedTo) constraints.push(where('assignedTo', '==', filters.assignedTo))
  if (filters.status) constraints.push(where('status', '==', filters.status))
  constraints.push(orderBy('order', 'asc'))
  return base.subscribe(constraints, onData, onError)
}

/** All tasks, for the dashboard which buckets today/overdue/upcoming client-side
 *  (avoids a composite range-query index just for a summary view). */
export function subscribeAllTasks(onData: (items: Task[]) => void, onError?: (err: FirestoreError) => void) {
  return base.subscribe([orderBy('dueDate', 'asc')], onData, onError)
}

/** One-shot fetch (not a live listener) — used by side-effects that just need
 *  a snapshot at a point in time, like marking a checklist item on save. */
export async function getClientTasks(clientId: string): Promise<Task[]> {
  const snap = await getDocs(query(base.colRef, where('clientId', '==', clientId)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Task)
}

/** Called after the Briefing Comercial is saved: finds any not-yet-done
 *  checklist item mentioning "briefing" across the client's tasks (covers
 *  both the Social Media Ativação item and the Tráfego Pago Briefing e
 *  Acessos ones) and checks it off. */
export async function markBriefingChecklistDone(clientId: string, userId: string, userName: string) {
  const tasks = await getClientTasks(clientId)
  for (const task of tasks) {
    const checklist = task.checklist ?? []
    let changed = false
    const updated = checklist.map((item) => {
      if (!item.done && item.text.toLowerCase().includes('briefing')) {
        changed = true
        return { ...item, done: true }
      }
      return item
    })
    if (changed) {
      await updateTask(task.id, { checklist: updated }, userId, userName)
    }
  }
}

/** Called right after a task tied to a client is marked "done" — notifies
 *  the client's responsável(is) (ownerIds), skipping whoever just completed
 *  it if they're one of them. */
export async function notifyTaskCompleted(
  task: Pick<Task, 'id' | 'title'>,
  client: Pick<Client, 'companyName' | 'ownerIds' | 'ownerId'> | undefined,
  userId: string,
  userName: string
) {
  const recipientIds = client ? getClientOwnerIds(client).filter((id) => id !== userId) : []
  const message = `✅ ${userName} concluiu "${task.title}"${client?.companyName ? ` — ${client.companyName}` : ''}`
  await Promise.all(
    recipientIds.map((recipientId) =>
      createNotification({
        userId: recipientId,
        type: 'task_completed',
        message,
        actorName: userName,
        entityType: 'task',
        entityId: task.id,
      })
    )
  )
  await notifyAdminsOfAction({
    type: 'task_completed',
    message,
    actorId: userId,
    actorName: userName,
    entityType: 'task',
    entityId: task.id,
    alreadyNotified: recipientIds,
  })
}

/** Client-side stand-in for a backend cron (see overdueNotifiedAt/
 *  reminderNotifiedAt on Task): scans every open task with a due date and
 *  fires "tarefa atrasada" (past due) or "lembrete" (due tomorrow)
 *  notifications to its responsável, at most once each. Safe to call
 *  repeatedly — already-notified tasks are skipped — and from multiple
 *  teammates' sessions, since it's idempotent per task. */
export async function runTaskDueDateSweep(
  tasks: Task[],
  clientNameById: Record<string, string | undefined>,
  currentUserId: string
) {
  const today = startOfDay(new Date())
  const tomorrow = addDays(today, 1)

  for (const task of tasks) {
    if (!task.dueDate || !task.assignedTo || task.status === 'done') continue
    const due = startOfDay(task.dueDate.toDate())
    const clientName = task.clientId ? clientNameById[task.clientId] : undefined
    const clientSuffix = clientName ? ` — ${clientName}` : ''

    if (isBefore(due, today)) {
      if (task.overdueNotifiedAt) continue
      const message = `⚠️ Tarefa atrasada: "${task.title}"${clientSuffix}\nVenceu em ${format(due, 'dd/MM/yyyy')}`
      await createNotification({
        userId: task.assignedTo,
        type: 'task_overdue',
        message,
        entityType: 'task',
        entityId: task.id,
      })
      await notifyAdminsOfAction({
        type: 'task_overdue',
        message,
        actorId: '',
        actorName: '',
        entityType: 'task',
        entityId: task.id,
        alreadyNotified: [task.assignedTo],
      })
      await base.update(task.id, { overdueNotifiedAt: Timestamp.now() }, currentUserId)
      continue
    }

    if (isSameDay(due, tomorrow) && !task.reminderNotifiedAt) {
      const reminderMsg = `🔔 Lembrete: "${task.title}" vence amanhã${clientSuffix}`
      await notifyAdminsOfAction({
        type: 'task_reminder',
        message: reminderMsg,
        actorId: '',
        actorName: '',
        entityType: 'task',
        entityId: task.id,
        alreadyNotified: [task.assignedTo],
      })
      await createNotification({
        userId: task.assignedTo,
        type: 'task_reminder',
        message: reminderMsg,
        entityType: 'task',
        entityId: task.id,
      })
      await base.update(task.id, { reminderNotifiedAt: Timestamp.now() }, currentUserId)
    }
  }
}

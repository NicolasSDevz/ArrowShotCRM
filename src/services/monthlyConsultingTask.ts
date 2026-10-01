import { doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore'
import { endOfMonth, format, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { db } from '../firebase/config'
import { setTaskChecklist } from './taskService'
import { logActivity } from './activityService'
import { createNotification } from './notificationService'
import { findUserIdByName } from '../utils/userLookup'
import type { AppUser } from '../types/user'
import type { Client } from '../types/client'
import type { Meeting } from '../types/meeting'
import type { ChecklistItem, Task } from '../types/task'

/** Tarefa mensal "Consultorias do mês" do Jamilson (CS): um checklist com
 *  duas linhas por cliente ativo — consultoria agendada / consultoria
 *  realizada — marcadas sozinhas a partir das reuniões do tipo "Consultoria
 *  Mensal" (Calendário → Reuniões). Não existe backend agendado neste
 *  projeto (ver useTaskDueDateSweep), então quem cria e sincroniza é o
 *  navegador de qualquer pessoa da equipe com o CRM aberto. O id do doc é
 *  fixo por mês (`consultorias-AAAA-MM`) e a criação roda numa transação —
 *  várias abas abertas ao mesmo tempo nunca duplicam a tarefa. */

const TASK_ID_PREFIX = 'consultorias-'

export function monthlyConsultingTaskId(month: Date): string {
  return `${TASK_ID_PREFIX}${format(month, 'yyyy-MM')}`
}

export function isMonthlyConsultingTask(task: Pick<Task, 'id'>): boolean {
  return task.id.startsWith(TASK_ID_PREFIX)
}

function monthLabel(month: Date): string {
  const s = format(month, "MMMM'/'yyyy", { locale: ptBR })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Data/hora real da reunião — `date` vem à meia-noite e `time` ("HH:mm") é
 *  opcional; sem hora, conta como realizada a partir do próprio dia. */
function meetingDateTime(meeting: Meeting): Date {
  const d = meeting.date.toDate()
  if (meeting.time && /^\d{1,2}:\d{2}$/.test(meeting.time)) {
    const [h, m] = meeting.time.split(':').map(Number)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m)
  }
  return d
}

export interface ConsultingStatusRow {
  client: Client
  /** Reunião de Consultoria Mensal do mês (a realizada, se houver; senão a próxima). */
  meeting?: Meeting
  meetingAt?: Date
  scheduled: boolean
  done: boolean
}

/** Clientes que entram no controle de consultorias — só os ativos. */
export function consultingClients(clients: Client[]): Client[] {
  return clients
    .filter((c) => c.status === 'active')
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'pt-BR'))
}

/** Situação da consultoria de cada cliente ativo no mês — usada tanto pela
 *  tarefa do Jamilson quanto pelo widget do Bruno (mesma regra nos dois). */
export function getConsultingStatus(clients: Client[], meetings: Meeting[], month: Date, now = new Date()): ConsultingStatusRow[] {
  const monthMeetings = meetings.filter(
    (m) => m.type === 'monthly_consulting' && m.clientId && m.date && isSameMonth(m.date.toDate(), month)
  )
  return consultingClients(clients).map((client) => {
    const mine = monthMeetings
      .filter((m) => m.clientId === client.id)
      .map((m) => ({ m, at: meetingDateTime(m) }))
      .sort((a, b) => a.at.getTime() - b.at.getTime())
    const done = mine.filter((x) => x.at.getTime() <= now.getTime())
    const pick = done.length ? done[done.length - 1] : mine[0]
    return {
      client,
      meeting: pick?.m,
      meetingAt: pick?.at,
      scheduled: mine.length > 0,
      done: done.length > 0,
    }
  })
}

const scheduledItemId = (clientId: string) => `consultoria-agendada-${clientId}`
const doneItemId = (clientId: string) => `consultoria-realizada-${clientId}`
const AUTO_ITEM_PREFIXES = ['consultoria-agendada-', 'consultoria-realizada-']

/** Monta o checklist sincronizado. Regras:
 *  - itens marcados à mão continuam marcados (a sincronização só marca);
 *  - cliente que virou ativo no meio do mês ganha as duas linhas;
 *  - cliente que deixou de ser ativo perde as linhas que ainda não foram
 *    marcadas (as marcadas ficam como histórico);
 *  - itens adicionados à mão pelo Jamilson são preservados no fim. */
function buildChecklist(rows: ConsultingStatusRow[], existing: ChecklistItem[]): ChecklistItem[] {
  const byId = new Map(existing.map((item) => [item.id, item]))
  const result: ChecklistItem[] = []
  const used = new Set<string>()

  for (const row of rows) {
    const name = row.client.companyName
    const entries: [string, string, boolean][] = [
      [scheduledItemId(row.client.id), `${name} — consultoria agendada`, row.scheduled],
      [doneItemId(row.client.id), `${name} — consultoria realizada`, row.done],
    ]
    for (const [id, text, auto] of entries) {
      const prev = byId.get(id)
      result.push({ id, text, done: (prev?.done ?? false) || auto })
      used.add(id)
    }
  }

  for (const item of existing) {
    if (used.has(item.id)) continue
    const isAuto = AUTO_ITEM_PREFIXES.some((p) => item.id.startsWith(p))
    if (isAuto && !item.done) continue
    result.push(item)
  }
  return result
}

function sameChecklist(a: ChecklistItem[], b: ChecklistItem[]): boolean {
  if (a.length !== b.length) return false
  return a.every((item, i) => item.id === b[i].id && item.text === b[i].text && item.done === b[i].done)
}

function resolveJamilsonId(users: AppUser[]): string | undefined {
  return findUserIdByName(users, 'Jamilson') ?? findUserIdByName(users, 'Janilson')
}

/** Cria a tarefa do mês se ainda não existir. Transação: se outra aba criou
 *  primeiro, não faz nada. Retorna true só quando foi esta chamada que criou. */
async function ensureMonthTask(month: Date, checklist: ChecklistItem[], assignedTo: string, userId: string): Promise<boolean> {
  const ref = doc(db, 'tasks', monthlyConsultingTaskId(month))
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists()) return false
    tx.set(ref, {
      title: `Consultorias do mês — ${monthLabel(month)}`,
      description:
        'Tarefa automática. Confira se cada cliente ativo já tem a Consultoria Mensal agendada e se ela foi realizada. ' +
        'Os itens se marcam sozinhos quando a reunião do tipo "Consultoria Mensal" é registrada em Reuniões ' +
        '(agendada = existe reunião no mês; realizada = a data/hora da reunião já passou).',
      assignedTo,
      dueDate: Timestamp.fromDate(endOfMonth(month)),
      priority: 'normal',
      status: 'todo',
      checklist,
      order: Date.now(),
      board: 'cs',
      recurrence: null,
      workflowStep: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: userId,
      updatedBy: userId,
    })
    return true
  })
}

export interface MonthlyConsultingSyncInput {
  clients: Client[]
  meetings: Meeting[]
  tasks: Task[]
  users: AppUser[]
  userId: string
  userName: string
  now?: Date
}

/** Garante a tarefa do mês atual e mantém o checklist dela (e o do mês
 *  anterior, enquanto não estiver concluída) em dia com as reuniões.
 *  Só grava quando algo realmente mudou. */
export async function syncMonthlyConsultingTask({ clients, meetings, tasks, users, userId, userName, now = new Date() }: MonthlyConsultingSyncInput) {
  const jamilsonId = resolveJamilsonId(users)
  if (!jamilsonId) return // Jamilson ainda sem conta no CRM — nada a criar

  const current = startOfMonth(now)
  const months = [subMonths(current, 1), current]

  for (const month of months) {
    const id = monthlyConsultingTaskId(month)
    const task = tasks.find((t) => t.id === id)
    const rows = getConsultingStatus(clients, meetings, month, now)

    if (!task) {
      // Só o mês atual é criado — mês anterior sem tarefa fica como está.
      if (month !== current) continue
      const checklist = buildChecklist(rows, [])
      const created = await ensureMonthTask(month, checklist, jamilsonId, userId)
      if (created) {
        const title = `Consultorias do mês — ${monthLabel(month)}`
        await logActivity({ entityType: 'task', entityId: id, action: 'created', message: `criou a tarefa "${title}"`, userId, userName })
        if (jamilsonId !== userId) {
          await createNotification({
            userId: jamilsonId,
            type: 'task_assigned',
            message: `Nova tarefa do mês: "${title}" — confira o agendamento das consultorias`,
            entityType: 'task',
            entityId: id,
          })
        }
      }
      continue
    }

    if (task.status === 'done') continue
    const next = buildChecklist(rows, task.checklist ?? [])
    if (!sameChecklist(next, task.checklist ?? [])) {
      await setTaskChecklist(task.id, next, userId)
    }
  }
}

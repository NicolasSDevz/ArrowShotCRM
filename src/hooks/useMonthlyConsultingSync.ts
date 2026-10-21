import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAllTasks } from './useTasks'
import { useClients } from './useClients'
import { useAllMeetings } from './useMeetings'
import { useUsers } from './useUsers'
import { useNotifications } from './useNotifications'
import { startOfMonth } from 'date-fns'
import {
  consultingReminderId,
  getConsultingStatus,
  isConsultingReminderDay,
  monthlyConsultingTaskId,
  pendingConsultingMessage,
  resolveConsultingOwnerId,
  syncMonthlyConsultingTask,
} from '../services/monthlyConsultingTask'
import { upsertOwnNotification } from '../services/notificationService'

/** Mounted once in AppLayout, ao lado de useTaskDueDateSweep — cria a tarefa
 *  "Consultorias do mês" do Jamilson e mantém o checklist dela em dia com as
 *  reuniões de Consultoria Mensal (ver monthlyConsultingTask.ts). Roda de
 *  novo sempre que tarefas/clientes/reuniões mudam; a sincronização só grava
 *  quando há diferença, então não entra em loop com o próprio listener. */
export function useMonthlyConsultingSync() {
  const { profile } = useAuth()
  const tasks = useAllTasks()
  const clients = useClients()
  const meetings = useAllMeetings()
  const users = useUsers()
  const { notifications, loading: notificationsLoading } = useNotifications(profile?.id)
  const running = useRef(false)
  const pending = useRef(false)
  const latest = useRef<() => Promise<void>>(async () => {})

  const ready =
    !!profile &&
    !tasks.loading &&
    !clients.loading &&
    !meetings.loading &&
    !users.loading &&
    !tasks.error &&
    !clients.error &&
    !meetings.error &&
    !users.error

  // Sempre com os dados mais recentes — usado pela repetição em `pending` abaixo.
  useEffect(() => {
    if (!profile) return
    latest.current = () =>
      syncMonthlyConsultingTask({
        clients: clients.data,
        meetings: meetings.data,
        tasks: tasks.data,
        users: users.data,
        userId: profile.id,
        userName: profile.name,
      })
  })

  useEffect(() => {
    if (!ready) return
    const run = async () => {
      if (running.current) {
        pending.current = true
        return
      }
      running.current = true
      try {
        do {
          pending.current = false
          await latest.current()
        } while (pending.current)
      } catch (err) {
        console.error('Falha ao sincronizar a tarefa de Consultorias do mês', err)
      } finally {
        running.current = false
      }
    }
    // Pequeno atraso: agrupa as rajadas de snapshots do Firestore numa só sincronização.
    const timer = setTimeout(run, 1500)
    return () => clearTimeout(timer)
  }, [ready, tasks.data, clients.data, meetings.data, users.data])

  // Aviso "Consultoria pendente" — só pro Jamilson (CS) e pros admins. Cada
  // um gera o próprio aviso quando abre o CRM, no máximo um por dia (id fixo
  // por pessoa e dia), nos dias de isConsultingReminderDay.
  const isRecipient =
    !!profile && (profile.role === 'admin' || profile.id === resolveConsultingOwnerId(users.data))
  const reminderId = profile ? consultingReminderId(profile.id) : ''
  const alreadySent = notifications.some((n) => n.id === reminderId)
  useEffect(() => {
    if (!ready || !profile || !isRecipient || notificationsLoading || alreadySent) return
    const now = new Date()
    if (!isConsultingReminderDay(now)) return
    const month = startOfMonth(now)
    const message = pendingConsultingMessage(getConsultingStatus(clients.data, meetings.data, month, now), month)
    if (!message) return
    const timer = setTimeout(() => {
      upsertOwnNotification(reminderId, {
        userId: profile.id,
        type: 'consulting_pending',
        message,
        entityType: 'task',
        entityId: monthlyConsultingTaskId(month),
      })
    }, 3000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isRecipient, notificationsLoading, alreadySent, reminderId])
}

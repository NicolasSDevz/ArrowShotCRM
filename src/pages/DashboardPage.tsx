import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, isPast, isToday, isWithinInterval, addDays, differenceInDays, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CheckCircle2, AlertTriangle, Clock, Pencil, CalendarDays, Plus } from 'lucide-react'
import { useAllTasks } from '../hooks/useTasks'
import { useAllContents } from '../hooks/useContents'
import { useClients } from '../hooks/useClients'
import { useAssigneeMap, type Assignee } from '../hooks/useAssignees'
import { EmptyState } from '../components/ui/EmptyState'
import { DashboardEmptyState } from '../components/dashboard/DashboardEmptyState'
import { DailyRoutineWidget } from '../components/dashboard/DailyRoutineWidget'
import { OptimizationsTodayWidget } from '../components/dashboard/OptimizationsTodayWidget'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { TaskDrawer } from '../components/tasks/TaskDrawer'
import { TaskFormModal } from '../components/tasks/TaskFormModal'
import { ContentDrawer } from '../components/content/ContentDrawer'
import { ContentFormModal } from '../components/content/ContentFormModal'
import { getClientOwnerIds } from '../types/client'
import { CONTENT_PILLAR_LABEL, CONTENT_PILLAR_COLOR, CONTENT_FORMAT_LABEL, CONTENT_TYPE_LABEL } from '../types/content'
import type { Task } from '../types/task'
import type { Content } from '../types/content'
import type { Client } from '../types/client'
import { useTaskVisibility, filterVisibleTasks } from '../utils/taskVisibility'

type ClientHealth = 'green' | 'yellow' | 'red'

const HEALTH_DOT: Record<ClientHealth, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  red: 'bg-red-500',
}

const HEALTH_LABEL: Record<ClientHealth, string> = {
  green: 'Tudo em dia',
  yellow: 'Atenção',
  red: 'Crítico',
}

const HEALTH_RANK: Record<ClientHealth, number> = { red: 0, yellow: 1, green: 2 }

/** Vermelho: 2+ tarefas atrasadas, ou 1 atrasada de prioridade alta/urgente.
 *  Amarelo: 1 tarefa atrasada, ou algum checklist incompleto há mais de 3 dias.
 *  Verde: nenhuma das condições acima. */
function getClientHealth(clientId: string, tasks: Task[]): ClientHealth {
  const openTasks = tasks.filter((t) => t.clientId === clientId && t.status !== 'done')
  const overdue = openTasks.filter((t) => t.dueDate && isPast(t.dueDate.toDate()) && !isToday(t.dueDate.toDate()))
  const overdueHighPriority = overdue.some((t) => t.priority === 'high' || t.priority === 'urgent')
  const staleChecklist = openTasks.some((t) => {
    if (!t.checklist?.length || t.checklist.every((i) => i.done)) return false
    return differenceInDays(new Date(), t.createdAt.toDate()) > 3
  })

  if (overdue.length >= 2 || overdueHighPriority) return 'red'
  if (overdue.length === 1 || staleChecklist) return 'yellow'
  return 'green'
}

function clientServiceLabel(client: Client) {
  const traffic = client.modules?.paidTraffic
  const social = client.modules?.socialMedia
  if (traffic && social) return 'Ambos'
  if (traffic) return 'Tráfego'
  if (social) return 'Social Mídia'
  return '—'
}

function ServicePill({ service }: { service: string }) {
  if (service === 'Tráfego') return <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">Tráfego</span>
  if (service === 'Social Mídia')
    return <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">Social Mídia</span>
  if (service === 'Ambos')
    return (
      <span className="rounded-full bg-gradient-to-r from-blue-100 to-violet-100 px-2.5 py-1 text-xs font-medium text-blue-700">
        Ambos
      </span>
    )
  return <span className="text-xs text-slate-400">—</span>
}

function daysAgoLabel(date: Date) {
  const n = differenceInDays(new Date(), date)
  if (n <= 0) return 'hoje'
  return `há ${n} dia${n === 1 ? '' : 's'}`
}

function dayGroupLabel(date: Date) {
  const s = format(date, 'EEE, dd MMM', { locale: ptBR })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

type WidgetKey = 'overdue' | 'today' | 'upcoming' | 'inProduction' | 'waitingApproval' | 'approved'

const WIDGET_STYLE: Record<WidgetKey, { border: string; iconBg: string; headerBg?: string }> = {
  overdue: { border: 'border-l-red-500', iconBg: 'bg-red-500', headerBg: 'bg-red-50' },
  today: { border: 'border-l-blue-500', iconBg: 'bg-blue-500' },
  upcoming: { border: 'border-l-amber-500', iconBg: 'bg-amber-500' },
  inProduction: { border: 'border-l-violet-500', iconBg: 'bg-violet-500' },
  waitingApproval: { border: 'border-l-amber-500', iconBg: 'bg-amber-500' },
  approved: { border: 'border-l-emerald-500', iconBg: 'bg-emerald-500' },
}

function WidgetCard({
  widget,
  title,
  icon,
  count,
  urgent,
  footer,
  children,
}: {
  widget: WidgetKey
  title: string
  icon: ReactNode
  count: number
  /** Bold colored counter badge instead of a plain number — reserved for Atrasadas. */
  urgent?: boolean
  footer?: ReactNode
  children: ReactNode
}) {
  const styles = WIDGET_STYLE[widget]

  return (
    <div
      data-dash-accent
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 border-l-4 ${styles.border} bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition-all duration-150 ease-in-out`}
    >
      <div className={`flex min-w-0 items-center gap-2.5 rounded-t-2xl px-6 py-4 ${styles.headerBg ?? ''}`}>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.iconBg}`}>{icon}</div>
        <p className="truncate text-[16px] font-semibold text-slate-900">{title}</p>
        {urgent ? (
          <span className="ml-auto shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{count}</span>
        ) : (
          <span className="ml-auto shrink-0 text-xs font-medium text-slate-400">{count}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-6 pb-5 pt-1">{children}</div>
      {footer && <div className="min-w-0 border-t border-slate-100 px-6 py-3">{footer}</div>}
    </div>
  )
}

function AddTaskAction({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={onClick}>
      Adicionar tarefa
    </Button>
  )
}

function AddContentAction({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={onClick}>
      Criar conteúdo
    </Button>
  )
}

function OverdueTaskRow({ task, clientName, onClick }: { task: Task; clientName?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-w-0 w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-in-out hover:bg-slate-50"
    >
      <span className="truncate text-sm font-medium text-slate-900">{task.title}</span>
      <span className="flex items-center gap-1.5 text-xs">
        {clientName && <span className="truncate text-slate-400">{clientName}</span>}
        <span className="ml-auto shrink-0 font-medium text-red-600">{daysAgoLabel(task.dueDate!.toDate())}</span>
      </span>
    </button>
  )
}

function TodayTaskRow({ task, assignee, onClick }: { task: Task; assignee?: Assignee; onClick: () => void }) {
  const due = task.dueDate?.toDate()
  const hasTime = due && (due.getHours() !== 0 || due.getMinutes() !== 0)
  return (
    <button
      onClick={onClick}
      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-in-out hover:bg-slate-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-900">{task.title}</span>
        {hasTime && <span className="text-xs text-slate-400">{format(due!, 'HH:mm')}</span>}
      </span>
      {assignee && <Avatar name={assignee.name} photoURL={assignee.photoURL} size="xs" />}
    </button>
  )
}

function UpcomingTaskRow({
  task,
  clientName,
  assignee,
  onClick,
}: {
  task: Task
  clientName?: string
  assignee?: Assignee
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-in-out hover:bg-slate-50"
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
        {task.title}
        {clientName && <span className="text-slate-400"> — {clientName}</span>}
      </span>
      {assignee && <Avatar name={assignee.name} photoURL={assignee.photoURL} size="xs" />}
    </button>
  )
}

function DayGroupHeader({ date }: { date: Date }) {
  return <p className="mt-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 first:mt-0">{dayGroupLabel(date)}</p>
}

function ProductionContentRow({
  content,
  clientName,
  onClick,
}: {
  content: Content
  clientName?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-w-0 w-full flex-col gap-1 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-in-out hover:bg-slate-50"
    >
      <span className="truncate text-sm font-medium text-slate-900">
        {clientName && <span className="text-violet-600">{clientName}</span>}
        {clientName && ' — '}
        {content.title}
      </span>
      <span className="flex items-center gap-1.5 text-xs text-slate-400">
        {content.pillar && (
          <>
            <span className="flex items-center gap-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: CONTENT_PILLAR_COLOR[content.pillar] }}
              />
              {CONTENT_PILLAR_LABEL[content.pillar]}
            </span>
            <span>·</span>
          </>
        )}
        <span>{CONTENT_FORMAT_LABEL[content.type] ?? CONTENT_TYPE_LABEL[content.type]}</span>
      </span>
    </button>
  )
}

function WaitingApprovalRow({
  content,
  clientName,
  onClick,
}: {
  content: Content
  clientName?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-w-0 w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-in-out hover:bg-slate-50"
    >
      <span className="truncate text-sm font-medium text-slate-900">
        {clientName && <span className="text-amber-600">{clientName}</span>}
        {clientName && ' — '}
        {content.title}
      </span>
      <span className="text-xs text-slate-400">{daysAgoLabel(content.updatedAt.toDate())} aguardando</span>
    </button>
  )
}

function ApprovedContentRow({
  content,
  clientName,
  onClick,
}: {
  content: Content
  clientName?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-in-out hover:bg-slate-50"
    >
      <span className="min-w-0 truncate text-sm font-medium text-slate-900">
        {clientName && <span className="text-emerald-600">{clientName}</span>}
        {clientName && ' — '}
        {content.title}
      </span>
    </button>
  )
}

function PublicationRow({
  content,
  clientName,
  onClick,
}: {
  content: Content
  clientName?: string
  onClick: () => void
}) {
  const date = content.scheduledDate?.toDate()
  return (
    <button
      onClick={onClick}
      className="flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 ease-in-out hover:bg-slate-50"
    >
      {date && (
        <div className="flex w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-blue-50 py-1">
          <span className="text-sm font-bold leading-none text-blue-600">{format(date, 'dd')}</span>
          <span className="text-[10px] font-medium uppercase leading-none text-blue-500">{format(date, 'MMM', { locale: ptBR })}</span>
        </div>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
        {clientName && <span className="font-medium">{clientName}</span>}
        {clientName && ' — '}
        {content.title}
      </span>
      <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
        {CONTENT_FORMAT_LABEL[content.type] ?? CONTENT_TYPE_LABEL[content.type]}
      </span>
    </button>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { data: tasks } = useAllTasks()
  const { data: contents } = useAllContents()
  const { data: clients } = useClients()
  const userMap = useAssigneeMap()
  const { canSeeAllTasks, viewerId } = useTaskVisibility()
  const visibleTasks = useMemo(() => filterVisibleTasks(tasks, canSeeAllTasks, viewerId), [tasks, canSeeAllTasks, viewerId])
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [openContentId, setOpenContentId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [contentModalOpen, setContentModalOpen] = useState(false)
  const openTask = visibleTasks.find((t) => t.id === openTaskId) ?? null
  const openContent = contents.find((c) => c.id === openContentId) ?? null

  const todayLabel = useMemo(() => {
    const s = format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }, [])

  const buckets = useMemo(() => {
    const openTasks = visibleTasks.filter((t) => t.status !== 'done')
    const today = openTasks.filter((t) => t.dueDate && isToday(t.dueDate.toDate()))
    const overdue = openTasks
      .filter((t) => t.dueDate && isPast(t.dueDate.toDate()) && !isToday(t.dueDate.toDate()))
      .sort((a, b) => a.dueDate!.toMillis() - b.dueDate!.toMillis())
    const upcoming = openTasks
      .filter((t) => t.dueDate && isWithinInterval(t.dueDate.toDate(), { start: addDays(new Date(), 1), end: addDays(new Date(), 7) }))
      .sort((a, b) => a.dueDate!.toMillis() - b.dueDate!.toMillis())

    // Cada bucket puxa exatamente uma coluna do board de Social Media.
    const inProduction = contents.filter((c) => c.status === 'production') // EM PRODUÇÃO
    const waitingApproval = contents
      .filter((c) => c.status === 'waiting_client') // AGUARDANDO CLIENTE
      .sort((a, b) => a.updatedAt.toMillis() - b.updatedAt.toMillis())
    const approved = contents.filter((c) => c.status === 'approved') // APROVADO
    const nextPublications = contents
      .filter((c) => c.status === 'scheduled' && c.scheduledDate) // AGENDADO
      .sort((a, b) => a.scheduledDate!.toMillis() - b.scheduledDate!.toMillis())
      .slice(0, 6)

    return { today, overdue, upcoming, inProduction, waitingApproval, approved, nextPublications }
  }, [visibleTasks, contents])

  const allZero =
    buckets.today.length === 0 &&
    buckets.overdue.length === 0 &&
    buckets.upcoming.length === 0 &&
    buckets.inProduction.length === 0 &&
    buckets.waitingApproval.length === 0 &&
    buckets.approved.length === 0

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])

  const upcomingGroups = useMemo(() => {
    const groups: { date: Date; tasks: Task[] }[] = []
    for (const t of buckets.upcoming) {
      const due = t.dueDate!.toDate()
      const last = groups[groups.length - 1]
      if (last && isSameDay(last.date, due)) last.tasks.push(t)
      else groups.push({ date: due, tasks: [t] })
    }
    return groups
  }, [buckets.upcoming])

  const clientSummary = useMemo(() => {
    return clients
      .filter((c) => c.status === 'active')
      .map((c) => {
        const nextTask = tasks
          .filter((t) => t.clientId === c.id && t.status !== 'done' && t.dueDate)
          .sort((a, b) => a.dueDate!.toMillis() - b.dueDate!.toMillis())[0]
        const ownerId = getClientOwnerIds(c)[0]
        return {
          client: c,
          health: getClientHealth(c.id, tasks),
          service: clientServiceLabel(c),
          ownerName: ownerId ? (userMap[ownerId]?.name ?? '—') : '—',
          nextTask,
        }
      })
      .sort((a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || a.client.companyName.localeCompare(b.client.companyName))
  }, [clients, tasks, userMap])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-slate-900">Dashboard</h1>
          <p className="text-[15px] text-[#64748B]">Visão geral do que precisa da sua atenção hoje.</p>
        </div>
        <p className="text-[14px] text-slate-400">{todayLabel}</p>
      </div>

      <DailyRoutineWidget />
      <OptimizationsTodayWidget />

      {allZero && !expanded ? (
        <DashboardEmptyState
          counts={{
            today: buckets.today.length,
            overdue: buckets.overdue.length,
            upcoming: buckets.upcoming.length,
            inProduction: buckets.inProduction.length,
            waitingApproval: buckets.waitingApproval.length,
            approved: buckets.approved.length,
          }}
          onExpand={() => setExpanded(true)}
        />
      ) : (
        <>
          {allZero && (
            <button
              onClick={() => setExpanded(false)}
              className="self-start text-xs font-medium text-slate-400 hover:text-brand-500"
            >
              ← Recolher
            </button>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <WidgetCard
              widget="overdue"
              title="Tarefas atrasadas"
              icon={<AlertTriangle size={15} className="text-white" />}
              count={buckets.overdue.length}
              urgent
            >
              {buckets.overdue.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-6 text-center">
                  <CheckCircle2 className="text-emerald-500" size={26} />
                  <p className="text-[15px] font-medium text-slate-600">Tudo em dia!</p>
                </div>
              ) : (
                buckets.overdue.map((t) => (
                  <OverdueTaskRow
                    key={t.id}
                    task={t}
                    clientName={t.clientId ? clientMap[t.clientId]?.companyName : undefined}
                    onClick={() => setOpenTaskId(t.id)}
                  />
                ))
              )}
            </WidgetCard>

            <WidgetCard
              widget="today"
              title="Tarefas de hoje"
              icon={<Clock size={15} className="text-white" />}
              count={buckets.today.length}
              footer={<AddTaskAction onClick={() => setTaskModalOpen(true)} />}
            >
              {buckets.today.length === 0 ? (
                <EmptyState title="Nada para hoje" />
              ) : (
                buckets.today.map((t) => (
                  <TodayTaskRow
                    key={t.id}
                    task={t}
                    assignee={t.assignedTo ? userMap[t.assignedTo] : undefined}
                    onClick={() => setOpenTaskId(t.id)}
                  />
                ))
              )}
            </WidgetCard>

            <WidgetCard
              widget="upcoming"
              title="Próximas (7 dias)"
              icon={<CalendarDays size={15} className="text-white" />}
              count={buckets.upcoming.length}
            >
              {buckets.upcoming.length === 0 ? (
                <EmptyState title="Nada agendado" action={<AddTaskAction onClick={() => setTaskModalOpen(true)} />} />
              ) : (
                upcomingGroups.map((group) => (
                  <div key={group.date.toISOString()} className="min-w-0">
                    <DayGroupHeader date={group.date} />
                    {group.tasks.map((t) => (
                      <UpcomingTaskRow
                        key={t.id}
                        task={t}
                        clientName={t.clientId ? clientMap[t.clientId]?.companyName : undefined}
                        assignee={t.assignedTo ? userMap[t.assignedTo] : undefined}
                        onClick={() => setOpenTaskId(t.id)}
                      />
                    ))}
                  </div>
                ))
              )}
            </WidgetCard>

            <WidgetCard
              widget="inProduction"
              title="Em produção"
              icon={<Pencil size={15} className="text-white" />}
              count={buckets.inProduction.length}
            >
              {buckets.inProduction.length === 0 ? (
                <EmptyState title="Nada em produção" action={<AddContentAction onClick={() => setContentModalOpen(true)} />} />
              ) : (
                buckets.inProduction.map((c) => (
                  <ProductionContentRow
                    key={c.id}
                    content={c}
                    clientName={clientMap[c.clientId]?.companyName}
                    onClick={() => setOpenContentId(c.id)}
                  />
                ))
              )}
            </WidgetCard>

            <WidgetCard
              widget="waitingApproval"
              title="Aguardando aprovação"
              icon={<Clock size={15} className="text-white" />}
              count={buckets.waitingApproval.length}
            >
              {buckets.waitingApproval.length === 0 ? (
                <EmptyState title="Nada pendente" action={<AddContentAction onClick={() => setContentModalOpen(true)} />} />
              ) : (
                buckets.waitingApproval.map((c) => (
                  <WaitingApprovalRow
                    key={c.id}
                    content={c}
                    clientName={clientMap[c.clientId]?.companyName}
                    onClick={() => setOpenContentId(c.id)}
                  />
                ))
              )}
            </WidgetCard>

            <WidgetCard
              widget="approved"
              title="Conteúdos aprovados"
              icon={<CheckCircle2 size={15} className="text-white" />}
              count={buckets.approved.length}
            >
              {buckets.approved.length === 0 ? (
                <EmptyState title="Nada aprovado ainda" />
              ) : (
                buckets.approved.map((c) => (
                  <ApprovedContentRow
                    key={c.id}
                    content={c}
                    clientName={clientMap[c.clientId]?.companyName}
                    onClick={() => setOpenContentId(c.id)}
                  />
                ))
              )}
            </WidgetCard>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-2.5 rounded-t-2xl px-6 py-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500">
              <CalendarDays size={15} className="text-white" />
            </div>
            <p className="text-[16px] font-semibold text-slate-900">Próximas publicações</p>
            <span className="ml-auto shrink-0 text-xs font-medium text-slate-400">{buckets.nextPublications.length}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 px-6 pb-5 pt-1">
            {buckets.nextPublications.length === 0 ? (
              <EmptyState title="Nenhuma publicação agendada" />
            ) : (
              buckets.nextPublications.map((c) => (
                <PublicationRow
                  key={c.id}
                  content={c}
                  clientName={clientMap[c.clientId]?.companyName}
                  onClick={() => setOpenContentId(c.id)}
                />
              ))
            )}
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <p className="mb-3 text-[16px] font-semibold text-slate-900">Resumo por cliente</p>
          {clientSummary.length === 0 ? (
            <EmptyState title="Nenhum cliente ativo" />
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left text-[15px]">
                <thead className="sticky top-0 bg-white text-[13px] font-semibold uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="w-6 py-1.5"></th>
                    <th className="py-1.5 pr-2 font-semibold">Cliente</th>
                    <th className="py-1.5 pr-2 font-semibold">Serviço</th>
                    <th className="py-1.5 pr-2 font-semibold">Responsável</th>
                    <th className="py-1.5 pr-2 font-semibold">Próxima tarefa</th>
                    <th className="py-1.5 font-semibold">Prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {clientSummary.map(({ client, health, service, ownerName, nextTask }, index) => {
                    const overdueTask = nextTask?.dueDate && isPast(nextTask.dueDate.toDate()) && !isToday(nextTask.dueDate.toDate())
                    return (
                      <tr
                        key={client.id}
                        onClick={() => navigate(`/clientes/${client.id}`)}
                        className={`h-12 cursor-pointer border-t border-slate-50 text-slate-700 transition-colors duration-150 ease-in-out hover:bg-blue-50 ${
                          index % 2 === 1 ? 'bg-slate-50' : 'bg-white'
                        }`}
                      >
                        <td className="py-2 pl-2 align-middle">
                          <span title={HEALTH_LABEL[health]} className={`block h-2.5 w-2.5 rounded-full ${HEALTH_DOT[health]}`} />
                        </td>
                        <td className="max-w-[160px] py-2 pr-2 align-middle font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                            <Avatar name={client.companyName} photoURL={client.logoUrl} size="xs" />
                            <span className="truncate">{client.companyName}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-2 align-middle">
                          <ServicePill service={service} />
                        </td>
                        <td className="py-2 pr-2 align-middle text-slate-500">{ownerName}</td>
                        <td className="max-w-[160px] truncate py-2 pr-2 align-middle text-slate-500">
                          {canSeeAllTasks ? (nextTask?.title ?? '—') : '—'}
                        </td>
                        <td className={`py-2 pr-2 align-middle text-xs ${canSeeAllTasks && overdueTask ? 'font-bold text-red-600' : 'text-slate-400'}`}>
                          {canSeeAllTasks && overdueTask && <AlertTriangle size={11} className="mr-1 inline -mt-0.5" />}
                          {canSeeAllTasks && nextTask?.dueDate ? format(nextTask.dueDate.toDate(), 'dd MMM', { locale: ptBR }) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <TaskDrawer key={`task-${openTaskId ?? 'none'}`} task={openTask} onClose={() => setOpenTaskId(null)} />
      <ContentDrawer key={`content-${openContentId ?? 'none'}`} content={openContent} onClose={() => setOpenContentId(null)} />
      <TaskFormModal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} />
      <ContentFormModal open={contentModalOpen} onClose={() => setContentModalOpen(false)} />
    </div>
  )
}

import { useMemo, useState } from 'react'
import { format, isPast, isToday, isWithinInterval, addDays, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ListTodo } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { useClients } from '../../hooks/useClients'
import { useAllTasks } from '../../hooks/useTasks'
import { findUserIdByName } from '../../utils/userLookup'
import { isAutoRecurringTaskTitle } from '../../services/clientWorkflowTemplates'
import { InfoTip } from '../ui/InfoTip'
import { TaskDrawer } from '../tasks/TaskDrawer'
import type { Task } from '../../types/task'

const OWNER_EMAIL = 'gestorarrowshotmkt@gmail.com'
const PEOPLE = ['Jamilson', 'Ciane', 'Nicolas']

function daysOverdueLabel(date: Date): string {
  const n = differenceInDays(new Date(), date)
  return `${n} dia${n === 1 ? '' : 's'} de atraso`
}

function TaskRow({
  task,
  clientName,
  rightLabel,
  rightClass,
  noDateWarning,
  onClick,
}: {
  task: Task
  clientName?: string
  rightLabel: string
  rightClass: string
  noDateWarning?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full min-w-0 flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-in-out hover:bg-slate-50"
    >
      <span className="flex items-center gap-1.5">
        <span className="truncate text-sm font-medium text-slate-900">{task.title}</span>
        {noDateWarning && (
          <InfoTip tone="warning" title="Sem prazo definido">
            Essa tarefa não tem uma data de vencimento — confirme se está correto.
          </InfoTip>
        )}
      </span>
      {task.description && <span className="truncate text-xs text-slate-400">{task.description}</span>}
      <span className="flex items-center gap-1.5 text-xs">
        {clientName && <span className="truncate text-slate-400">{clientName}</span>}
        {rightLabel && <span className={`ml-auto shrink-0 font-medium ${rightClass}`}>{rightLabel}</span>}
      </span>
    </button>
  )
}

function EmptyCategory({ label }: { label: string }) {
  return <p className="py-1.5 text-sm text-slate-400">✅ Nenhuma tarefa {label}</p>
}

/** Widget "Tarefas da equipe", visível SÓ para Bruno (Admin) — em abas por
 *  pessoa (Jamilson, Ciane, Nicolas), mostra tarefas atrasadas, de hoje e
 *  dos próximos 3 dias. `tasks`/`optimizations`/`clients` já são legíveis
 *  por qualquer usuário interno (ver firestore.rules) — sem regra nova.
 *  Clicar numa tarefa abre o mesmo TaskDrawer usado no resto do app. */
export function TeamTasksWidget() {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const { data: clients } = useClients()
  const { data: tasks } = useAllTasks()
  const [activePerson, setActivePerson] = useState(PEOPLE[0])
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  const clientNameById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.companyName])), [clients])

  const bucketsByPerson = useMemo(() => {
    const result: Record<string, { overdue: Task[]; today: Task[]; upcoming: Task[] }> = {}
    for (const name of PEOPLE) {
      const userId = findUserIdByName(users, name)
      const mine = tasks.filter((t) => t.assignedTo === userId && t.status !== 'done')
      result[name] = {
        overdue: mine
          .filter((t) => t.dueDate && isPast(t.dueDate.toDate()) && !isToday(t.dueDate.toDate()))
          .sort((a, b) => a.dueDate!.toMillis() - b.dueDate!.toMillis()),
        // Manual sem prazo entra junto com "hoje" — senão fica sem aparecer
        // em bucket nenhum. Automática sem prazo fica de fora — são as
        // recorrentes/onboarding antigas sem data (checa workflowStep e,
        // pra tarefas antigas sem esse campo, o título também).
        today: mine.filter(
          (t) =>
            (!t.dueDate && !t.workflowStep && !isAutoRecurringTaskTitle(t.title)) ||
            (t.dueDate && isToday(t.dueDate.toDate()))
        ),
        upcoming: mine
          .filter((t) => t.dueDate && isWithinInterval(t.dueDate.toDate(), { start: addDays(new Date(), 1), end: addDays(new Date(), 3) }))
          .sort((a, b) => a.dueDate!.toMillis() - b.dueDate!.toMillis()),
      }
    }
    return result
  }, [tasks, users])

  const canSee = profile?.role === 'admin' || profile?.email === OWNER_EMAIL
  if (!canSee) return null

  const active = bucketsByPerson[activePerson] ?? { overdue: [], today: [], upcoming: [] }
  const openTask = tasks.find((t) => t.id === openTaskId) ?? null

  return (
    <div className="h-full rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]" style={{ borderLeft: '4px solid #2563EB' }} data-dash-accent>
      <div className="flex items-center gap-2">
        <ListTodo size={16} className="text-brand-600" />
        <p className="text-[16px] font-semibold text-slate-900">Tarefas da equipe</p>
      </div>

      <div className="mt-3 flex gap-1.5">
        {PEOPLE.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setActivePerson(name)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activePerson === name ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs font-medium text-slate-500">
        🔴 {active.overdue.length} atrasadas · 🔵 {active.today.length} hoje · 🟡 {active.upcoming.length} próximas
      </p>

      <div className="mt-3 flex flex-col gap-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Atrasadas</p>
          {active.overdue.length === 0 ? (
            <EmptyCategory label="atrasada" />
          ) : (
            active.overdue.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                clientName={t.clientId ? clientNameById[t.clientId] : undefined}
                rightLabel={daysOverdueLabel(t.dueDate!.toDate())}
                rightClass="text-red-600"
                onClick={() => setOpenTaskId(t.id)}
              />
            ))
          )}
        </div>

        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hoje</p>
          {active.today.length === 0 ? (
            <EmptyCategory label="hoje" />
          ) : (
            active.today.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                clientName={t.clientId ? clientNameById[t.clientId] : undefined}
                rightLabel={t.dueDate ? 'Hoje' : ''}
                rightClass="text-blue-600"
                noDateWarning={!t.dueDate}
                onClick={() => setOpenTaskId(t.id)}
              />
            ))
          )}
        </div>

        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Próximas (3 dias)</p>
          {active.upcoming.length === 0 ? (
            <EmptyCategory label="próxima" />
          ) : (
            active.upcoming.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                clientName={t.clientId ? clientNameById[t.clientId] : undefined}
                rightLabel={format(t.dueDate!.toDate(), 'dd/MM', { locale: ptBR })}
                rightClass="text-amber-600"
                onClick={() => setOpenTaskId(t.id)}
              />
            ))
          )}
        </div>
      </div>

      <TaskDrawer key={`task-${openTaskId ?? 'none'}`} task={openTask} onClose={() => setOpenTaskId(null)} />
    </div>
  )
}

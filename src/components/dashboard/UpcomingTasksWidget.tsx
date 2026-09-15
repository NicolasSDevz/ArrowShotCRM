import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays } from 'lucide-react'
import { WidgetCard, AddTaskAction } from './WidgetCard'
import { EmptyState } from '../ui/EmptyState'
import { Avatar } from '../ui/Avatar'
import type { Task } from '../../types/task'
import type { Client } from '../../types/client'
import type { Assignee } from '../../hooks/useAssignees'

function dayGroupLabel(date: Date) {
  const s = format(date, 'EEE, dd MMM', { locale: ptBR })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function DayGroupHeader({ date }: { date: Date }) {
  return <p className="mt-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 first:mt-0">{dayGroupLabel(date)}</p>
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

export function UpcomingTasksWidget({
  groups,
  count,
  clientMap,
  assigneeMap,
  onOpenTask,
  onAddTask,
}: {
  groups: { date: Date; tasks: Task[] }[]
  count: number
  clientMap: Record<string, Client>
  assigneeMap: Record<string, Assignee>
  onOpenTask: (id: string) => void
  onAddTask: () => void
}) {
  return (
    <WidgetCard widget="upcoming" title="Próximas (7 dias)" icon={<CalendarDays size={15} className="text-white" />} count={count}>
      {count === 0 ? (
        <EmptyState title="Nada agendado" action={<AddTaskAction onClick={onAddTask} />} />
      ) : (
        groups.map((group) => (
          <div key={group.date.toISOString()} className="min-w-0">
            <DayGroupHeader date={group.date} />
            {group.tasks.map((t) => (
              <UpcomingTaskRow
                key={t.id}
                task={t}
                clientName={t.clientId ? clientMap[t.clientId]?.companyName : undefined}
                assignee={t.assignedTo ? assigneeMap[t.assignedTo] : undefined}
                onClick={() => onOpenTask(t.id)}
              />
            ))}
          </div>
        ))
      )}
    </WidgetCard>
  )
}

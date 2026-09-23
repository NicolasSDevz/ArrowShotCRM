import { format } from 'date-fns'
import { Clock } from 'lucide-react'
import { WidgetCard, AddTaskAction } from './WidgetCard'
import { EmptyState } from '../ui/EmptyState'
import { Avatar } from '../ui/Avatar'
import type { Task } from '../../types/task'
import type { Assignee } from '../../hooks/useAssignees'

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
        {!due && <span className="text-xs text-amber-500">Sem data definida</span>}
      </span>
      {assignee && <Avatar name={assignee.name} photoURL={assignee.photoURL} size="xs" />}
    </button>
  )
}

export function TodayTasksWidget({
  tasks,
  assigneeMap,
  onOpenTask,
  onAddTask,
}: {
  tasks: Task[]
  assigneeMap: Record<string, Assignee>
  onOpenTask: (id: string) => void
  onAddTask: () => void
}) {
  return (
    <WidgetCard widget="today" title="Tarefas de hoje" icon={<Clock size={15} className="text-white" />} count={tasks.length} footer={<AddTaskAction onClick={onAddTask} />}>
      {tasks.length === 0 ? (
        <EmptyState title="Nada para hoje" />
      ) : (
        tasks.map((t) => (
          <TodayTaskRow key={t.id} task={t} assignee={t.assignedTo ? assigneeMap[t.assignedTo] : undefined} onClick={() => onOpenTask(t.id)} />
        ))
      )}
    </WidgetCard>
  )
}

import { format } from 'date-fns'
import { Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { setTaskChecklist } from '../../services/taskService'
import { WidgetCard, AddTaskAction } from './WidgetCard'
import { EmptyState } from '../ui/EmptyState'
import { Avatar } from '../ui/Avatar'
import { InfoTip } from '../ui/InfoTip'
import type { Task } from '../../types/task'
import type { Assignee } from '../../hooks/useAssignees'

function TodayTaskRow({ task, assignee, onClick }: { task: Task; assignee?: Assignee; onClick: () => void }) {
  const { profile } = useAuth()
  const due = task.dueDate?.toDate()
  const hasTime = due && (due.getHours() !== 0 || due.getMinutes() !== 0)
  const checklist = task.checklist ?? []
  const doneCount = checklist.filter((i) => i.done).length

  // Marca o item direto no widget, sem abrir a tarefa (mesmo update pontual
  // do TaskDrawer: só o campo checklist).
  const toggleItem = async (id: string, done: boolean) => {
    if (!profile) return
    try {
      await setTaskChecklist(task.id, checklist.map((i) => (i.id === id ? { ...i, done } : i)), profile.id)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao atualizar o checklist')
    }
  }

  return (
    <li className="rounded-lg px-2 py-1.5 transition-colors duration-150 ease-in-out hover:bg-slate-50">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <button onClick={onClick} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-1.5">
            <span className="block text-sm font-medium text-slate-900">{task.title}</span>
            {hasTime && <span className="shrink-0 text-xs text-slate-400">{format(due!, 'HH:mm')}</span>}
          </span>
          {/* whitespace-pre-line: as quebras de linha da descrição aparecem. */}
          {task.description && (
            <span className="mt-0.5 block whitespace-pre-line break-words text-xs text-slate-500 line-clamp-6">{task.description}</span>
          )}
        </button>
        <span className="flex shrink-0 items-center gap-1">
          {!due && (
            <InfoTip tone="warning" title="Sem prazo definido">
              Essa tarefa não tem uma data de vencimento, confirme se está correto.
            </InfoTip>
          )}
          {assignee && <Avatar name={assignee.name} photoURL={assignee.photoURL} size="xs" />}
        </span>
      </div>

      {checklist.length > 0 && (
        <div className="mt-1.5">
          <p className="text-xs font-medium text-slate-400">
            Checklist: {doneCount} de {checklist.length} feitos
          </p>
          <ul className="mt-1 flex flex-col gap-1" aria-label={`Checklist de ${task.title}`}>
            {checklist.map((item) => (
              <li key={item.id}>
                <label className="flex items-start gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(e) => toggleItem(item.id, e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
                  />
                  <span className={`whitespace-pre-line break-words ${item.done ? 'text-slate-400 line-through' : ''}`}>{item.text}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
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
        <ul className="flex flex-col gap-1">
          {tasks.map((t) => (
            <TodayTaskRow key={t.id} task={t} assignee={t.assignedTo ? assigneeMap[t.assignedTo] : undefined} onClick={() => onOpenTask(t.id)} />
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

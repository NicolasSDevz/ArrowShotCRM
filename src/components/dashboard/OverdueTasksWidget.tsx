import { differenceInDays } from 'date-fns'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { WidgetCard } from './WidgetCard'
import type { Task } from '../../types/task'
import type { Client } from '../../types/client'

function daysAgoLabel(date: Date) {
  const n = differenceInDays(new Date(), date)
  if (n <= 0) return 'hoje'
  return `há ${n} dia${n === 1 ? '' : 's'}`
}

function OverdueTaskRow({ task, clientName, onClick }: { task: Task; clientName?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-w-0 w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-in-out hover:bg-slate-50"
    >
      <span className="truncate text-sm font-medium text-slate-900">{task.title}</span>
      {task.description && <span className="truncate text-xs text-slate-400">{task.description}</span>}
      <span className="flex items-center gap-1.5 text-xs">
        {clientName && <span className="truncate text-slate-400">{clientName}</span>}
        <span className="ml-auto shrink-0 font-medium text-red-600">{daysAgoLabel(task.dueDate!.toDate())}</span>
      </span>
    </button>
  )
}

export function OverdueTasksWidget({
  tasks,
  clientMap,
  onOpenTask,
}: {
  tasks: Task[]
  clientMap: Record<string, Client>
  onOpenTask: (id: string) => void
}) {
  return (
    <WidgetCard widget="overdue" title="Tarefas atrasadas" icon={<AlertTriangle size={15} className="text-white" />} count={tasks.length} urgent>
      {tasks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-6 text-center">
          <CheckCircle2 className="text-emerald-500" size={26} />
          <p className="text-[15px] font-medium text-slate-600">Tudo em dia!</p>
        </div>
      ) : (
        tasks.map((t) => (
          <OverdueTaskRow key={t.id} task={t} clientName={t.clientId ? clientMap[t.clientId]?.companyName : undefined} onClick={() => onOpenTask(t.id)} />
        ))
      )}
    </WidgetCard>
  )
}

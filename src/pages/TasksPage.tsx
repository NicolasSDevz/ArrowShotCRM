import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Search, RotateCw } from 'lucide-react'
import { isPast, isToday } from 'date-fns'
import { useAllTasks } from '../hooks/useTasks'
import { useClients } from '../hooks/useClients'
import { useAssignees } from '../hooks/useAssignees'
import { TaskDrawer } from '../components/tasks/TaskDrawer'
import { TaskFormModal } from '../components/tasks/TaskFormModal'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { EmptyState } from '../components/ui/EmptyState'
import { TASK_PRIORITY_COLOR, TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, formatRecurrence, type Task } from '../types/task'
import { useTaskVisibility, filterVisibleTasks } from '../utils/taskVisibility'

function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === 'done' || task.status === 'active') return false
  const due = task.dueDate.toDate()
  return isPast(due) && !isToday(due)
}

function rowTint(task: Task): string {
  if (isOverdue(task)) return 'bg-red-50'
  if (task.status === 'done' || task.status === 'active') return 'bg-emerald-50'
  if (task.status === 'in_progress') return 'bg-blue-50'
  return ''
}

export function TasksPage() {
  const { data: allTasks, loading } = useAllTasks()
  const { data: clients } = useClients()
  const assignees = useAssignees()
  const { canSeeAllTasks, viewerId } = useTaskVisibility()
  const tasks = useMemo(() => filterVisibleTasks(allTasks, canSeeAllTasks, viewerId), [allTasks, canSeeAllTasks, viewerId])

  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Deep link from a notification (?task=id) — open the drawer once, then
  // drop the param so the URL stays clean afterwards.
  useEffect(() => {
    const id = searchParams.get('task')
    if (id) {
      setOpenTaskId(id)
      setSearchParams((params) => {
        params.delete('task')
        return params
      }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const openTask = tasks.find((t) => t.id === openTaskId) ?? null

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
      if (clientFilter && t.clientId !== clientFilter) return false
      if (assigneeFilter && t.assignedTo !== assigneeFilter) return false
      if (statusFilter && t.status !== statusFilter) return false
      if (priorityFilter && t.priority !== priorityFilter) return false
      return true
    })
  }, [tasks, search, clientFilter, assigneeFilter, statusFilter, priorityFilter])

  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]))
  const userMap = Object.fromEntries(assignees.map((a) => [a.id, a]))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900">Tarefas</h1>
          <p className="text-[15px] text-[#64748B]">{filtered.length} tarefa(s)</p>
        </div>
        <Button icon={<Plus size={14} />} onClick={() => setCreating(true)}>
          Nova tarefa
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tarefa..."
            className="h-[38px] rounded-lg border border-slate-200 pl-8 pr-3 text-sm outline-none transition-all duration-150 ease-in-out focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100">
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.companyName}</option>
          ))}
        </select>
        <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100">
          <option value="">Todos os responsáveis</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100">
          <option value="">Todos os status</option>
          {Object.entries(TASK_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100">
          <option value="">Todas as prioridades</option>
          {Object.entries(TASK_PRIORITY_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {!loading && filtered.length === 0 ? (
        <EmptyState title="Nenhuma tarefa encontrada" description="Ajuste os filtros ou crie uma nova tarefa." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[15px]">
            <thead className="border-b border-slate-100 bg-slate-50 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Tarefa</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Prioridade</th>
                <th className="px-4 py-2.5">Prazo</th>
                <th className="px-4 py-2.5">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const overdue = isOverdue(t)
                const client = t.clientId ? clientMap[t.clientId] : undefined
                return (
                  <tr
                    key={t.id}
                    onClick={() => setOpenTaskId(t.id)}
                    className={`cursor-pointer border-b border-slate-50 text-slate-700 transition-colors duration-150 ease-in-out last:border-0 hover:bg-slate-100 ${rowTint(t)}`}
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-700">
                      <span className="flex items-center gap-1.5">
                        {t.title}
                        {t.recurrence && (
                          <span title={formatRecurrence(t.recurrence)} className="shrink-0 text-slate-400">
                            <RotateCw size={12} />
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {client ? (
                        <Link
                          to={`/clientes/${client.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-blue-600 hover:underline"
                        >
                          <Avatar name={client.companyName} photoURL={client.logoUrl} size="xs" />
                          {client.companyName}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{TASK_STATUS_LABEL[t.status]}</td>
                    <td className="px-4 py-2.5">
                      <Badge className={TASK_PRIORITY_COLOR[t.priority]}>{TASK_PRIORITY_LABEL[t.priority]}</Badge>
                    </td>
                    <td className={`px-4 py-2.5 ${overdue ? 'font-bold text-red-600' : 'text-slate-500'}`}>
                      {t.dueDate ? t.dueDate.toDate().toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {t.assignedTo && userMap[t.assignedTo] ? (
                        <Avatar name={userMap[t.assignedTo].name} photoURL={userMap[t.assignedTo].photoURL} size="xs" />
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <TaskDrawer key={`task-${openTaskId ?? 'none'}`} task={openTask} onClose={() => setOpenTaskId(null)} />
      <TaskFormModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

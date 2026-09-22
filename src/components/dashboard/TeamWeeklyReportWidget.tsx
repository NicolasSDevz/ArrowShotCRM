import { useMemo, useState } from 'react'
import { format, startOfWeek, endOfWeek, addWeeks, isWithinInterval } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, ClipboardList, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAllTasks } from '../../hooks/useTasks'
import { useAssigneeMap } from '../../hooks/useAssignees'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import type { Task } from '../../types/task'

interface PersonWeekStats {
  id: string
  name: string
  completed: number
  overdue: number
  dueThisWeek: number
  pending: number
}

function computeStats(tasks: Task[], assigneeMap: ReturnType<typeof useAssigneeMap>, weekStart: Date, weekEnd: Date): PersonWeekStats[] {
  const byAssignee = new Map<string, Task[]>()
  for (const t of tasks) {
    const id = t.assignedTo ?? '__sem_responsavel__'
    if (!byAssignee.has(id)) byAssignee.set(id, [])
    byAssignee.get(id)!.push(t)
  }

  const rows: PersonWeekStats[] = []
  for (const [id, list] of byAssignee) {
    const name = id === '__sem_responsavel__' ? 'Sem responsável' : (assigneeMap[id]?.name ?? '(removido)')
    const completed = list.filter(
      (t) => t.status === 'done' && isWithinInterval(t.updatedAt.toDate(), { start: weekStart, end: weekEnd })
    ).length
    const overdue = list.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate.toDate() < weekEnd && t.dueDate.toDate() < new Date()).length
    const dueThisWeek = list.filter(
      (t) => t.status !== 'done' && t.dueDate && isWithinInterval(t.dueDate.toDate(), { start: weekStart, end: weekEnd })
    ).length
    const pending = list.filter((t) => t.status !== 'done').length
    if (completed + overdue + dueThisWeek + pending > 0) {
      rows.push({ id, name, completed, overdue, dueThisWeek, pending })
    }
  }
  return rows.sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name, 'pt-BR'))
}

function StatCell({ value, label, tone }: { value: number; label: string; tone: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : 'text-slate-700'
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-lg font-extrabold ${color}`}>{value}</span>
      <span className="text-center text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
    </div>
  )
}

function WeeklyReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: tasks } = useAllTasks()
  const assigneeMap = useAssigneeMap()
  const [weekOffset, setWeekOffset] = useState(0)

  const { weekStart, weekEnd } = useMemo(() => {
    const base = addWeeks(new Date(), weekOffset)
    return { weekStart: startOfWeek(base, { weekStartsOn: 1 }), weekEnd: endOfWeek(base, { weekStartsOn: 1 }) }
  }, [weekOffset])

  const rows = useMemo(() => computeStats(tasks, assigneeMap, weekStart, weekEnd), [tasks, assigneeMap, weekStart, weekEnd])

  return (
    <Modal open={open} onClose={onClose} title="Relatório da semana — equipe" width="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <button onClick={() => setWeekOffset((w) => w - 1)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200" aria-label="Semana anterior">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-slate-700">
            {format(weekStart, 'dd/MM', { locale: ptBR })} – {format(weekEnd, 'dd/MM/yyyy', { locale: ptBR })}
            {weekOffset === 0 && <span className="ml-1.5 font-normal text-brand-600">(semana atual)</span>}
          </span>
          <button onClick={() => setWeekOffset((w) => w + 1)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200" aria-label="Próxima semana">
            <ChevronRight size={16} />
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Nenhuma tarefa com movimento nessa semana.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-100 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">{r.name}</p>
                <div className="grid grid-cols-4 gap-2">
                  <StatCell value={r.completed} label="Concluídas" tone="good" />
                  <StatCell value={r.overdue} label="Atrasadas" tone={r.overdue > 0 ? 'bad' : 'neutral'} />
                  <StatCell value={r.dueThisWeek} label="Na semana" tone="neutral" />
                  <StatCell value={r.pending} label="Em aberto (total)" tone="neutral" />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" icon={<X size={14} />} onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** "Relatório da semana" — widget do Operacional, admin-only. Mostra, por
 *  responsável, quantas tarefas concluiu/atrasou/tem pendente numa semana
 *  navegável (não só a atual) — visão rápida de como está o resultado da
 *  equipe sem precisar abrir a ficha de cada tarefa. */
export function TeamWeeklyReportWidget() {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)

  if (profile?.role !== 'admin') return null

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500">
          <ClipboardList size={15} className="text-white" />
        </div>
        <p className="text-[16px] font-semibold text-slate-900">Relatório da semana</p>
      </div>
      <p className="text-sm text-slate-500">Veja como está o resultado e as tarefas de cada pessoa da equipe, semana a semana.</p>
      <Button variant="secondary" onClick={() => setOpen(true)} className="self-start">
        Ver relatório da semana
      </Button>

      <WeeklyReportModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

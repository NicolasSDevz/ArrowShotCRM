import { useMemo, useState } from 'react'
import { format, startOfWeek, endOfWeek, addWeeks, isWithinInterval } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAllTasks } from '../../hooks/useTasks'
import { useUsers } from '../../hooks/useUsers'
import { findUserIdByName } from '../../utils/userLookup'
import type { Task } from '../../types/task'

/** Só a equipe operacional entra no relatório — Bruno não tem tarefas
 *  atribuídas no dia a dia, então incluí-lo só adicionava uma linha vazia
 *  confusa no meio do relatório dela mesma. */
const TEAM_NAMES = ['Nicolas', 'Ciane', 'Jamilson']

interface PersonWeekStats {
  id: string
  name: string
  completed: number
  overdue: number
  pending: number
}

function computeStats(tasks: Task[], people: { id: string; name: string }[], weekStart: Date, weekEnd: Date): PersonWeekStats[] {
  return people.map(({ id, name }) => {
    const mine = tasks.filter((t) => t.assignedTo === id)
    const completed = mine.filter(
      (t) => t.status === 'done' && isWithinInterval(t.updatedAt.toDate(), { start: weekStart, end: weekEnd })
    ).length
    const overdue = mine.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate.toDate() < new Date()).length
    const pending = mine.filter((t) => t.status !== 'done').length
    return { id, name, completed, overdue, pending }
  })
}

/** "Relatório da semana" — widget do Operacional, admin-only. Mostra direto
 *  no card (sem precisar abrir nada) o resultado de Nicolas/Ciane/Jamilson
 *  numa semana navegável: quantas tarefas cada um concluiu, tem atrasada e
 *  tem em aberto. Antes abria um modal cheio de números confusos — agora é
 *  3 métricas por pessoa, direto na tela. */
export function TeamWeeklyReportWidget() {
  const { profile } = useAuth()
  const { data: tasks } = useAllTasks()
  const { data: users } = useUsers()
  const [weekOffset, setWeekOffset] = useState(0)

  const people = useMemo(
    () =>
      TEAM_NAMES.map((name) => ({ id: findUserIdByName(users, name), name }))
        .filter((p): p is { id: string; name: string } => !!p.id),
    [users]
  )

  const { weekStart, weekEnd } = useMemo(() => {
    const base = addWeeks(new Date(), weekOffset)
    return { weekStart: startOfWeek(base, { weekStartsOn: 1 }), weekEnd: endOfWeek(base, { weekStartsOn: 1 }) }
  }, [weekOffset])

  const rows = useMemo(() => computeStats(tasks, people, weekStart, weekEnd), [tasks, people, weekStart, weekEnd])

  if (profile?.role !== 'admin') return null

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500">
            <ClipboardList size={15} className="text-white" />
          </div>
          <p className="text-[16px] font-semibold text-slate-900">Relatório da semana</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekOffset((w) => w - 1)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Semana anterior">
            <ChevronLeft size={16} />
          </button>
          <span className="whitespace-nowrap text-xs font-medium text-slate-500">
            {format(weekStart, 'dd/MM', { locale: ptBR })}–{format(weekEnd, 'dd/MM', { locale: ptBR })}
          </span>
          <button onClick={() => setWeekOffset((w) => w + 1)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Próxima semana">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum membro da equipe encontrado.</p>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <p className="min-w-0 truncate text-sm font-semibold text-slate-800">{r.name}</p>
              <div className="flex shrink-0 items-center gap-4 text-xs">
                <span className="flex items-center gap-1">
                  <span className="font-bold text-emerald-600">{r.completed}</span>
                  <span className="text-slate-400">concluída{r.completed === 1 ? '' : 's'}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className={`font-bold ${r.overdue > 0 ? 'text-red-600' : 'text-slate-300'}`}>{r.overdue}</span>
                  <span className="text-slate-400">atrasada{r.overdue === 1 ? '' : 's'}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="font-bold text-slate-600">{r.pending}</span>
                  <span className="text-slate-400">em aberto</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

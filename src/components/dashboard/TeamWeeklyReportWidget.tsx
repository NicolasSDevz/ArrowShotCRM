import { useMemo, useState } from 'react'
import { format, startOfWeek, endOfWeek, subWeeks, differenceInCalendarDays, isWithinInterval } from 'date-fns'
import { ClipboardList, Target } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAllTasks } from '../../hooks/useTasks'
import { useUsers } from '../../hooks/useUsers'
import { useClients } from '../../hooks/useClients'
import { useOptimizationSchedule, useRecentOptimizations } from '../../hooks/useOptimizations'
import { findUserIdByName } from '../../utils/userLookup'
import { hasContractedPaidTraffic } from '../../utils/clientServices'
import { dateInputToTimestamp } from '../../utils/dateInput'
import type { Task } from '../../types/task'

/** Só a equipe operacional entra no relatório — Bruno não tem tarefas
 *  atribuídas no dia a dia, então incluí-lo só adicionava uma linha vazia
 *  confusa no meio do relatório dela mesma. */
const TEAM_NAMES = ['Nicolas', 'Ciane', 'Jamilson']
/** Só quem tem clientes de Tráfego Pago no calendário de otimizações entra
 *  na coluna de otimizações — Jamilson faz CS/Relacionamento, não otimiza
 *  campanha, então essa métrica não se aplica a ele. */
const OPTIMIZATION_GESTORES = ['Ciane', 'Nicolas']

interface PersonWeekStats {
  id: string
  name: string
  completed: number
  overdue: number
  pending: number
  optTotal: number
  optDone: number
  optOverdue: number
}

function toDateStr(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

function computeTaskStats(tasks: Task[], userId: string, start: Date, end: Date) {
  const mine = tasks.filter((t) => t.assignedTo === userId)
  const completed = mine.filter(
    (t) => t.status === 'done' && isWithinInterval(t.updatedAt.toDate(), { start, end })
  ).length
  const overdue = mine.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate.toDate() < new Date()).length
  const pending = mine.filter((t) => t.status !== 'done').length
  return { completed, overdue, pending }
}

/** Pra cada dia do intervalo em que o cliente está agendado (calendário de
 *  otimizações), confere se existe um registro de otimização daquele
 *  cliente naquele dia — "feita" se existe, "atrasada" se o dia já passou e
 *  não existe. Mesma lógica do card "Otimizações de hoje — equipe", só que
 *  varrendo o intervalo inteiro em vez de um único dia. */
function computeOptimizationStats(
  rows: { clientId: string; userId: string; weekdays: number[] }[],
  optimizations: { clientId: string; date: { toDate: () => Date } }[],
  clientIds: Set<string>,
  userId: string,
  start: Date,
  end: Date
) {
  const doneKeys = new Set(optimizations.map((o) => `${o.clientId}_${toDateStr(o.date.toDate())}`))
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const myRows = rows.filter((r) => r.userId === userId && clientIds.has(r.clientId))
  let total = 0
  let done = 0
  let overdue = 0
  const totalDays = Math.max(0, differenceInCalendarDays(end, start)) + 1
  for (let i = 0; i < totalDays; i++) {
    const day = new Date(start)
    day.setDate(day.getDate() + i)
    const dow = day.getDay()
    const isPast = day < today
    for (const row of myRows) {
      if (!row.weekdays.includes(dow)) continue
      total++
      const key = `${row.clientId}_${toDateStr(day)}`
      if (doneKeys.has(key)) done++
      else if (isPast) overdue++
    }
  }
  return { total, done, overdue }
}

type Preset = 'this_week' | 'last_week' | 'custom'

/** "Relatório da semana" — widget do Operacional, admin-only. Mostra direto
 *  no card (sem precisar abrir nada) o resultado de Nicolas/Ciane/Jamilson
 *  num intervalo de datas escolhido livremente: tarefas concluídas/
 *  atrasadas/em aberto, e — pra quem tem cliente de Tráfego Pago — quantas
 *  otimizações foram feitas e quantas ficaram em atraso no período. */
export function TeamWeeklyReportWidget() {
  const { profile } = useAuth()
  const { data: tasks } = useAllTasks()
  const { data: users } = useUsers()
  const { data: clients } = useClients()
  const { rows: scheduleRows } = useOptimizationSchedule()

  const thisWeek = { start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: endOfWeek(new Date(), { weekStartsOn: 1 }) }
  const [preset, setPreset] = useState<Preset>('this_week')
  const [rangeStart, setRangeStart] = useState(toDateStr(thisWeek.start))
  const [rangeEnd, setRangeEnd] = useState(toDateStr(thisWeek.end))

  const applyPreset = (p: Preset) => {
    setPreset(p)
    if (p === 'this_week') {
      setRangeStart(toDateStr(thisWeek.start))
      setRangeEnd(toDateStr(thisWeek.end))
    } else if (p === 'last_week') {
      const lastWeek = { start: subWeeks(thisWeek.start, 1), end: subWeeks(thisWeek.end, 1) }
      setRangeStart(toDateStr(lastWeek.start))
      setRangeEnd(toDateStr(lastWeek.end))
    }
  }

  const start = dateInputToTimestamp(rangeStart)?.toDate() ?? thisWeek.start
  const end = dateInputToTimestamp(rangeEnd)?.toDate() ?? thisWeek.end
  end.setHours(23, 59, 59, 999)

  // useRecentOptimizations exige "quantos dias pra trás" — cobre o início do
  // intervalo escolhido com uma margem de segurança.
  const daysBack = Math.max(differenceInCalendarDays(new Date(), start) + 2, 7)
  const { data: recentOptimizations } = useRecentOptimizations(daysBack)
  const optimizationsInRange = useMemo(
    () => recentOptimizations.filter((o) => isWithinInterval(o.date.toDate(), { start, end })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recentOptimizations, rangeStart, rangeEnd]
  )

  const eligibleClientIds = useMemo(
    () => new Set(clients.filter((c) => c.status !== 'churned' && hasContractedPaidTraffic(c)).map((c) => c.id)),
    [clients]
  )

  const people = useMemo(
    () => TEAM_NAMES.map((name) => ({ id: findUserIdByName(users, name), name })).filter((p): p is { id: string; name: string } => !!p.id),
    [users]
  )

  const rows: PersonWeekStats[] = useMemo(
    () =>
      people.map(({ id, name }) => {
        const taskStats = computeTaskStats(tasks, id, start, end)
        const optStats = OPTIMIZATION_GESTORES.includes(name)
          ? computeOptimizationStats(scheduleRows, optimizationsInRange, eligibleClientIds, id, start, end)
          : { total: 0, done: 0, overdue: 0 }
        return { id, name, ...taskStats, optTotal: optStats.total, optDone: optStats.done, optOverdue: optStats.overdue }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, tasks, scheduleRows, optimizationsInRange, eligibleClientIds, rangeStart, rangeEnd]
  )

  if (profile?.role !== 'admin') return null

  return (
    <div className="flex h-full min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500">
            <ClipboardList size={15} className="text-white" />
          </div>
          <p className="text-[16px] font-semibold text-slate-900">Relatório da semana</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['this_week', 'last_week'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => applyPreset(p)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                preset === p ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p === 'this_week' ? 'Essa semana' : 'Semana passada'}
            </button>
          ))}
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1">
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => {
                setRangeStart(e.target.value)
                setPreset('custom')
              }}
              className="bg-transparent text-xs outline-none"
              aria-label="Data inicial"
            />
            <span className="text-slate-400">–</span>
            <input
              type="date"
              value={rangeEnd}
              onChange={(e) => {
                setRangeEnd(e.target.value)
                setPreset('custom')
              }}
              className="bg-transparent text-xs outline-none"
              aria-label="Data final"
            />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum membro da equipe encontrado.</p>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
              <p className="min-w-0 truncate text-sm font-semibold text-slate-800">{r.name}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1">
                  <span className="font-bold text-emerald-600">{r.completed}</span>
                  <span className="text-slate-400">tarefa{r.completed === 1 ? '' : 's'} concluída{r.completed === 1 ? '' : 's'}</span>
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
              {r.optTotal > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="flex items-center gap-1 text-violet-600">
                    <Target size={11} />
                    <span className="font-bold">{r.optDone}</span>
                    <span className="text-slate-400">otimizaç{r.optDone === 1 ? 'ão feita' : 'ões feitas'}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`font-bold ${r.optOverdue > 0 ? 'text-red-600' : 'text-slate-300'}`}>{r.optOverdue}</span>
                    <span className="text-slate-400">otimizaç{r.optOverdue === 1 ? 'ão' : 'ões'} em atraso</span>
                  </span>
                  <span className="text-slate-400">({r.optTotal} agendadas no período)</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

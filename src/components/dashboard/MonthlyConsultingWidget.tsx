import { useMemo, useState } from 'react'
import { addMonths, format, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { useAllMeetings } from '../../hooks/useMeetings'
import { useAllTasks } from '../../hooks/useTasks'
import { getConsultingStatus, monthlyConsultingTaskId, type ConsultingStatusRow } from '../../services/monthlyConsultingTask'
import { TaskDrawer } from '../tasks/TaskDrawer'

const OWNER_EMAIL = 'gestorarrowshotmkt@gmail.com'

function statusOf(row: ConsultingStatusRow): { label: string; className: string } {
  if (row.done) return { label: 'Realizada', className: 'bg-emerald-50 text-emerald-700' }
  if (row.scheduled) return { label: 'Agendada', className: 'bg-blue-50 text-blue-700' }
  return { label: 'Sem agendar', className: 'bg-red-50 text-red-600' }
}

/** Widget "Consultorias do mês", visível SÓ para Bruno (Admin) — mostra, por
 *  cliente ativo, se a Consultoria Mensal do mês foi agendada e realizada
 *  (mesma regra da tarefa automática do Jamilson, ver
 *  monthlyConsultingTask.ts), calculado direto das reuniões. Setas trocam o
 *  mês; o botão abre a tarefa do Jamilson daquele mês, se existir. */
export function MonthlyConsultingWidget({ onNavigateClient }: { onNavigateClient: (clientId: string) => void }) {
  const { profile } = useAuth()
  const { data: clients } = useClients()
  const { data: meetings } = useAllMeetings()
  const { data: tasks } = useAllTasks()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [taskOpen, setTaskOpen] = useState(false)

  const rows = useMemo(() => getConsultingStatus(clients, meetings, month), [clients, meetings, month])
  const doneCount = rows.filter((r) => r.done).length
  const scheduledCount = rows.filter((r) => r.scheduled && !r.done).length
  const missingCount = rows.filter((r) => !r.scheduled).length
  // Pendentes primeiro (sem agendar → agendada → realizada) pro Bruno ver o que falta.
  const sorted = useMemo(
    () => [...rows].sort((a, b) => Number(a.done) * 2 + Number(a.scheduled) - (Number(b.done) * 2 + Number(b.scheduled))),
    [rows]
  )
  const monthTask = tasks.find((t) => t.id === monthlyConsultingTaskId(month)) ?? null
  const isCurrentMonth = isSameMonth(month, new Date())

  const canSee = profile?.role === 'admin' || profile?.email === OWNER_EMAIL
  if (!canSee) return null

  const title = format(month, "MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div className="h-full rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]" style={{ borderLeft: '4px solid #E11D48' }} data-dash-accent>
      <div className="flex flex-wrap items-center gap-2">
        <CalendarCheck size={16} className="text-rose-500" />
        <p className="text-[16px] font-semibold text-slate-900">Consultorias do mês</p>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[120px] text-center text-sm font-medium capitalize text-slate-700">{title}</span>
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            disabled={isCurrentMonth}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Próximo mês"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <p className="text-[13px] text-[#64748B]">Consultoria Mensal de cada cliente ativo — tarefa do Jamilson.</p>

      <p className="mt-3 text-xs font-medium text-slate-500">
        ✅ {doneCount} realizadas · 📅 {scheduledCount} agendadas · ⚠️ {missingCount} sem agendar
      </p>

      <div className="mt-3 flex flex-col">
        {sorted.length === 0 ? (
          <p className="py-1.5 text-sm text-slate-400">Nenhum cliente ativo.</p>
        ) : (
          sorted.map((row) => {
            const st = statusOf(row)
            return (
              <button
                key={row.client.id}
                type="button"
                onClick={() => onNavigateClient(row.client.id)}
                className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-in-out hover:bg-slate-50"
              >
                <span className="truncate text-sm font-medium text-slate-900">{row.client.companyName}</span>
                {row.meetingAt && (
                  <span className="shrink-0 text-xs text-slate-400">
                    {format(row.meetingAt, 'dd/MM', { locale: ptBR })}
                    {row.meeting?.time ? ` às ${row.meeting.time}` : ''}
                  </span>
                )}
                <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.className}`}>{st.label}</span>
              </button>
            )
          })
        )}
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        {monthTask ? (
          <button type="button" onClick={() => setTaskOpen(true)} className="text-sm font-medium text-brand-600 hover:underline">
            Abrir tarefa do Jamilson ({monthTask.status === 'done' ? 'concluída' : 'em aberto'})
          </button>
        ) : (
          <p className="text-xs text-slate-400">Sem tarefa do Jamilson para este mês.</p>
        )}
      </div>

      <TaskDrawer key={`consulting-task-${taskOpen ? monthTask?.id : 'none'}`} task={taskOpen ? monthTask : null} onClose={() => setTaskOpen(false)} />
    </div>
  )
}

import { useId, useMemo, useState, type ReactNode } from 'react'
import { addMonths, format, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AlertCircle, CalendarCheck, CalendarClock, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, ListChecks } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { useAllMeetings } from '../../hooks/useMeetings'
import { useAllTasks } from '../../hooks/useTasks'
import { resolveRoutinePersonKey } from '../../services/dailyRoutineTemplates'
import { getConsultingStatus, monthlyConsultingTaskId, type ConsultingStatusRow } from '../../services/monthlyConsultingTask'
import { TaskDrawer } from '../tasks/TaskDrawer'
import { MeetingFormModal } from '../meetings/MeetingFormModal'

const OWNER_EMAIL = 'gestorarrowshotmkt@gmail.com'

type Group = 'missing' | 'scheduled' | 'done'

const GROUP_META: Record<Group, { title: string; icon: typeof AlertCircle; pill: string; dot: string; tile: string; number: string }> = {
  missing: {
    title: 'Sem agendar',
    icon: AlertCircle,
    pill: 'bg-red-50 text-red-700 ring-red-100',
    dot: 'bg-red-500',
    tile: 'bg-red-50/70 ring-red-100',
    number: 'text-red-600',
  },
  scheduled: {
    title: 'Agendadas',
    icon: CalendarClock,
    pill: 'bg-blue-50 text-blue-700 ring-blue-100',
    dot: 'bg-blue-500',
    tile: 'bg-blue-50/70 ring-blue-100',
    number: 'text-blue-600',
  },
  done: {
    title: 'Realizadas',
    icon: CheckCircle2,
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    dot: 'bg-emerald-500',
    tile: 'bg-emerald-50/70 ring-emerald-100',
    number: 'text-emerald-600',
  },
}

function groupOf(row: ConsultingStatusRow): Group {
  if (row.done) return 'done'
  if (row.scheduled) return 'scheduled'
  return 'missing'
}

/** Data falada/escrita por extenso — "quarta-feira, 15 de outubro, às 14:00". */
function meetingLabel(row: ConsultingStatusRow): string {
  if (!row.meetingAt) return 'Nenhuma reunião marcada neste mês'
  const day = format(row.meetingAt, "EEEE, d 'de' MMMM", { locale: ptBR })
  const time = row.meeting?.time ? `, às ${row.meeting.time}` : ''
  return `${row.done ? 'Realizada' : 'Marcada'} ${row.done ? 'em' : 'para'} ${day}${time}`
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

function ClientRow({
  row,
  onNavigateClient,
  onSchedule,
}: {
  row: ConsultingStatusRow
  onNavigateClient: (clientId: string) => void
  onSchedule: (clientId: string) => void
}) {
  const group = groupOf(row)
  const meta = GROUP_META[group]
  const Icon = meta.icon
  const name = row.client.companyName

  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-150 hover:bg-slate-50">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600"
      >
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onNavigateClient(row.client.id)}
          className="block max-w-full truncate text-left text-sm font-semibold text-slate-900 hover:underline"
          aria-label={`${name}. ${meta.title.replace(/s$/, '')}. ${meetingLabel(row)}. Abrir ficha do cliente`}
        >
          {name}
        </button>
        <p className="truncate text-xs text-slate-500" aria-hidden="true">
          {meetingLabel(row)}
        </p>
      </div>
      <span
        aria-hidden="true"
        className={`hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 sm:inline-flex ${meta.pill}`}
      >
        <Icon size={12} />
        {meta.title.replace(/s$/, '')}
      </span>
      {group === 'missing' && (
        <button
          type="button"
          onClick={() => onSchedule(row.client.id)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          aria-label={`Agendar consultoria de ${name}`}
        >
          <CalendarPlus size={13} aria-hidden="true" />
          Agendar
        </button>
      )}
    </li>
  )
}

function GroupSection({ group, rows, children }: { group: Group; rows: ConsultingStatusRow[]; children: ReactNode }) {
  const headingId = useId()
  const meta = GROUP_META[group]
  if (rows.length === 0) return null
  return (
    <section aria-labelledby={headingId}>
      <h4 id={headingId} className="mb-1 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${meta.dot}`} />
        {meta.title}
        <span className="sr-only">:</span> {rows.length}
      </h4>
      <ul className="flex flex-col">{children}</ul>
    </section>
  )
}

/** Widget "Consultorias do mês" — Bruno (Admin) e Jamilson (CS). Mostra, por
 *  cliente ativo, se a Consultoria Mensal do mês foi agendada e realizada
 *  (mesma regra da tarefa automática do Jamilson, ver
 *  monthlyConsultingTask.ts), calculado direto das reuniões. Pendentes têm
 *  o botão "Agendar", que abre o formulário de reunião já no tipo
 *  Consultoria Mensal e com o cliente escolhido.
 *  Acessibilidade: o Jamilson é cego e usa leitor de tela — cada linha tem
 *  um rótulo falado completo (cliente, situação e data por extenso), seções
 *  com títulos, botões nomeados e troca de mês anunciada. */
export function MonthlyConsultingWidget({ onNavigateClient }: { onNavigateClient: (clientId: string) => void }) {
  const { profile } = useAuth()
  const { data: clients } = useClients()
  const { data: meetings } = useAllMeetings()
  const { data: tasks } = useAllTasks()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [taskOpen, setTaskOpen] = useState(false)
  const [scheduleClientId, setScheduleClientId] = useState<string | null>(null)
  const headingId = useId()

  const rows = useMemo(() => getConsultingStatus(clients, meetings, month), [clients, meetings, month])
  const grouped = useMemo(() => {
    const g: Record<Group, ConsultingStatusRow[]> = { missing: [], scheduled: [], done: [] }
    for (const r of rows) g[groupOf(r)].push(r)
    g.scheduled.sort((a, b) => (a.meetingAt?.getTime() ?? 0) - (b.meetingAt?.getTime() ?? 0))
    return g
  }, [rows])
  const monthTask = tasks.find((t) => t.id === monthlyConsultingTaskId(month)) ?? null
  const isCurrentMonth = isSameMonth(month, new Date())

  const isJamilson = !!profile && resolveRoutinePersonKey(profile.name) === 'jamilson'
  const canSee = profile?.role === 'admin' || profile?.email === OWNER_EMAIL || isJamilson
  if (!canSee) return null

  const total = rows.length
  const counts = { missing: grouped.missing.length, scheduled: grouped.scheduled.length, done: grouped.done.length }
  const pct = (n: number) => (total ? (n / total) * 100 : 0)
  const monthName = format(month, "MMMM 'de' yyyy", { locale: ptBR })
  const summary =
    total === 0
      ? 'Nenhum cliente ativo.'
      : `${counts.done} de ${total} consultorias realizadas. ${counts.scheduled} agendadas e ${counts.missing} sem agendar.`

  return (
    <section
      aria-labelledby={headingId}
      className="h-full rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
      style={{ borderLeft: '4px solid #E11D48' }}
      data-dash-accent
    >
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
          <CalendarCheck size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="text-[16px] font-semibold text-slate-900">
            Consultorias do mês
          </h3>
          <p className="text-[13px] text-slate-500">Consultoria Mensal de cada cliente ativo.</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1" role="group" aria-label="Escolher mês">
          <button
            type="button"
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
            aria-label={`Ver mês anterior, ${format(subMonths(month, 1), "MMMM 'de' yyyy", { locale: ptBR })}`}
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <span className="min-w-[128px] text-center text-sm font-semibold capitalize text-slate-700" aria-live="polite">
            {monthName}
          </span>
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            disabled={isCurrentMonth}
            className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-white hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label={isCurrentMonth ? 'Próximo mês, indisponível' : `Ver próximo mês, ${format(addMonths(month, 1), "MMMM 'de' yyyy", { locale: ptBR })}`}
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Resumo: lido primeiro pelo leitor de tela, em uma frase. */}
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      {total > 0 && (
        <div aria-hidden="true" className="mt-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-slate-900">{counts.done}</span>
            <span className="text-sm text-slate-500">de {total} realizadas</span>
            <span className="ml-auto text-sm font-semibold text-slate-700">{Math.round(pct(counts.done))}%</span>
          </div>
          <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct(counts.done)}%` }} />
            <div className="h-full bg-blue-400 transition-all" style={{ width: `${pct(counts.scheduled)}%` }} />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {(['missing', 'scheduled', 'done'] as Group[]).map((g) => {
              const meta = GROUP_META[g]
              const Icon = meta.icon
              return (
                <div key={g} className={`rounded-xl px-3 py-2.5 ring-1 ${meta.tile}`}>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                    <Icon size={13} className={meta.number} />
                    {meta.title}
                  </div>
                  <p className={`mt-0.5 text-xl font-bold ${meta.number}`}>{counts[g]}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Listas por situação — pendentes primeiro. */}
      <div className="mt-4 flex flex-col gap-3">
        {total === 0 ? (
          <p className="py-2 text-sm text-slate-400">Nenhum cliente ativo.</p>
        ) : (
          <>
            {counts.missing === 0 && counts.scheduled === 0 && (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                Todas as consultorias de {monthName} foram realizadas.
              </p>
            )}
            {(['missing', 'scheduled', 'done'] as Group[]).map((g) => (
              <GroupSection key={g} group={g} rows={grouped[g]}>
                {grouped[g].map((row) => (
                  <ClientRow key={row.client.id} row={row} onNavigateClient={onNavigateClient} onSchedule={setScheduleClientId} />
                ))}
              </GroupSection>
            ))}
          </>
        )}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        {monthTask ? (
          <button
            type="button"
            onClick={() => setTaskOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
          >
            <ListChecks size={15} aria-hidden="true" />
            {isJamilson ? 'Abrir minha tarefa deste mês' : 'Abrir tarefa do Jamilson'}
            <span className="text-slate-400">({monthTask.status === 'done' ? 'concluída' : 'em aberto'})</span>
          </button>
        ) : (
          <p className="text-xs text-slate-400">Sem tarefa de consultorias para este mês.</p>
        )}
      </div>

      <TaskDrawer key={`consulting-task-${taskOpen ? monthTask?.id : 'none'}`} task={taskOpen ? monthTask : null} onClose={() => setTaskOpen(false)} />
      <MeetingFormModal
        key={`consulting-schedule-${scheduleClientId ?? 'none'}`}
        open={!!scheduleClientId}
        onClose={() => setScheduleClientId(null)}
        defaultClientId={scheduleClientId ?? undefined}
        defaultType="monthly_consulting"
        title="Agendar consultoria mensal"
      />
    </section>
  )
}

import { useMemo, useState, type ReactNode } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isTomorrow,
  isYesterday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  addDays,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Video, X } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import {
  MEETING_TYPE_DOT,
  MEETING_TYPE_LABEL,
  MEETING_TYPE_BADGE,
  meetingEnd,
  meetingMissingRecord,
  meetingStartEnd,
  type Meeting,
  type MeetingType,
} from '../../types'

type Person = { id: string; name: string; photoURL?: string }
type View = 'upcoming' | 'past' | 'missing'

const hhmm = (d: Date) => format(d, 'HH:mm')
const startOf = (m: Meeting) => meetingStartEnd(m)?.start ?? m.date.toDate()

function dayHeading(date: Date) {
  const full = format(date, "EEEE, d 'de' MMMM", { locale: ptBR })
  if (isToday(date)) return { title: 'Hoje', sub: full }
  if (isTomorrow(date)) return { title: 'Amanhã', sub: full }
  if (isYesterday(date)) return { title: 'Ontem', sub: full }
  return { title: format(date, 'EEEE', { locale: ptBR }), sub: format(date, "d 'de' MMMM", { locale: ptBR }) }
}

/** Visual de agenda da página Reuniões (todo mundo menos o Jamilson, que
 *  continua com a lista simples do MeetingSections — melhor pro leitor de tela). */
export function MeetingsAgenda({
  meetings,
  clientName,
  participantsOf,
  onOpen,
}: {
  meetings: Meeting[]
  clientName: (m: Meeting) => string | undefined
  participantsOf: (m: Meeting) => Person[]
  onOpen: (m: Meeting) => void
}) {
  const now = new Date()
  const [view, setView] = useState<View>('upcoming')
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [monthCursor, setMonthCursor] = useState(new Date())
  const [pastLimit, setPastLimit] = useState(15)

  const stats = useMemo(() => {
    const today = meetings.filter((m) => isToday(m.date.toDate()))
    const weekEnd = addDays(startOfDay(now), 7)
    const next7 = meetings.filter((m) => meetingEnd(m) >= now && startOf(m) < weekEnd)
    const missing = meetings.filter((m) => meetingMissingRecord(m, now))
    const doneThisMonth = meetings.filter((m) => meetingEnd(m) < now && isSameMonth(m.date.toDate(), now))
    const nextOne = meetings
      .filter((m) => meetingEnd(m) >= now)
      .sort((a, b) => startOf(a).getTime() - startOf(b).getTime())[0]
    return { today: today.length, next7: next7.length, missing: missing.length, doneThisMonth: doneThisMonth.length, nextOne }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings])

  const list = useMemo(() => {
    let base: Meeting[]
    if (selectedDay) base = meetings.filter((m) => isSameDay(m.date.toDate(), selectedDay))
    else if (view === 'upcoming') base = meetings.filter((m) => meetingEnd(m) >= now)
    else if (view === 'missing') base = meetings.filter((m) => meetingMissingRecord(m, now))
    else base = meetings.filter((m) => meetingEnd(m) < now)
    const asc = selectedDay || view === 'upcoming'
    return [...base].sort((a, b) => (asc ? 1 : -1) * (startOf(a).getTime() - startOf(b).getTime()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, view, selectedDay])

  const limited = view === 'upcoming' || selectedDay ? list : list.slice(0, pastLimit)

  const groups = useMemo(() => {
    const out: { day: Date; items: Meeting[] }[] = []
    for (const m of limited) {
      const d = startOfDay(m.date.toDate())
      const last = out[out.length - 1]
      if (last && isSameDay(last.day, d)) last.items.push(m)
      else out.push({ day: d, items: [m] })
    }
    return out
  }, [limited])

  const typesInUse = useMemo(() => Array.from(new Set(meetings.map((m) => m.type))) as MeetingType[], [meetings])

  return (
    <div className="flex flex-col gap-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<CalendarDays size={16} />} tone="brand" label="Hoje" value={stats.today} />
        <StatCard icon={<Clock size={16} />} tone="blue" label="Próximos 7 dias" value={stats.next7} />
        <StatCard
          icon={<AlertCircle size={16} />}
          tone="amber"
          label="Falta registrar"
          value={stats.missing}
          onClick={stats.missing > 0 ? () => { setSelectedDay(null); setView('missing') } : undefined}
        />
        <StatCard icon={<CheckCircle2 size={16} />} tone="emerald" label="Realizadas no mês" value={stats.doneThisMonth} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Agenda */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {(
                [
                  ['upcoming', 'Próximas'],
                  ['past', 'Anteriores'],
                  ['missing', `Falta registrar${stats.missing ? ` (${stats.missing})` : ''}`],
                ] as [View, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => {
                    setSelectedDay(null)
                    setView(v)
                  }}
                  aria-pressed={!selectedDay && view === v}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                    !selectedDay && view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {selectedDay && (
              <button
                onClick={() => setSelectedDay(null)}
                className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 hover:bg-brand-100"
              >
                {format(selectedDay, "EEEE, dd/MM", { locale: ptBR })}
                <X size={13} aria-hidden="true" />
                <span className="sr-only">Limpar dia selecionado</span>
              </button>
            )}
          </div>

          {groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center">
              <CalendarDays size={26} className="text-slate-300" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-600">
                {selectedDay
                  ? 'Nenhuma reunião neste dia'
                  : view === 'missing'
                    ? 'Tudo registrado'
                    : view === 'upcoming'
                      ? 'Nenhuma reunião marcada daqui pra frente'
                      : 'Nenhuma reunião anterior'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map(({ day, items }) => {
                const h = dayHeading(day)
                return (
                  <section key={day.toISOString()} aria-label={`${h.title}, ${h.sub}`}>
                    <div className="mb-2 flex items-baseline gap-2">
                      <h3 className={`text-sm font-bold capitalize ${isToday(day) ? 'text-brand-700' : 'text-slate-800'}`}>{h.title}</h3>
                      <span className="text-xs capitalize text-slate-400">{h.sub}</span>
                      <span className="ml-auto text-xs text-slate-400">
                        {items.length} {items.length === 1 ? 'reunião' : 'reuniões'}
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {items.map((m) => (
                        <li key={m.id}>
                          <AgendaCard meeting={m} clientName={clientName(m)} participants={participantsOf(m)} onOpen={() => onOpen(m)} now={now} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
              {!selectedDay && view !== 'upcoming' && list.length > limited.length && (
                <button
                  onClick={() => setPastLimit((n) => n + 15)}
                  className="self-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Ver mais ({list.length - limited.length})
                </button>
              )}
            </div>
          )}
        </div>

        {/* Lateral */}
        <aside className="flex flex-col gap-4">
          {stats.nextOne && (
            <NextMeetingCard
              meeting={stats.nextOne}
              clientName={clientName(stats.nextOne)}
              onOpen={() => onOpen(stats.nextOne!)}
              now={now}
            />
          )}
          <MiniMonth
            meetings={meetings}
            cursor={monthCursor}
            onCursor={setMonthCursor}
            selected={selectedDay}
            onSelect={(d) => setSelectedDay((cur) => (cur && isSameDay(cur, d) ? null : d))}
          />
          {typesInUse.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Tipos</p>
              <ul className="flex flex-col gap-1.5">
                {typesInUse.map((t) => (
                  <li key={t} className="flex items-center gap-2 text-sm text-slate-600">
                    <span className={`h-2.5 w-2.5 rounded-full ${MEETING_TYPE_DOT[t]}`} aria-hidden="true" />
                    {MEETING_TYPE_LABEL[t]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: ReactNode
  label: string
  value: number
  tone: 'brand' | 'blue' | 'amber' | 'emerald'
  onClick?: () => void
}) {
  const toneCls = {
    brand: 'bg-brand-50 text-brand-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  }[tone]
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-[0_1px_4px_rgba(0,0,0,0.04)] ${
        onClick ? 'transition-colors hover:border-amber-300' : ''
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneCls}`} aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-none text-slate-900">{value}</span>
        <span className="mt-1 block truncate text-xs font-medium text-slate-500">{label}</span>
      </span>
    </Comp>
  )
}

function AgendaCard({
  meeting,
  clientName,
  participants,
  onOpen,
  now,
}: {
  meeting: Meeting
  clientName?: string
  participants: Person[]
  onOpen: () => void
  now: Date
}) {
  const range = meetingStartEnd(meeting)
  const ended = meetingEnd(meeting) < now
  const live = !!range && range.start <= now && now <= range.end
  const missing = meetingMissingRecord(meeting, now)
  const title = clientName ?? MEETING_TYPE_LABEL[meeting.type]
  const decisions = meeting.decisions?.trim()

  return (
    <div
      onClick={onOpen}
      className={`group relative flex cursor-pointer items-stretch gap-0 overflow-hidden rounded-xl border bg-white transition-all duration-150 hover:-translate-y-px hover:shadow-md ${
        live ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200'
      } ${ended && !missing ? 'opacity-80' : ''}`}
    >
      <span className={`w-1 shrink-0 ${MEETING_TYPE_DOT[meeting.type]}`} aria-hidden="true" />
      <div className="flex w-20 shrink-0 flex-col justify-center border-r border-slate-100 px-3 py-3 text-center">
        {range ? (
          <>
            <span className="text-base font-bold text-slate-900">{hhmm(range.start)}</span>
            <span className="text-xs text-slate-400">{hhmm(range.end)}</span>
          </>
        ) : (
          <span className="text-xs text-slate-400">Dia todo</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
            className="truncate text-left text-[15px] font-semibold text-slate-900 group-hover:text-brand-700"
          >
            {title}
          </button>
          {live && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" /> Agora
            </span>
          )}
          {missing && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Falta registrar</span>
          )}
          {ended && !missing && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Realizada</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className={`rounded-md px-1.5 py-0.5 font-medium ${MEETING_TYPE_BADGE[meeting.type]}`}>{MEETING_TYPE_LABEL[meeting.type]}</span>
          {meeting.meetLink && (
            <span className="flex items-center gap-1">
              <Video size={12} aria-hidden="true" /> Meet{meeting.autoRecording ? ' com gravação' : ''}
            </span>
          )}
        </div>
        {decisions && <p className="truncate text-xs text-slate-500">Decisões: {decisions}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3 pr-4">
        {participants.length > 0 && (
          <div className="hidden items-center -space-x-1.5 sm:flex" aria-hidden="true">
            {participants.slice(0, 4).map((p) => (
              <span key={p.id} className="rounded-full ring-2 ring-white">
                <Avatar name={p.name} photoURL={p.photoURL} size="sm" />
              </span>
            ))}
            {participants.length > 4 && (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500 ring-2 ring-white">
                +{participants.length - 4}
              </span>
            )}
          </div>
        )}
        {meeting.meetLink && !ended && (
          <a
            href={meeting.meetLink}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              live ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            <Video size={13} aria-hidden="true" /> Entrar
          </a>
        )}
      </div>
    </div>
  )
}

function NextMeetingCard({ meeting, clientName, onOpen, now }: { meeting: Meeting; clientName?: string; onOpen: () => void; now: Date }) {
  const range = meetingStartEnd(meeting)
  const live = !!range && range.start <= now && now <= range.end
  const minutes = range ? Math.round((range.start.getTime() - now.getTime()) / 60_000) : null
  const when = live
    ? 'Acontecendo agora'
    : minutes !== null && minutes < 60 && minutes >= 0
      ? `Começa em ${minutes} min`
      : `${isToday(meeting.date.toDate()) ? 'Hoje' : isTomorrow(meeting.date.toDate()) ? 'Amanhã' : format(meeting.date.toDate(), "EEE, dd/MM", { locale: ptBR })}${range ? ` às ${hhmm(range.start)}` : ''}`
  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white shadow-md">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{live ? 'Agora' : 'Próxima reunião'}</p>
      <button onClick={onOpen} className="mt-1 block text-left text-lg font-bold leading-tight text-white hover:underline">
        {clientName ?? MEETING_TYPE_LABEL[meeting.type]}
      </button>
      <p className="mt-0.5 text-sm text-white/80">{clientName ? MEETING_TYPE_LABEL[meeting.type] : ''}</p>
      <p className="mt-3 flex items-center gap-1.5 text-sm font-medium capitalize">
        <Clock size={14} aria-hidden="true" /> {when}
      </p>
      {meeting.meetLink && (
        <a
          href={meeting.meetLink}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          <Video size={14} aria-hidden="true" /> Entrar no Meet
        </a>
      )}
    </div>
  )
}

function MiniMonth({
  meetings,
  cursor,
  onCursor,
  selected,
  onSelect,
}: {
  meetings: Meeting[]
  cursor: Date
  onCursor: (d: Date) => void
  selected: Date | null
  onSelect: (d: Date) => void
}) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor)), end: endOfWeek(endOfMonth(cursor)) })
  const byDay = useMemo(() => {
    const map = new Map<string, MeetingType[]>()
    for (const m of meetings) {
      const k = format(m.date.toDate(), 'yyyy-MM-dd')
      map.set(k, [...(map.get(k) ?? []), m.type])
    }
    return map
  }, [meetings])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold capitalize text-slate-800">{format(cursor, 'MMMM yyyy', { locale: ptBR })}</p>
        <div className="flex gap-1">
          <button onClick={() => onCursor(subMonths(cursor, 1))} aria-label="Mês anterior" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => onCursor(addMonths(cursor, 1))} aria-label="Próximo mês" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-[10px] font-semibold text-slate-400">
            {d}
          </span>
        ))}
        {days.map((day) => {
          const types = byDay.get(format(day, 'yyyy-MM-dd')) ?? []
          const inMonth = isSameMonth(day, cursor)
          const isSel = !!selected && isSameDay(day, selected)
          const today = isToday(day)
          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelect(day)}
              aria-label={`${format(day, "d 'de' MMMM", { locale: ptBR })}, ${types.length} reuniões`}
              aria-pressed={isSel}
              className={`mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-lg text-xs transition-colors ${
                isSel
                  ? 'bg-brand-600 font-bold text-white'
                  : today
                    ? 'bg-brand-50 font-bold text-brand-700'
                    : inMonth
                      ? 'text-slate-700 hover:bg-slate-100'
                      : 'text-slate-300 hover:bg-slate-50'
              }`}
            >
              {format(day, 'd')}
              <span className="mt-0.5 flex h-1 gap-0.5" aria-hidden="true">
                {types.slice(0, 3).map((t, i) => (
                  <span key={i} className={`h-1 w-1 rounded-full ${isSel ? 'bg-white' : MEETING_TYPE_DOT[t]}`} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

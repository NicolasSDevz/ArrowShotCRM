import { useMemo, useState, type ReactNode } from 'react'
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isWeekend,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Cake, CalendarClock, CheckSquare, ChevronLeft, ChevronRight, Video, X } from 'lucide-react'

export type CalItemKind = 'task' | 'meeting' | 'internalMeeting' | 'event' | 'birthday'

export type CalItem = {
  id: string
  title: string
  kind: CalItemKind
  date: Date
  /** "HH:mm" quando o item tem horário. */
  time?: string
  clientName?: string
  link?: string
  /** Classe da cor sólida (bolinha/barra) — reuniões usam a cor do tipo. */
  dot?: string
}

const KIND_LABEL: Record<CalItemKind, string> = {
  task: 'Tarefa',
  meeting: 'Google Agenda',
  internalMeeting: 'Reunião',
  event: 'Evento',
  birthday: 'Aniversário',
}

const KIND_DOT: Record<CalItemKind, string> = {
  task: 'bg-slate-400',
  meeting: 'bg-amber-500',
  internalMeeting: 'bg-brand-500',
  event: 'bg-violet-500',
  birthday: 'bg-pink-500',
}

function KindIcon({ kind, size = 12 }: { kind: CalItemKind; size?: number }) {
  if (kind === 'task') return <CheckSquare size={size} aria-hidden="true" />
  if (kind === 'birthday') return <Cake size={size} aria-hidden="true" />
  if (kind === 'event') return <CalendarClock size={size} aria-hidden="true" />
  return <Video size={size} aria-hidden="true" />
}

const sortByTime = (a: CalItem, b: CalItem) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99')

/** Calendário com visual de app (mês e semana) — usado por todo mundo menos o
 *  Jamilson, que continua com a grade simples do CalendarPage. */
export function ModernCalendar({
  items,
  mode,
  onMode,
  cursor,
  onCursor,
  onOpenItem,
  actions,
  top,
}: {
  items: CalItem[]
  mode: 'month' | 'week'
  onMode: (m: 'month' | 'week') => void
  cursor: Date
  onCursor: (d: Date) => void
  onOpenItem: (item: CalItem) => void
  /** Botões do lado direito da barra (Google Agenda, nova reunião). */
  actions?: ReactNode
  /** Conteúdo acima do calendário (ex.: próximos aniversários). */
  top?: ReactNode
}) {
  const [selected, setSelected] = useState<Date>(new Date())

  const rangeStart = mode === 'month' ? startOfWeek(startOfMonth(cursor)) : startOfWeek(cursor)
  const rangeEnd = mode === 'month' ? endOfWeek(endOfMonth(cursor)) : endOfWeek(cursor)
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd })

  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>()
    for (const it of items) {
      const k = format(it.date, 'yyyy-MM-dd')
      map.set(k, [...(map.get(k) ?? []), it])
    }
    for (const list of map.values()) list.sort(sortByTime)
    return map
  }, [items])
  const itemsOf = (d: Date) => byDay.get(format(d, 'yyyy-MM-dd')) ?? []

  const go = (dir: -1 | 1) =>
    onCursor(mode === 'month' ? (dir === 1 ? addMonths(cursor, 1) : subMonths(cursor, 1)) : dir === 1 ? addWeeks(cursor, 1) : subWeeks(cursor, 1))

  const title =
    mode === 'month'
      ? format(cursor, 'MMMM yyyy', { locale: ptBR })
      : `${format(rangeStart, "d MMM", { locale: ptBR })} a ${format(rangeEnd, "d MMM yyyy", { locale: ptBR })}`

  const selectedItems = itemsOf(selected)

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Barra */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="min-w-[180px] text-xl font-bold capitalize text-slate-900">{title}</h2>
        <div className="flex items-center gap-1">
          <button onClick={() => go(-1)} aria-label="Anterior" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => {
              onCursor(new Date())
              setSelected(new Date())
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Hoje
          </button>
          <button onClick={() => go(1)} aria-label="Próximo" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {(['month', 'week'] as const).map((m) => (
            <button
              key={m}
              onClick={() => onMode(m)}
              aria-pressed={mode === m}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {m === 'month' ? 'Mês' : 'Semana'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        {(Object.keys(KIND_LABEL) as CalItemKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${KIND_DOT[k]}`} aria-hidden="true" /> {KIND_LABEL[k]}
          </span>
        ))}
      </div>

      {top}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-7 border-b border-slate-100">
              {days.slice(0, 7).map((d) => (
                <div key={d.toISOString()} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {format(d, 'EEE', { locale: ptBR })}
                  {mode === 'week' && (
                    <span
                      className={`ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold normal-case ${
                        isToday(d) ? 'bg-brand-600 text-white' : 'text-slate-800'
                      }`}
                    >
                      {format(d, 'd')}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day, i) => {
                const list = itemsOf(day)
                const outside = mode === 'month' && !isSameMonth(day, cursor)
                const isSel = isSameDay(day, selected)
                const max = mode === 'month' ? 3 : 50
                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => setSelected(day)}
                    className={`group flex cursor-pointer flex-col gap-1 border-slate-100 p-1.5 transition-colors ${
                      i % 7 !== 6 ? 'border-r' : ''
                    } ${i < days.length - 7 ? 'border-b' : ''} ${mode === 'month' ? 'min-h-[118px]' : 'min-h-[420px]'} ${
                      isSel ? 'bg-brand-50/50' : isWeekend(day) || outside ? 'bg-slate-50/60 hover:bg-slate-50' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    {mode === 'month' && (
                      <span
                        className={`mb-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                          isToday(day) ? 'bg-brand-600 text-white' : outside ? 'text-slate-300' : 'text-slate-600'
                        }`}
                      >
                        {format(day, 'd')}
                      </span>
                    )}
                    {list.slice(0, max).map((it) =>
                      mode === 'month' ? (
                        <ItemChip key={`${it.kind}-${it.id}`} item={it} onOpen={onOpenItem} faded={outside} />
                      ) : (
                        <ItemCard key={`${it.kind}-${it.id}`} item={it} onOpen={onOpenItem} />
                      )
                    )}
                    {list.length > max && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelected(day)
                        }}
                        className="rounded px-1.5 text-left text-[11px] font-semibold text-brand-600 hover:underline"
                      >
                        +{list.length - max} mais
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Dia selecionado */}
        <aside className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {isToday(selected) ? 'Hoje' : format(selected, 'EEEE', { locale: ptBR })}
              </p>
              <p className="text-lg font-bold capitalize text-slate-900">{format(selected, "d 'de' MMMM", { locale: ptBR })}</p>
            </div>
            {!isToday(selected) && (
              <button onClick={() => setSelected(new Date())} aria-label="Voltar para hoje" className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
                <X size={15} />
              </button>
            )}
          </div>
          {selectedItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Nada marcado neste dia.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {selectedItems.map((it) => (
                <li key={`${it.kind}-${it.id}`}>
                  <ItemCard item={it} onOpen={onOpenItem} />
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}

function ItemChip({ item, onOpen, faded }: { item: CalItem; onOpen: (i: CalItem) => void; faded?: boolean }) {
  const dot = item.dot ?? KIND_DOT[item.kind]
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onOpen(item)
      }}
      title={item.title}
      className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-white hover:shadow-sm ${
        faded ? 'opacity-50' : ''
      } ${item.kind === 'internalMeeting' || item.kind === 'meeting' ? 'bg-slate-50' : ''}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {item.time && <span className="shrink-0 font-semibold text-slate-500">{item.time}</span>}
      <span className={`truncate font-medium ${item.kind === 'task' ? 'text-slate-500' : 'text-slate-800'}`}>{item.title}</span>
    </button>
  )
}

function ItemCard({ item, onOpen }: { item: CalItem; onOpen: (i: CalItem) => void }) {
  const dot = item.dot ?? KIND_DOT[item.kind]
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onOpen(item)
      }}
      className="flex w-full items-stretch overflow-hidden rounded-lg border border-slate-200 bg-white text-left transition-all hover:-translate-y-px hover:shadow-md"
    >
      <span className={`w-1 shrink-0 ${dot}`} aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
          <KindIcon kind={item.kind} size={11} />
          {item.time ?? KIND_LABEL[item.kind]}
        </span>
        <span className="line-clamp-2 text-xs font-semibold text-slate-800">{item.title}</span>
        {item.clientName && !item.title.includes(item.clientName) && (
          <span className="truncate text-[11px] text-slate-500">{item.clientName}</span>
        )}
      </span>
    </button>
  )
}

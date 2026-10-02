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
import { Cake, CalendarClock, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Video } from 'lucide-react'

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
  /** Título curto pro quadradinho do mês (ex.: só o nome do cliente). */
  shortTitle?: string
  /** Linha de apoio (ex.: tipo da reunião quando o título é o cliente). */
  subtitle?: string
  /** Cor sólida (barra lateral) — reuniões usam a cor do tipo. */
  dot?: string
  /** Fundo + texto do bloco — reuniões usam o badge do tipo. */
  tint?: string
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
  internalMeeting: 'bg-blue-500',
  event: 'bg-violet-500',
  birthday: 'bg-pink-500',
}

const KIND_TINT: Record<CalItemKind, string> = {
  task: 'bg-slate-100 text-slate-600',
  meeting: 'bg-amber-50 text-amber-700',
  internalMeeting: 'bg-blue-50 text-blue-700',
  event: 'bg-violet-50 text-violet-700',
  birthday: 'bg-pink-50 text-pink-700',
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
  side,
}: {
  items: CalItem[]
  mode: 'month' | 'week'
  onMode: (m: 'month' | 'week') => void
  cursor: Date
  onCursor: (d: Date) => void
  onOpenItem: (item: CalItem) => void
  /** Botões do lado direito da barra (Google Agenda, nova reunião). */
  actions?: ReactNode
  /** Conteúdo extra na coluna lateral, abaixo do dia selecionado. */
  side?: ReactNode
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
      : `${format(rangeStart, "d 'de' MMM", { locale: ptBR })} a ${format(rangeEnd, "d 'de' MMM", { locale: ptBR })}`

  const selectedItems = itemsOf(selected)
  const monthCount = items.filter((i) => isSameMonth(i.date, cursor) && i.kind !== 'task').length

  return (
    <div className="flex flex-col gap-4">
      {/* Barra */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600" aria-hidden="true">
          <CalendarDays size={20} />
        </span>
        <div className="min-w-[170px]">
          <h2 className="text-lg font-bold capitalize leading-tight text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">
            {monthCount} {monthCount === 1 ? 'compromisso' : 'compromissos'} no mês
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => go(-1)} aria-label="Anterior" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => {
              onCursor(new Date())
              setSelected(new Date())
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
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

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {days.slice(0, 7).map((d) => (
                <div key={d.toISOString()} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {format(d, 'EEE', { locale: ptBR }).replace('.', '')}
                  {mode === 'week' && (
                    <span
                      className={`mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-base font-bold normal-case ${
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
                const today = isToday(day)
                const max = mode === 'month' ? 3 : 50
                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => setSelected(day)}
                    className={`relative flex min-w-0 cursor-pointer flex-col gap-1 border-slate-100 p-1.5 transition-colors ${
                      i % 7 !== 6 ? 'border-r' : ''
                    } ${i < days.length - 7 ? 'border-b' : ''} ${mode === 'month' ? 'min-h-[128px]' : 'min-h-[460px]'} ${
                      isSel ? 'bg-brand-50' : outside ? 'bg-slate-50' : isWeekend(day) ? 'bg-slate-50/50 hover:bg-slate-50' : 'hover:bg-slate-50'
                    } ${isSel ? 'ring-2 ring-inset ring-brand-400' : ''}`}
                  >
                    {mode === 'month' && (
                      <div className="flex items-center justify-between px-0.5">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold ${
                            today ? 'bg-brand-600 text-white shadow-sm' : outside ? 'text-slate-300' : 'text-slate-700'
                          }`}
                        >
                          {format(day, 'd')}
                        </span>
                        {list.length > 0 && !outside && (
                          <span className="text-[10px] font-medium text-slate-400">{list.length}</span>
                        )}
                      </div>
                    )}
                    {list.slice(0, max).map((it) => (
                      <ItemBlock key={`${it.kind}-${it.id}`} item={it} onOpen={onOpenItem} faded={outside} roomy={mode === 'week'} />
                    ))}
                    {list.length > max && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelected(day)
                        }}
                        className="mt-auto rounded-md px-1.5 py-0.5 text-left text-[11px] font-semibold text-brand-600 hover:bg-brand-50"
                      >
                        +{list.length - max} mais
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-slate-500">
            {(Object.keys(KIND_LABEL) as CalItemKind[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${KIND_DOT[k]}`} aria-hidden="true" /> {KIND_LABEL[k]}
              </span>
            ))}
          </div>
        </div>

        {/* Lateral: dia selecionado + extras */}
        <div className="flex flex-col gap-4 xl:sticky xl:top-4">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
              <span
                className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${
                  isToday(selected) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                <span className="text-[10px] font-semibold uppercase leading-none">{format(selected, 'MMM', { locale: ptBR }).replace('.', '')}</span>
                <span className="text-lg font-bold leading-tight">{format(selected, 'd')}</span>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold capitalize text-slate-900">
                  {isToday(selected) ? 'Hoje' : format(selected, 'EEEE', { locale: ptBR })}
                </p>
                <p className="text-xs text-slate-500">
                  {selectedItems.length === 0
                    ? 'Nada marcado'
                    : `${selectedItems.length} ${selectedItems.length === 1 ? 'item' : 'itens'}`}
                </p>
              </div>
            </div>
            <div className="max-h-[460px] overflow-y-auto p-3">
              {selectedItems.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Dia livre.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {selectedItems.map((it) => (
                    <li key={`${it.kind}-${it.id}`}>
                      <ItemBlock item={it} onOpen={onOpenItem} roomy />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          {side}
        </div>
      </div>
    </div>
  )
}

/** Bloco colorido de um item. No mês fica compacto (horário + título em até
 *  2 linhas); na semana e no painel do dia mostra também tipo/cliente. */
function ItemBlock({ item, onOpen, faded, roomy }: { item: CalItem; onOpen: (i: CalItem) => void; faded?: boolean; roomy?: boolean }) {
  const tint = item.tint ?? KIND_TINT[item.kind]
  const bar = item.dot ?? KIND_DOT[item.kind]
  const label = roomy ? item.title : item.shortTitle ?? item.title
  const sub = roomy ? item.subtitle ?? (item.clientName && !item.title.includes(item.clientName) ? item.clientName : undefined) : undefined
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onOpen(item)
      }}
      title={item.title}
      className={`relative flex w-full min-w-0 flex-col overflow-hidden rounded-md text-left transition-all hover:brightness-95 hover:shadow-sm ${tint} ${
        roomy ? 'gap-0.5 py-2 pl-3 pr-2' : 'py-1 pl-2.5 pr-1.5'
      } ${faded ? 'opacity-50' : ''} ${item.kind === 'task' ? 'opacity-90' : ''}`}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${bar}`} aria-hidden="true" />
      {(item.time || roomy) && (
        <span className="flex items-center gap-1 text-[10px] font-semibold opacity-80">
          {roomy && <KindIcon kind={item.kind} size={11} />}
          {item.time ?? KIND_LABEL[item.kind]}
        </span>
      )}
      <span className={`line-clamp-2 break-words font-semibold leading-snug ${roomy ? 'text-[13px]' : 'text-[11px]'}`}>{label}</span>
      {sub && <span className="truncate text-[11px] opacity-75">{sub}</span>}
    </button>
  )
}

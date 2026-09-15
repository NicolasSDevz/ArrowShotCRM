import { useMemo, type ReactNode } from 'react'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, addMonths, subMonths, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { Content } from '../../types/content'

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Grade de mês (domingo a sábado) com chips de conteúdo por dia — adaptada
 *  da grade já usada em CalendarPage.tsx (que mistura tarefas/reuniões/
 *  aniversários; essa aqui é só conteúdo). Usada tanto no calendário por
 *  cliente (chip por formato) quanto no geral (chip por cliente) via as
 *  props de renderização — o layout é o mesmo, só muda como o chip é
 *  rotulado/colorido. Conteúdo sem `scheduledDate` não aparece aqui (não tem
 *  onde encaixar num dia). */
export function ContentMonthGrid({
  month,
  onMonthChange,
  contents,
  chipLabel,
  chipClassName,
  chipIcon,
  onOpenContent,
  onAddContent,
}: {
  month: Date
  onMonthChange: (next: Date) => void
  contents: Content[]
  chipLabel: (content: Content) => string
  chipClassName: (content: Content) => string
  chipIcon?: (content: Content) => ReactNode
  onOpenContent: (id: string) => void
  /** Quando informado, mostra um "+" ao passar o mouse em dias sem conteúdo
   *  (e também nos com conteúdo) pra criar um novo nessa data. */
  onAddContent?: (date: Date) => void
}) {
  const days = useMemo(() => {
    const rangeStart = startOfWeek(startOfMonth(month), { weekStartsOn: 0 })
    const rangeEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 0 })
    return eachDayOfInterval({ start: rangeStart, end: rangeEnd })
  }, [month])

  const itemsByDay = useMemo(() => {
    const map = new Map<string, Content[]>()
    for (const c of contents) {
      if (!c.scheduledDate) continue
      const key = format(c.scheduledDate.toDate(), 'yyyy-MM-dd')
      const list = map.get(key)
      if (list) list.push(c)
      else map.set(key, [c])
    }
    return map
  }, [contents])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => onMonthChange(subMonths(month, 1))}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <ChevronLeft size={16} />
        </button>
        <p className="w-40 text-center text-sm font-semibold capitalize text-slate-700">
          {format(month, 'MMMM yyyy', { locale: ptBR })}
        </p>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <div className="grid min-w-[640px] grid-cols-7 gap-px bg-slate-100">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="bg-slate-50 px-2 py-1.5 text-center text-[11px] font-semibold uppercase text-slate-400">
              {d}
            </div>
          ))}
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd')
            const dayItems = itemsByDay.get(key) ?? []
            const outside = !isSameMonth(day, month)
            return (
              <div key={key} className={`group flex min-h-[110px] flex-col gap-1 bg-white p-1.5 ${outside ? 'bg-slate-50/50' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${outside ? 'text-slate-300' : 'text-slate-500'}`}>{format(day, 'd')}</span>
                  {onAddContent && (
                    <button
                      type="button"
                      onClick={() => onAddContent(day)}
                      className="rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-brand-600 group-hover:opacity-100"
                      aria-label="Adicionar conteúdo nesta data"
                    >
                      <Plus size={13} />
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {dayItems.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onOpenContent(c.id)}
                      className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium ${chipClassName(c)}`}
                      title={chipLabel(c)}
                    >
                      {chipIcon?.(c)}
                      <span className="truncate">{chipLabel(c)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

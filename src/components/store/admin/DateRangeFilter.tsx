import { Input, Select } from '../../ui/Field'

export type DatePreset = 'today' | 'yesterday' | 'today_yesterday' | '7d' | '30d' | 'this_month' | 'last_month' | 'all' | 'custom'

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: 'today_yesterday', label: 'Hoje e ontem' },
  { key: '7d', label: 'Últimos 7 dias' },
  { key: '30d', label: 'Últimos 30 dias' },
  { key: 'this_month', label: 'Este mês' },
  { key: 'last_month', label: 'Mês passado' },
  { key: 'all', label: 'Todo o período' },
  { key: 'custom', label: 'Escolher datas...' },
]

export interface DateRangeValue {
  preset: DatePreset
  /** yyyy-mm-dd, só no "Escolher datas". */
  from: string
  to: string
}

export interface DateRange {
  start: Date
  /** Exclusivo (meia-noite do dia seguinte ao último dia). */
  end: Date
}

const dayStart = (d: Date, plusDays = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + plusDays)
const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : null
}
export const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Intervalo [start, end) do período escolhido, no horário local. null = todo o período. */
export function resolveRange({ preset, from, to }: DateRangeValue, now = new Date()): DateRange | null {
  const today = dayStart(now)
  switch (preset) {
    case 'today':
      return { start: today, end: dayStart(now, 1) }
    case 'yesterday':
      return { start: dayStart(now, -1), end: today }
    case 'today_yesterday':
      return { start: dayStart(now, -1), end: dayStart(now, 1) }
    case '7d':
      return { start: dayStart(now, -6), end: dayStart(now, 1) }
    case '30d':
      return { start: dayStart(now, -29), end: dayStart(now, 1) }
    case 'this_month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: dayStart(now, 1) }
    case 'last_month':
      return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1) }
    case 'custom': {
      const a = parseDay(from)
      const b = parseDay(to)
      if (!a && !b) return null
      const start = a ?? new Date(2000, 0, 1)
      const last = b ?? today
      return start <= last ? { start, end: dayStart(last, 1) } : { start: last, end: dayStart(start, 1) }
    }
    default:
      return null
  }
}

export const inRange = (iso: string | null | undefined, range: DateRange | null) => {
  if (!range) return true
  if (!iso) return false
  const t = new Date(iso)
  return t >= range.start && t < range.end
}

/** Seletor de período (Hoje, Ontem, mês passado, datas livres...). */
export function DateRangeFilter({ value, onChange, className = '' }: { value: DateRangeValue; onChange: (v: DateRangeValue) => void; className?: string }) {
  const pick = (preset: DatePreset) => {
    if (preset === 'custom' && !value.from && !value.to) {
      const today = toInputDate(new Date())
      onChange({ preset, from: today, to: today })
    } else onChange({ ...value, preset })
  }
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <Select aria-label="Período" value={value.preset} onChange={(e) => pick(e.target.value as DatePreset)} className="!w-48">
        {DATE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </Select>
      {value.preset === 'custom' && (
        <>
          <Input type="date" aria-label="De" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} className="!w-40" />
          <span className="text-sm text-slate-400" aria-hidden="true">até</span>
          <Input type="date" aria-label="Até" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} className="!w-40" />
        </>
      )}
    </div>
  )
}

import type { ReactNode } from 'react'
import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react'
import { InfoTip } from './InfoTip'

/** Cartão de número das Métricas (Meta e Google): ícone colorido, nome,
 *  valor grande e, embaixo, a variação ou uma linha de apoio. */

export function Delta({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) return null
  const up = value >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-600'}`}>
      <Icon size={13} />
      {up ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  )
}

/** Cor de destaque de cada cartão (ícone e brilho do canto). */
const ACCENTS = {
  blue: { fg: '#60a5fa', bg: 'rgb(59 130 246 / 0.14)', glow: 'rgb(59 130 246 / 0.16)' },
  green: { fg: '#4cc38a', bg: 'rgb(16 185 129 / 0.14)', glow: 'rgb(16 185 129 / 0.14)' },
  amber: { fg: '#fbbf24', bg: 'rgb(245 158 11 / 0.14)', glow: 'rgb(245 158 11 / 0.13)' },
  violet: { fg: '#a78bfa', bg: 'rgb(139 92 246 / 0.15)', glow: 'rgb(139 92 246 / 0.14)' },
  sky: { fg: '#38bdf8', bg: 'rgb(14 165 233 / 0.14)', glow: 'rgb(14 165 233 / 0.13)' },
  pink: { fg: '#f472b6', bg: 'rgb(236 72 153 / 0.14)', glow: 'rgb(236 72 153 / 0.13)' },
} as const

export function MetricCard({
  label,
  value,
  valueColor,
  delta,
  subtitle,
  tip,
  icon: Icon,
  accent = 'blue',
}: {
  label: string
  value: string
  valueColor?: string
  delta?: number | null
  subtitle?: string
  tip?: ReactNode
  icon: LucideIcon
  accent?: keyof typeof ACCENTS
}) {
  const a = ACCENTS[accent]
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta)
  return (
    <div className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full blur-2xl"
        style={{ background: a.glow }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: a.bg, color: a.fg }}>
          <Icon size={18} aria-hidden="true" />
        </span>
        {tip && <InfoTip title={label}>{tip}</InfoTip>}
      </div>
      <p className="relative mt-3 text-[12.5px] font-medium leading-snug text-slate-500">{label}</p>
      <p
        title={value}
        className={`relative mt-0.5 truncate text-[22px] font-bold leading-tight tracking-tight tabular-nums ${valueColor ? '' : 'text-slate-900'}`}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </p>
      <div className="relative mt-auto flex min-h-[18px] items-center gap-1.5 pt-1.5 text-[11.5px] text-slate-400">
        {hasDelta ? (
          <>
            <Delta value={delta ?? null} />
            <span className="truncate">vs. período anterior</span>
          </>
        ) : (
          subtitle && <span className="truncate">{subtitle}</span>
        )}
      </div>
    </div>
  )
}


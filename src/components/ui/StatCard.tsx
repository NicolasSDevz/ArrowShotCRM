import type { LucideIcon } from 'lucide-react'
import { MetricCard } from './MetricCard'

type Accent = 'blue' | 'green' | 'amber' | 'violet' | 'sky' | 'pink'

/** Card de número simples (rótulo + valor grande) usado no topo de painéis
 *  de listagem (Relatórios, Equipe...). Com ícone, usa o mesmo cartão das
 *  Métricas, pra todas as telas terem o mesmo visual. */
export function StatCard({
  label,
  value,
  icon,
  accent = 'blue',
  hint,
}: {
  label: string
  value: string | number
  icon?: LucideIcon
  accent?: Accent
  /** Linha pequena embaixo do número. */
  hint?: string
}) {
  if (icon) return <MetricCard label={label} value={String(value)} icon={icon} accent={accent} subtitle={hint} />
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <p className="text-[12.5px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-[22px] font-bold leading-tight tracking-tight tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-[11.5px] text-slate-400">{hint}</p>}
    </div>
  )
}

import { useMemo } from 'react'
import { format, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Activity } from '../../types'

const MONTHS_BACK = 6
const fmtBRL0 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** Barras simples (SVG-free, div + height) com a receita de upsell somada
 *  por mês — inclui tanto upsells detectados automaticamente ao editar o
 *  cliente quanto os registrados manualmente pelo widget "Registrar upsell"
 *  (só estes têm `amount` estruturado; os automáticos contam pro total de
 *  eventos mas não têm valor, então não aparecem na barra). */
export function UpsellRevenueChart({ activities }: { activities: Activity[] }) {
  const months = useMemo(() => {
    const now = new Date()
    return Array.from({ length: MONTHS_BACK }, (_, i) => startOfMonth(subMonths(now, MONTHS_BACK - 1 - i)))
  }, [])

  const data = useMemo(() => {
    return months.map((monthStart) => {
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
      const inMonth = activities.filter((a) => {
        const d = a.createdAt?.toDate?.()
        return d != null && d >= monthStart && d < monthEnd
      })
      const revenue = inMonth.reduce((sum, a) => sum + (a.amount ?? 0), 0)
      return { label: format(monthStart, 'MMM/yy', { locale: ptBR }), revenue, count: inMonth.length }
    })
  }, [activities, months])

  const total = data.reduce((s, d) => s + d.revenue, 0)
  const totalCount = data.reduce((s, d) => s + d.count, 0)

  if (totalCount === 0) {
    return <p className="text-sm text-slate-400">Nenhum upsell registrado nos últimos {MONTHS_BACK} meses.</p>
  }

  const max = Math.max(...data.map((d) => d.revenue), 1)
  const H = 120

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-2" style={{ height: H }}>
        {data.map((d) => {
          const barH = d.revenue > 0 ? Math.max((d.revenue / max) * (H - 22), 4) : 2
          return (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] font-semibold text-slate-500">{d.revenue > 0 ? fmtBRL0(d.revenue) : ''}</span>
              <div
                className={`w-full max-w-[36px] rounded-t-md ${d.revenue > 0 ? 'bg-emerald-500' : 'bg-slate-200'}`}
                style={{ height: barH }}
                title={`${d.count} upsell${d.count === 1 ? '' : 's'}`}
              />
              <span className="text-[10px] text-slate-400">{d.label}</span>
            </div>
          )
        })}
      </div>
      <div className="border-t border-slate-100 pt-2 text-sm text-slate-600">
        Total no período: <span className="font-bold text-emerald-600">{fmtBRL0(total)}</span>
        {' · '}
        {totalCount} upsell{totalCount === 1 ? '' : 's'}
      </div>
    </div>
  )
}

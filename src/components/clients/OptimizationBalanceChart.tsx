import { useMemo } from 'react'
import { format, subWeeks } from 'date-fns'
import type { Optimization } from '../../types'

const META_COLOR = '#2563EB'
const GOOGLE_COLOR = '#EF4444'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** Mini gráfico SVG da evolução do saldo (últimas 8 semanas). Linha azul =
 *  Meta Ads, linha vermelha = Google Ads. Sem dependência externa. */
export function OptimizationBalanceChart({ optimizations }: { optimizations: Optimization[] }) {
  const data = useMemo(() => {
    const cutoff = subWeeks(new Date(), 8).getTime()
    const inWindow = optimizations
      .filter((o) => o.date.toMillis() >= cutoff)
      .sort((a, b) => a.date.toMillis() - b.date.toMillis())

    const meta = inWindow
      .filter((o) => o.metaBalance != null)
      .map((o) => ({ t: o.date.toMillis(), v: o.metaBalance as number }))
    const google = inWindow
      .filter((o) => o.googleBalance != null)
      .map((o) => ({ t: o.date.toMillis(), v: o.googleBalance as number }))

    const allT = [...meta, ...google].map((p) => p.t)
    const allV = [...meta, ...google].map((p) => p.v)
    if (allT.length === 0) return null

    const minT = Math.min(...allT, cutoff)
    const maxT = Math.max(...allT, Date.now())
    const maxV = Math.max(...allV, 0)
    const top = maxV === 0 ? 1 : maxV * 1.15

    return { meta, google, minT, maxT, top }
  }, [optimizations])

  if (!data) {
    return <p className="text-sm text-slate-400">Ainda não há saldos registrados para montar o gráfico.</p>
  }

  const W = 640
  const H = 200
  const padL = 52
  const padR = 12
  const padT = 12
  const padB = 26
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const x = (t: number) =>
    data.maxT === data.minT ? padL + plotW / 2 : padL + ((t - data.minT) / (data.maxT - data.minT)) * plotW
  const y = (v: number) => padT + plotH - (v / data.top) * plotH

  const line = (pts: { t: number; v: number }[]) => pts.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" style={{ height: H }} role="img" aria-label="Evolução do saldo">
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={padL} x2={W - padR} y1={padT + plotH * g} y2={padT + plotH * g} stroke="#E2E8F0" strokeWidth={1} />
        ))}
        <text x={padL - 8} y={padT + 4} textAnchor="end" fontSize={10} fill="#94A3B8">{fmtBRL(data.top)}</text>
        <text x={padL - 8} y={padT + plotH} textAnchor="end" fontSize={10} fill="#94A3B8">R$ 0</text>
        <text x={padL} y={H - 8} textAnchor="start" fontSize={10} fill="#64748B">{format(data.minT, 'dd/MM')}</text>
        <text x={W - padR} y={H - 8} textAnchor="end" fontSize={10} fill="#64748B">{format(data.maxT, 'dd/MM')}</text>

        {data.meta.length > 1 && <polyline points={line(data.meta)} fill="none" stroke={META_COLOR} strokeWidth={2.5} strokeLinejoin="round" />}
        {data.meta.map((p, i) => <circle key={`m${i}`} cx={x(p.t)} cy={y(p.v)} r={3} fill={META_COLOR} />)}
        {data.google.length > 1 && <polyline points={line(data.google)} fill="none" stroke={GOOGLE_COLOR} strokeWidth={2.5} strokeLinejoin="round" />}
        {data.google.map((p, i) => <circle key={`g${i}`} cx={x(p.t)} cy={y(p.v)} r={3} fill={GOOGLE_COLOR} />)}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: META_COLOR }} /> Meta Ads</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: GOOGLE_COLOR }} /> Google Ads</span>
      </div>
    </div>
  )
}

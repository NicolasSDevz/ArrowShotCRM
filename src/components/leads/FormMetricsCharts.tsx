import { useMemo, useRef, useState } from 'react'
import type { LeadFormDailyPoint } from '../../services/leadFormAnalyticsService'

/** Cores das séries (paleta categórica validada, slots 1–3) + tinta de texto,
 *  com a versão própria do modo escuro. Escopo local (.fm-viz). */
export const FORM_VIZ_STYLE = `
.fm-viz { --fm-s1: #2a78d6; --fm-s2: #eb6834; --fm-s3: #1baf7a; --fm-grid: #e2e8f0; --fm-ink: #0f172a; --fm-ink-2: #64748b; --fm-bar: #2a78d6; --fm-track: #f1f5f9; --fm-tip-bg: #0f172a; --fm-tip-ink: #ffffff; }
:root[data-theme="dark"] .fm-viz { --fm-s1: #3987e5; --fm-s2: #d95926; --fm-s3: #199e70; --fm-grid: #2e2e33; --fm-ink: #ececee; --fm-ink-2: #a1a1aa; --fm-bar: #3987e5; --fm-track: #26262b; --fm-tip-bg: #f4f4f5; --fm-tip-ink: #18181b; }
`

const SERIES = [
  { key: 'views', label: 'Visualizações', color: 'var(--fm-s1)' },
  { key: 'starts', label: 'Começaram', color: 'var(--fm-s2)' },
  { key: 'submissions', label: 'Enviaram', color: 'var(--fm-s3)' },
] as const

const W = 640
const H = 210
const PAD = { top: 12, right: 16, bottom: 26, left: 32 }

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

/** Linha por dia: visualizações, começaram e enviaram (mesma escala: contagem
 *  de pessoas). Legenda sempre visível, cruz + dica ao passar o mouse, e a
 *  mesma informação em tabela. */
export function FormTrendChart({ daily }: { daily: LeadFormDailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const max = Math.max(1, ...daily.flatMap((d) => [d.views, d.starts, d.submissions]))
  // Topo do eixo "redondo" (2, 4, 10, 20, 50…) pra a linha do meio também ser um número inteiro limpo.
  const half = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((n) => n * 2 >= max) ?? Math.ceil(max / 2)
  const niceMax = half * 2
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (daily.length <= 1 ? innerW / 2 : (i / (daily.length - 1)) * innerW)
  const y = (v: number) => PAD.top + innerH - (v / niceMax) * innerH
  const ticks = [0, niceMax / 2, niceMax]
  const labelEvery = Math.max(1, Math.ceil(daily.length / 8))

  const paths = useMemo(
    () =>
      SERIES.map((s) => ({
        ...s,
        d: daily.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[s.key]).toFixed(1)}`).join(' '),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daily, niceMax]
  )

  const onMove = (e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || daily.length === 0) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - PAD.left) / innerW) * (daily.length - 1))
    setHover(Math.min(daily.length - 1, Math.max(0, i)))
  }

  const hp = hover != null ? daily[hover] : null

  return (
    <div className="fm-viz">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--fm-ink-2)' }}>
            <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <button type="button" onClick={() => setAsTable((v) => !v)} className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-700">
          {asTable ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-1.5 text-left font-semibold">Dia</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="px-3 py-1.5 text-right font-semibold">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.date} className="border-t border-slate-100 text-slate-700">
                  <td className="px-3 py-1.5">{shortDate(d.date)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.views}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.starts}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.submissions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            role="img"
            aria-label="Visualizações, inícios e envios por dia"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--fm-grid)" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--fm-ink-2)">
                  {Math.round(t)}
                </text>
              </g>
            ))}
            {daily.map((d, i) =>
              // Última data sempre aparece; as intermediárias saem se ficarem coladas nela.
              (i % labelEvery === 0 && daily.length - 1 - i >= labelEvery / 2) || i === daily.length - 1 ? (
                <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--fm-ink-2)">
                  {shortDate(d.date)}
                </text>
              ) : null
            )}
            {hp && hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--fm-ink-2)" strokeWidth={1} strokeDasharray="3 3" />}
            {paths.map((p) => (
              <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {hp &&
              hover != null &&
              SERIES.map((s) => <circle key={s.key} cx={x(hover)} cy={y(hp[s.key])} r={4} fill={s.color} stroke="var(--fm-track)" strokeWidth={2} />)}
            {/* área de captura maior que as linhas, pra a dica aparecer em qualquer ponto */}
            <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} fill="transparent" />
          </svg>
          {hp && hover != null && (
            <div
              className="pointer-events-none absolute top-1 z-10 rounded-lg px-2.5 py-1.5 text-xs shadow-lg"
              style={{
                background: 'var(--fm-tip-bg)',
                color: 'var(--fm-tip-ink)',
                left: `${(x(hover) / W) * 100}%`,
                transform: x(hover) > W * 0.7 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
              }}
            >
              <p className="mb-0.5 font-semibold">{shortDate(hp.date)}</p>
              {SERIES.map((s) => (
                <p key={s.key} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}: <strong>{hp[s.key]}</strong>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export interface AnswerBreakdown {
  questionId: string
  label: string
  total: number
  options: { label: string; count: number }[]
}

/** "O que responderam": uma pergunta de escolha, barra por opção (um tom só —
 *  é quantidade), com número e % sempre visíveis. */
export function AnswerBars({ item }: { item: AnswerBreakdown }) {
  const max = Math.max(1, ...item.options.map((o) => o.count))
  return (
    <div className="fm-viz">
      <p className="mb-2 text-sm font-medium" style={{ color: 'var(--fm-ink)' }}>
        {item.label} <span className="text-xs font-normal" style={{ color: 'var(--fm-ink-2)' }}>· {item.total} resposta(s)</span>
      </p>
      <div className="flex flex-col gap-1.5">
        {item.options.map((o) => (
          <div key={o.label} className="grid grid-cols-[minmax(0,160px)_1fr_64px] items-center gap-2.5 text-xs" title={`${o.label}: ${o.count}`}>
            <span className="truncate" style={{ color: 'var(--fm-ink-2)' }}>
              {o.label}
            </span>
            <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--fm-track)' }}>
              <div className="h-full rounded-full" style={{ width: `${(o.count / max) * 100}%`, background: 'var(--fm-bar)' }} />
            </div>
            <span className="text-right tabular-nums" style={{ color: 'var(--fm-ink)' }}>
              <strong>{o.count}</strong> <span style={{ color: 'var(--fm-ink-2)' }}>{item.total > 0 ? `${Math.round((o.count / item.total) * 100)}%` : ''}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

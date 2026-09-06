import { useMemo } from 'react'

export interface ChartSeries {
  label: string
  color: string
  values: (number | undefined)[]
  format: (v: number) => string
}

/** Gráfico de linha SVG leve, sem dependência. Duas séries, cada uma com sua
 *  própria escala (eixo esquerdo = série 1, eixo direito = série 2) porque as
 *  métricas costumam ter ordens de grandeza bem diferentes (impressões vs
 *  conversas). Responsivo via viewBox. */
export function ReportLineChart({
  labels,
  seriesA,
  seriesB,
  height = 300,
}: {
  labels: string[]
  seriesA: ChartSeries
  seriesB?: ChartSeries
  height?: number
}) {
  const W = 900
  const H = height
  const padL = 58
  const padR = seriesB ? 58 : 16
  const padT = 16
  const padB = 34

  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const geom = useMemo(() => {
    const n = labels.length
    const xFor = (i: number) => (n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW)

    const scaleFor = (vals: (number | undefined)[]) => {
      const nums = vals.filter((v): v is number => v != null && !Number.isNaN(v))
      const max = nums.length ? Math.max(...nums, 0) : 1
      const top = max === 0 ? 1 : max * 1.1
      return (v: number) => padT + plotH - (v / top) * plotH
    }

    const yA = scaleFor(seriesA.values)
    const yB = seriesB ? scaleFor(seriesB.values) : null

    const pathFor = (vals: (number | undefined)[], y: (v: number) => number) =>
      vals
        .map((v, i) => (v == null ? null : `${xFor(i)},${y(v)}`))
        .filter(Boolean)
        .join(' ')

    const maxOf = (vals: (number | undefined)[]) => {
      const nums = vals.filter((v): v is number => v != null && !Number.isNaN(v))
      return nums.length ? Math.max(...nums, 0) : 0
    }

    return {
      xFor,
      yA,
      yB,
      pathA: pathFor(seriesA.values, yA),
      pathB: seriesB && yB ? pathFor(seriesB.values, yB) : '',
      maxA: maxOf(seriesA.values),
      maxB: seriesB ? maxOf(seriesB.values) : 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels, seriesA, seriesB, plotW, plotH])

  // ~6 rótulos no eixo X
  const xTicks = useMemo(() => {
    const n = labels.length
    if (n === 0) return []
    const step = Math.max(1, Math.ceil(n / 6))
    const idx: number[] = []
    for (let i = 0; i < n; i += step) idx.push(i)
    if (idx[idx.length - 1] !== n - 1) idx.push(n - 1)
    return idx
  }, [labels])

  const gridLines = [0.25, 0.5, 0.75]

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" style={{ height }} role="img" aria-label="Gráfico de evolução">
        {/* grid */}
        {gridLines.map((g) => (
          <line
            key={g}
            x1={padL}
            x2={W - padR}
            y1={padT + plotH * g}
            y2={padT + plotH * g}
            stroke="#E2E8F0"
            strokeWidth={1}
          />
        ))}
        <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke="#CBD5E1" strokeWidth={1} />

        {/* eixo esquerdo (série A) */}
        <text x={padL - 8} y={padT + 4} textAnchor="end" fontSize={11} fill={seriesA.color}>
          {seriesA.format(geom.maxA)}
        </text>
        <text x={padL - 8} y={padT + plotH} textAnchor="end" fontSize={11} fill="#94A3B8">
          0
        </text>

        {/* eixo direito (série B) */}
        {seriesB && (
          <>
            <text x={W - padR + 8} y={padT + 4} textAnchor="start" fontSize={11} fill={seriesB.color}>
              {seriesB.format(geom.maxB)}
            </text>
            <text x={W - padR + 8} y={padT + plotH} textAnchor="start" fontSize={11} fill="#94A3B8">
              0
            </text>
          </>
        )}

        {/* rótulos X */}
        {xTicks.map((i) => (
          <text key={i} x={geom.xFor(i)} y={H - 12} textAnchor="middle" fontSize={11} fill="#64748B">
            {labels[i]}
          </text>
        ))}

        {/* linha A */}
        {geom.pathA && <polyline points={geom.pathA} fill="none" stroke={seriesA.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
        {/* linha B */}
        {geom.pathB && <polyline points={geom.pathB} fill="none" stroke={seriesB!.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4 3" />}
      </svg>
    </div>
  )
}

import { useState } from 'react'
import { format } from 'date-fns'
import { EmptyState } from './EmptyState'
import { usePrivacy } from '../../context/PrivacyContext'

const BRL = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const BRL0 = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** Barras do investimento por dia (Métricas do Meta e do Google). */
export function SpendChart({ daily }: { daily: { date: string; spend: number }[] }) {
  const { isPrivacyMode } = usePrivacy()
  const [hover, setHover] = useState<number | null>(null)
  if (daily.length === 0) return <EmptyState title="Sem investimento no período" />

  const W = 760
  const H = 240
  const padL = 64
  const padR = 12
  const padT = 12
  const padB = 34
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const max = Math.max(...daily.map((d) => d.spend), 1)
  const top = max * 1.15
  const bw = (plotW / daily.length) * 0.68
  const gap = plotW / daily.length

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" style={{ height: H }} role="img" aria-label="Investimento diário">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={padT + plotH * g} y2={padT + plotH * g} stroke="#E2E8F0" strokeWidth={1} />
            <text x={padL - 10} y={padT + plotH * g + 4} textAnchor="end" fontSize={11} fill="#94A3B8">
              {isPrivacyMode ? 'R$ •.•••' : BRL0(top * (1 - g))}
            </text>
          </g>
        ))}
        {daily.map((d, i) => {
          const h = (d.spend / top) * plotH
          const x = padL + i * gap + (gap - bw) / 2
          const y = padT + plotH - h
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x} y={y} width={bw} height={Math.max(h, 1)} rx={2} fill="#2563EB" opacity={hover == null || hover === i ? 1 : 0.55} />
              {(i === 0 || i === daily.length - 1 || i === Math.floor(daily.length / 2)) && (
                <text x={x + bw / 2} y={H - 12} textAnchor="middle" fontSize={10} fill="#64748B">
                  {format(new Date(`${d.date}T12:00:00`), 'dd/MM')}
                </text>
              )}
              {hover === i && (
                <g>
                  <rect x={Math.min(x + bw / 2 - 44, W - 92)} y={y - 26} width={88} height={20} rx={4} fill="#1E293B" />
                  <text x={Math.min(x + bw / 2, W - 48)} y={y - 12} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
                    {isPrivacyMode ? 'R$ •.•••' : BRL(d.spend)}
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}


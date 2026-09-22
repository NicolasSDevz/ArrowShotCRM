import { useMemo } from 'react'
import { CLIENT_STATUS_LABEL, type Client, type ClientStatus } from '../../types/client'

const STATUS_COLOR: Record<ClientStatus, string> = {
  active: '#10B981',
  prospect: '#2563EB',
  paused: '#F59E0B',
  churned: '#EF4444',
}
const STATUS_ORDER: ClientStatus[] = ['active', 'prospect', 'paused', 'churned']
const R = 60
const STROKE = 22
const CIRC = 2 * Math.PI * R

/** Donut simples (SVG puro, sem lib) com a carteira de clientes por status —
 *  visão rápida de "quantos ativos, em onboarding, pausados e encerrados"
 *  sem precisar ir pra aba Clientes filtrar. */
export function ClientsStatusChart({ clients }: { clients: Client[] }) {
  const data = useMemo(() => {
    const counts = STATUS_ORDER.map((status) => ({
      status,
      label: CLIENT_STATUS_LABEL[status],
      color: STATUS_COLOR[status],
      count: clients.filter((c) => c.status === status).length,
    }))
    const total = counts.reduce((s, c) => s + c.count, 0)
    // Acumula o offset de cada fatia sem mutar variável fora do reduce —
    // cada item já nasce sabendo onde a fatia anterior terminou.
    const arcs = counts
      .filter((c) => c.count > 0)
      .reduce<{ status: ClientStatus; color: string; dash: number; offset: number }[]>((acc, c) => {
        const prevEnd = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0
        const dash = total > 0 ? (c.count / total) * CIRC : 0
        return [...acc, { status: c.status, color: c.color, dash, offset: prevEnd }]
      }, [])
    return { counts, total, arcs }
  }, [clients])

  if (data.total === 0) {
    return <p className="text-sm text-slate-400">Nenhum cliente cadastrado ainda.</p>
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center">
      <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0" role="img" aria-label="Clientes por status">
        <g transform="rotate(-90 80 80)">
          {data.arcs.map((a) => (
            <circle
              key={a.status}
              cx={80}
              cy={80}
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={STROKE}
              strokeDasharray={`${a.dash} ${CIRC - a.dash}`}
              strokeDashoffset={-a.offset}
            />
          ))}
        </g>
        <text x={80} y={76} textAnchor="middle" fontSize={26} fontWeight={800} fill="#0F172A">
          {data.total}
        </text>
        <text x={80} y={94} textAnchor="middle" fontSize={11} fill="#94A3B8">
          clientes
        </text>
      </svg>

      <ul className="flex flex-col gap-1.5">
        {data.counts.map((c) => (
          <li key={c.status} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
            <span className="text-slate-600">{c.label}</span>
            <span className="font-bold text-slate-900">{c.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

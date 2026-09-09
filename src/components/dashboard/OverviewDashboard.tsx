import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, isPast, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  DollarSign,
  Users,
  Activity as ActivityIcon,
  Gem,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ArrowUpRight,
  UserPlus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useClients } from '../../hooks/useClients'
import { useLeads } from '../../hooks/useLeads'
import { useAllTasks } from '../../hooks/useTasks'
import { useUsers } from '../../hooks/useUsers'
import { useMetricsSnapshot } from '../../hooks/useMetricsSnapshot'
import { useCollectionSubscription } from '../../hooks/useCollectionSubscription'
import { subscribeUpsellActivities } from '../../services/activityService'
import { refreshMetricsNow } from '../../services/metricsService'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { computeCompanyMetrics, computeMrrSeries } from '../../utils/metrics'
import { LEAD_STATUS_LABEL, type Activity, type LeadStatus } from '../../types'

const BRL = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const BRL2 = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** `calculatedAt` chega como Timestamp (doc do Firestore) ou string ISO
 *  (resposta da API). Devolve um label seguro, nunca lança. */
function formatWhen(v: unknown): string | null {
  let d: Date | null = null
  if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') d = (v as { toDate: () => Date }).toDate()
  else if (typeof v === 'string' && v) d = new Date(v)
  else if (v instanceof Date) d = v
  if (!d || Number.isNaN(d.getTime())) return null
  return format(d, "dd/MM 'às' HH:mm", { locale: ptBR })
}

const CHART_COLOR = '#2563EB'
const PIPELINE_STAGES: LeadStatus[] = ['new', 'contacted', 'meeting_scheduled', 'proposal_sent', 'negotiation']

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)] ${className}`}
    >
      {children}
    </div>
  )
}

function CardTitle({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-[15px] font-semibold text-slate-900">{children}</p>
}

function DeltaChip({ pct }: { pct: number | null }) {
  if (pct == null || !Number.isFinite(pct)) return null
  const up = pct >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-600'}`}
    >
      <Icon size={13} />
      {up ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  )
}

function MetricCard({
  icon,
  iconBg,
  label,
  value,
  valueColor,
  subtitle,
  delta,
}: {
  icon: ReactNode
  iconBg: string
  label: string
  value: string
  valueColor?: string
  subtitle: string
  delta?: number | null
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>{icon}</div>
        {delta !== undefined && <DeltaChip pct={delta} />}
      </div>
      <p className="mt-3 text-[13px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-[26px] font-extrabold leading-tight" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
    </Card>
  )
}

function MrrChart({ series }: { series: { label: string; mrr: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720
  const H = 240
  const padL = 64
  const padR = 16
  const padT = 16
  const padB = 32
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const max = Math.max(...series.map((p) => p.mrr), 1)
  const top = max * 1.15
  const x = (i: number) => (series.length === 1 ? padL + plotW / 2 : padL + (i / (series.length - 1)) * plotW)
  const y = (v: number) => padT + plotH - (v / top) * plotH
  const points = series.map((p, i) => `${x(i)},${y(p.mrr)}`).join(' ')

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" style={{ height: H }} role="img" aria-label="Evolução do MRR nos últimos 6 meses">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={padT + plotH * g} y2={padT + plotH * g} stroke="#E2E8F0" strokeWidth={1} />
            <text x={padL - 10} y={padT + plotH * g + 4} textAnchor="end" fontSize={11} fill="#94A3B8">
              {BRL(top * (1 - g))}
            </text>
          </g>
        ))}
        {series.length > 1 && <polyline points={points} fill="none" stroke={CHART_COLOR} strokeWidth={2.5} strokeLinejoin="round" />}
        {series.map((p, i) => (
          <g key={p.label}>
            <text x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="#64748B">
              {p.label}
            </text>
            <circle
              cx={x(i)}
              cy={y(p.mrr)}
              r={hover === i ? 6 : 4}
              fill={CHART_COLOR}
              className="cursor-pointer"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
            {hover === i && (
              <g>
                <rect x={x(i) - 46} y={y(p.mrr) - 34} width={92} height={22} rx={5} fill="#1E293B" />
                <text x={x(i)} y={y(p.mrr) - 19} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
                  {BRL(p.mrr)}
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

function GestorBar({
  name,
  value,
  clients,
  total,
  color,
}: {
  name: string
  value: number
  clients: number
  total: number
  color: string
}) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-slate-800">{name}</span>
        <span className="text-sm font-bold text-slate-900">{BRL2(value)}</span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {clients} {clients === 1 ? 'cliente' : 'clientes'}
      </p>
    </div>
  )
}

export function OverviewDashboard() {
  const navigate = useNavigate()
  const { data: clients } = useClients()
  const { data: leads } = useLeads()
  const { data: tasks } = useAllTasks()
  const { data: users } = useUsers()
  const { data: snapshot } = useMetricsSnapshot()
  const { data: upsellActivities } = useCollectionSubscription<Activity>(
    (onData, onError) => subscribeUpsellActivities(onData, onError),
    []
  )
  const [refreshing, setRefreshing] = useState(false)

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])
  const live = useMemo(() => computeCompanyMetrics(clients, users), [clients, users])
  const mrrSeries = useMemo(() => computeMrrSeries(clients), [clients])

  // Prefere o snapshot diário; cai no cálculo ao vivo antes do primeiro cron.
  const m = snapshot ?? { ...live, prevMonth: null as { mrr: number; activeClients: number } | null, calculatedAt: '' }
  const usingLive = !snapshot

  const mrrDelta = m.prevMonth && m.prevMonth.mrr > 0 ? ((m.mrr - m.prevMonth.mrr) / m.prevMonth.mrr) * 100 : null
  const clientsDelta =
    m.prevMonth && m.prevMonth.activeClients > 0
      ? ((m.activeClients - m.prevMonth.activeClients) / m.prevMonth.activeClients) * 100
      : null

  const churnColor = m.churnRate < 5 ? '#059669' : m.churnRate <= 10 ? '#D97706' : '#DC2626'

  // ---- Pipeline de Leads (ao vivo) ----
  const pipeline = useMemo(() => {
    const activeLeads = leads.filter((l) => PIPELINE_STAGES.includes(l.status))
    const byStage = PIPELINE_STAGES.map((s) => ({
      status: s,
      label: LEAD_STATUS_LABEL[s],
      count: activeLeads.filter((l) => l.status === s).length,
    }))
    const potentialMrr = activeLeads.reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0)
    return { byStage, potentialMrr }
  }, [leads])

  // ---- Upsell no mês ----
  const monthStart = useMemo(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  }, [])
  const upsellThisMonth = useMemo(
    () =>
      upsellActivities
        .filter((a) => (a.createdAt?.toDate?.() ?? new Date(0)) >= monthStart)
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)),
    [upsellActivities, monthStart]
  )

  // ---- Clientes em risco ----
  const atRisk = useMemo(() => {
    return clients
      .filter((c) => c.status === 'active' || c.status === 'paused')
      .map((c) => {
        const overdue = tasks.filter(
          (t) =>
            t.clientId === c.id &&
            t.status !== 'done' &&
            t.dueDate &&
            isPast(t.dueDate.toDate()) &&
            !isToday(t.dueDate.toDate())
        ).length
        const reasons: string[] = []
        if (c.status === 'paused') reasons.push('Cliente pausado')
        if (overdue >= 2) reasons.push(`${overdue} tarefas atrasadas`)
        return { client: c, reasons }
      })
      .filter((r) => r.reasons.length > 0)
      .sort((a, b) => b.reasons.length - a.reasons.length)
  }, [clients, tasks])

  // ---- Novos clientes no mês (+ comparativo) ----
  const newClientsInfo = useMemo(() => {
    const start = (c: (typeof clients)[number]) => c.contractStartDate?.toDate?.() ?? c.createdAt?.toDate?.() ?? null
    const prevMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1)
    const thisMonth = clients
      .filter((c) => {
        const s = start(c)
        return s != null && s >= monthStart
      })
      .sort((a, b) => (start(b)?.getTime() ?? 0) - (start(a)?.getTime() ?? 0))
    const prevCount = clients.filter((c) => {
      const s = start(c)
      return s != null && s >= prevMonthStart && s < monthStart
    }).length
    return { list: thisMonth, diff: thisMonth.length - prevCount }
  }, [clients, monthStart])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshMetricsNow()
      toast.success('Métricas atualizadas')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Falha ao atualizar métricas')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          {usingLive || !formatWhen(m.calculatedAt)
            ? 'Cálculo ao vivo — ainda sem snapshot diário.'
            : `Atualizado ${formatWhen(m.calculatedAt)}`}
        </p>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />} onClick={handleRefresh} loading={refreshing}>
          Atualizar agora
        </Button>
      </div>

      {m.clientsWithoutValue > 0 && (
        <button
          onClick={() => navigate('/clientes')}
          className="flex items-center gap-2 self-start rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-100"
        >
          <AlertTriangle size={13} />
          {m.clientsWithoutValue} {m.clientsWithoutValue === 1 ? 'cliente sem' : 'clientes sem'} valor cadastrado — acesse a ficha para completar
        </button>
      )}

      {/* LINHA 1 — Cards de métricas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<DollarSign size={17} className="text-white" />}
          iconBg="bg-emerald-500"
          label="MRR"
          value={BRL(m.mrr)}
          subtitle="Receita recorrente mensal"
          delta={mrrDelta}
        />
        <MetricCard
          icon={<Users size={17} className="text-white" />}
          iconBg="bg-blue-500"
          label="Clientes Ativos"
          value={String(m.activeClients)}
          subtitle="Clientes em carteira"
          delta={clientsDelta}
        />
        <MetricCard
          icon={<ActivityIcon size={17} className="text-white" />}
          iconBg="bg-slate-500"
          label="Churn Rate"
          value={`${m.churnRate.toFixed(1)}%`}
          valueColor={churnColor}
          subtitle="Taxa de cancelamento do mês"
        />
        <MetricCard
          icon={<Gem size={17} className="text-white" />}
          iconBg="bg-violet-500"
          label="LTV Médio"
          value={BRL(m.ltv)}
          subtitle="Valor médio por cliente"
        />
      </div>

      {/* LINHA 2 — Evolução do MRR */}
      <Card>
        <CardTitle>Evolução do MRR — últimos 6 meses</CardTitle>
        <MrrChart series={mrrSeries} />
      </Card>

      {/* LINHA 3 — Receita por gestor + Pipeline */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Receita por Gestor</CardTitle>
          {m.revenueByGestor.ciane === 0 && m.revenueByGestor.nicolas === 0 ? (
            <EmptyState title="Sem receita atribuída a gestores" />
          ) : (
            <div className="flex flex-col gap-4">
              <GestorBar
                name="Ciane"
                value={m.revenueByGestor.ciane}
                clients={m.clientsByGestor.ciane}
                total={m.revenueByGestor.ciane + m.revenueByGestor.nicolas}
                color="#2563EB"
              />
              <GestorBar
                name="Nicolas"
                value={m.revenueByGestor.nicolas}
                clients={m.clientsByGestor.nicolas}
                total={m.revenueByGestor.ciane + m.revenueByGestor.nicolas}
                color="#8B5CF6"
              />
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Pipeline de Leads</CardTitle>
          <div className="flex flex-col gap-2">
            {pipeline.byStage.map((s) => (
              <div key={s.status} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{s.label}</span>
                <span className="font-bold text-slate-900">{s.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-slate-500">MRR potencial</span>
              <span className="text-lg font-extrabold text-emerald-600">{BRL(pipeline.potentialMrr)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* LINHA 4 — Upsell / Risco / Novos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>
            <span className="flex items-center gap-2">
              <ArrowUpRight size={16} className="text-emerald-600" /> Upsell
            </span>
          </CardTitle>
          <p className="text-sm text-slate-500">
            {upsellThisMonth.length === 0
              ? 'Nenhuma expansão de contrato este mês'
              : `${upsellThisMonth.length} ${upsellThisMonth.length === 1 ? 'cliente expandiu' : 'clientes expandiram'} o contrato`}
          </p>
          {upsellThisMonth.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {upsellThisMonth.map((a) => (
                <li key={a.id} className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">{clientMap[a.entityId]?.companyName ?? 'Cliente'}</span>
                  {' — '}
                  {a.message.replace(/^expandiu o contrato:\s*/i, '')}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>
            <span className="flex items-center gap-2">
              Clientes em Risco
              {atRisk.length > 0 && (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{atRisk.length}</span>
              )}
            </span>
          </CardTitle>
          {atRisk.length === 0 ? (
            <EmptyState title="Nenhum cliente em risco" />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {atRisk.map(({ client, reasons }) => (
                <li key={client.id}>
                  <button
                    onClick={() => navigate(`/clientes/${client.id}`)}
                    className="w-full rounded-md px-1 py-0.5 text-left hover:bg-slate-50"
                  >
                    <span className="block truncate text-sm font-medium text-slate-800">{client.companyName}</span>
                    <span className="text-xs text-red-600">{reasons.join(' • ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>
            <span className="flex items-center gap-2">
              <UserPlus size={16} className="text-blue-600" /> Novos Clientes este mês
            </span>
          </CardTitle>
          <p className="text-[26px] font-extrabold leading-tight text-slate-900">{newClientsInfo.list.length}</p>
          <p className="text-xs text-slate-400">
            {newClientsInfo.diff === 0
              ? 'mesmo número do mês anterior'
              : `${newClientsInfo.diff > 0 ? '+' : ''}${newClientsInfo.diff} vs. mês anterior`}
          </p>
          {newClientsInfo.list.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {newClientsInfo.list.map((c) => {
                const d = c.contractStartDate?.toDate?.() ?? c.createdAt?.toDate?.() ?? null
                return (
                  <li key={c.id} className="flex items-center justify-between text-xs">
                    <button
                      onClick={() => navigate(`/clientes/${c.id}`)}
                      className="truncate font-medium text-slate-700 hover:text-brand-600"
                    >
                      {c.companyName}
                    </button>
                    {d && <span className="shrink-0 text-slate-400">{format(d, 'dd/MM', { locale: ptBR })}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

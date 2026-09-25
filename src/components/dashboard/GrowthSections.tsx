import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, isPast, isToday, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AlertTriangle, BellRing, CheckCircle2, Clock, PhoneMissed, UserX, Wallet } from 'lucide-react'
import { usePrivacy } from '../../context/PrivacyContext'
import { Card, CardTitle } from './DashboardCard'
import {
  LEAD_LOST_REASON_LABEL,
  LEAD_SOURCE_LABEL,
  locateLead,
  type Activity,
  type Client,
  type Lead,
  type LeadSource,
  type ResolvedPipeline,
} from '../../types'

const BRL = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const DAY = 24 * 60 * 60 * 1000

const toDate = (v: { toDate?: () => Date } | null | undefined): Date | null => v?.toDate?.() ?? null
const clientStart = (c: Client) => toDate(c.contractStartDate) ?? toDate(c.createdAt)
/** Não existe data de cancelamento própria — a última edição do cliente
 *  encerrado é a melhor aproximação (mesmo critério do modal de churn). */
const churnDate = (c: Client) => (c.status === 'churned' ? toDate(c.updatedAt) : null)

/** Quando o lead foi ganho/perdido (null = ainda em aberto). */
function leadOutcome(lead: Lead, pipelines: ResolvedPipeline[]): { kind: 'open' | 'won' | 'lost'; at: Date | null } {
  if (lead.convertedClientId) return { kind: 'won', at: toDate(lead.convertedAt) ?? toDate(lead.stageChangedAt) }
  if (pipelines.length === 0) return { kind: 'open', at: null }
  const { stage } = locateLead(pipelines, lead)
  if (stage.kind === 'won') return { kind: 'won', at: toDate(lead.stageChangedAt) }
  if (stage.kind === 'lost') return { kind: 'lost', at: toDate(lead.lostAt) ?? toDate(lead.stageChangedAt) }
  return { kind: 'open', at: null }
}

// ------------------------------------------------------------------ Alertas

interface AlertItem {
  key: string
  icon: ReactNode
  tone: 'red' | 'amber'
  title: string
  detail?: string
  names?: { id: string; label: string; to: string }[]
  action?: { label: string; to: string }
}

/** "O que precisa de atenção agora" — junta o que hoje fica espalhado pelo
 *  CRM: lead sem contato, lead parado, próxima ação vencida, cliente em
 *  risco e cliente sem valor cadastrado. */
export function AlertsCard({
  leads,
  pipelines,
  atRiskCount,
  clientsWithoutValue,
}: {
  leads: Lead[]
  pipelines: ResolvedPipeline[]
  atRiskCount: number
  clientsWithoutValue: Client[]
}) {
  const navigate = useNavigate()
  const { isPrivacyMode } = usePrivacy()

  const alerts = useMemo(() => {
    const now = Date.now()
    const out: AlertItem[] = []
    const open = pipelines.length
      ? leads.filter((l) => !l.convertedClientId && locateLead(pipelines, l).stage.kind === 'open')
      : []
    const lastContact = (l: Lead) => Math.max(0, ...l.contactHistory.map((h) => h.date?.toMillis?.() ?? 0))
    const leadName = (l: Lead) => l.companyName || l.contactName

    const noContact = open.filter((l) => l.contactHistory.length === 0 && now - (l.createdAt?.toMillis?.() ?? now) > DAY)
    if (noContact.length)
      out.push({
        key: 'no-contact',
        icon: <PhoneMissed size={15} />,
        tone: 'red',
        title: `${noContact.length} ${noContact.length === 1 ? 'lead chegou e ainda não teve' : 'leads chegaram e ainda não tiveram'} contato`,
        detail: 'Há mais de 24h sem nenhum contato registrado.',
        names: noContact.slice(0, 4).map((l) => ({ id: l.id, label: leadName(l), to: '/leads' })),
        action: { label: 'Ver leads', to: '/leads' },
      })

    const noContactIds = new Set(noContact.map((l) => l.id))
    const stale = open.filter((l) => {
      if (noContactIds.has(l.id)) return false
      const moved = l.stageChangedAt?.toMillis?.() ?? 0
      return now - Math.max(moved, lastContact(l)) > 7 * DAY
    })
    if (stale.length)
      out.push({
        key: 'stale',
        icon: <Clock size={15} />,
        tone: 'amber',
        title: `${stale.length} ${stale.length === 1 ? 'lead parado' : 'leads parados'} há mais de 7 dias`,
        detail: 'Sem mudar de etapa nem contato novo — risco de esfriar.',
        names: stale.slice(0, 4).map((l) => ({ id: l.id, label: leadName(l), to: '/leads' })),
        action: { label: 'Ver leads', to: '/leads' },
      })

    const lateAction = open.filter((l) => {
      const d = toDate(l.nextActionDate)
      return d != null && isPast(d) && !isToday(d)
    })
    if (lateAction.length)
      out.push({
        key: 'late-action',
        icon: <BellRing size={15} />,
        tone: 'amber',
        title: `${lateAction.length} ${lateAction.length === 1 ? 'próxima ação vencida' : 'próximas ações vencidas'} em leads`,
        names: lateAction.slice(0, 4).map((l) => ({ id: l.id, label: leadName(l), to: '/leads' })),
        action: { label: 'Ver leads', to: '/leads' },
      })

    if (atRiskCount > 0)
      out.push({
        key: 'risk',
        icon: <UserX size={15} />,
        tone: 'red',
        title: `${atRiskCount} ${atRiskCount === 1 ? 'cliente em risco' : 'clientes em risco'}`,
        detail: 'Veja os motivos no card "Clientes em Risco" mais abaixo.',
      })

    if (clientsWithoutValue.length)
      out.push({
        key: 'no-value',
        icon: <Wallet size={15} />,
        tone: 'amber',
        title: `${clientsWithoutValue.length} ${clientsWithoutValue.length === 1 ? 'cliente ativo sem' : 'clientes ativos sem'} valor de contrato`,
        detail: 'Sem o valor, o MRR e a receita ficam errados.',
        names: clientsWithoutValue.slice(0, 6).map((c) => ({ id: c.id, label: c.companyName, to: `/clientes/${c.id}` })),
      })
    return out
  }, [leads, pipelines, atRiskCount, clientsWithoutValue])

  return (
    <Card>
      <CardTitle>
        <span className="flex items-center gap-2">
          <AlertTriangle size={16} className={alerts.length ? 'text-amber-500' : 'text-emerald-500'} />
          Alertas
          {alerts.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{alerts.length}</span>}
        </span>
      </CardTitle>
      {alerts.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <CheckCircle2 size={16} className="text-emerald-500" /> Tudo em dia — nenhum ponto de atenção agora.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {alerts.map((a) => (
            <li key={a.key} className="flex gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  a.tone === 'red' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                }`}
              >
                {a.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                {a.detail && <p className="text-xs text-slate-500">{a.detail}</p>}
                {a.names && a.names.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {a.names.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => navigate(n.to)}
                        className="max-w-[160px] truncate rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
                      >
                        {isPrivacyMode ? '••••••' : n.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {a.action && (
                <button onClick={() => navigate(a.action!.to)} className="shrink-0 self-start text-xs font-semibold text-brand-600 hover:text-brand-700">
                  {a.action.label} →
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ------------------------------------------------------------------ Receita gerada

function monthRevenue(clients: Client[], upsells: Activity[], monthStart: Date) {
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
  const inMonth = (d: Date | null) => d != null && d >= monthStart && d < monthEnd
  const newClients = clients.filter((c) => inMonth(clientStart(c)))
  const churned = clients.filter((c) => inMonth(churnDate(c)))
  const newMrr = newClients.reduce((s, c) => s + (c.monthlyValue ?? 0), 0)
  const upsell = upsells.filter((a) => inMonth(toDate(a.createdAt))).reduce((s, a) => s + (a.amount ?? 0), 0)
  const lost = churned.reduce((s, c) => s + (c.monthlyValue ?? 0), 0)
  return { newMrr, newCount: newClients.length, upsell, lost, lostCount: churned.length, net: newMrr + upsell - lost }
}

/** Dinheiro novo do mês: contratos novos + upsell − cancelamentos, com o
 *  comparativo do mês anterior. Complementa o MRR (que é o total acumulado). */
export function RevenueGeneratedCard({ clients, upsells }: { clients: Client[]; upsells: Activity[] }) {
  const { isPrivacyMode } = usePrivacy()
  const money = (v: number) => (isPrivacyMode ? 'R$ •.•••' : BRL(v))
  const { cur, prev } = useMemo(() => {
    const start = startOfMonth(new Date())
    return { cur: monthRevenue(clients, upsells, start), prev: monthRevenue(clients, upsells, subMonths(start, 1)) }
  }, [clients, upsells])
  const diff = cur.net - prev.net

  const Row = ({ label, sub, value, color }: { label: string; sub?: string; value: string; color: string }) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm text-slate-600">
        {label}
        {sub && <span className="ml-1 text-xs text-slate-400">{sub}</span>}
      </span>
      <span className="text-sm font-bold" style={{ color }}>
        {value}
      </span>
    </div>
  )

  return (
    <Card>
      <CardTitle
        tip={{
          title: 'Receita gerada no mês',
          body: 'Quanto de receita mensal nova entrou este mês: contratos de clientes novos + upsells registrados − contratos cancelados. O MRR mostra o total; aqui é o movimento do mês.',
        }}
      >
        Receita gerada no mês
      </CardTitle>
      <div className="divide-y divide-slate-100">
        <Row label="Contratos novos" sub={`(${cur.newCount})`} value={`+ ${money(cur.newMrr)}`} color="#059669" />
        <Row label="Upsell" value={`+ ${money(cur.upsell)}`} color="#059669" />
        <Row label="Cancelamentos" sub={`(${cur.lostCount})`} value={`− ${money(cur.lost)}`} color="#DC2626" />
      </div>
      <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-3">
        <span className="text-sm font-semibold text-slate-700">Resultado do mês</span>
        <span className={`text-[22px] font-extrabold ${cur.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {cur.net >= 0 ? '+ ' : '− '}
          {money(Math.abs(cur.net))}
        </span>
      </div>
      <p className="mt-1 text-right text-xs text-slate-400">
        Mês passado: {prev.net >= 0 ? '+' : '−'} {money(Math.abs(prev.net))}
        {!isPrivacyMode && diff !== 0 && (
          <span className={diff > 0 ? 'text-emerald-600' : 'text-red-600'}>
            {' '}
            ({diff > 0 ? '+' : '−'}
            {BRL(Math.abs(diff))})
          </span>
        )}
      </p>
    </Card>
  )
}

// ------------------------------------------------------------------ Evolução da carteira

/** Entradas × saídas de clientes por mês (6 meses) — mostra se a carteira
 *  está crescendo de verdade, junto do gráfico de MRR. */
export function ClientFlowCard({ clients }: { clients: Client[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const data = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const start = startOfMonth(subMonths(now, 5 - i))
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
      const inMonth = (d: Date | null) => d != null && d >= start && d < end
      const label = format(start, 'MMM', { locale: ptBR })
      return {
        label: label.charAt(0).toUpperCase() + label.slice(1),
        in: clients.filter((c) => inMonth(clientStart(c))).length,
        out: clients.filter((c) => inMonth(churnDate(c))).length,
      }
    })
  }, [clients])
  const max = Math.max(1, ...data.flatMap((d) => [d.in, d.out]))
  const totalIn = data.reduce((s, d) => s + d.in, 0)
  const totalOut = data.reduce((s, d) => s + d.out, 0)

  return (
    <Card>
      <CardTitle
        tip={{
          title: 'Entradas e saídas de clientes',
          body: 'Verde: clientes que começaram no mês (data de início do contrato). Vermelho: clientes encerrados no mês. Barra verde maior que a vermelha = carteira crescendo.',
        }}
      >
        Entradas e saídas de clientes
      </CardTitle>
      <div className="mb-3 flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Entraram <strong className="text-slate-800">{totalIn}</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Saíram <strong className="text-slate-800">{totalOut}</strong>
        </span>
        <span className="text-slate-400">nos últimos 6 meses</span>
      </div>
      <div className="flex h-40 items-end gap-3">
        {data.map((d, i) => (
          <div
            key={d.label}
            className="relative flex h-full flex-1 flex-col justify-end"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-[11px] text-white shadow">
                +{d.in} entraram · −{d.out} saíram
              </div>
            )}
            <div className="flex h-full items-end justify-center gap-1">
              <div className="w-1/3 max-w-[18px] rounded-t bg-emerald-500 transition-all" style={{ height: `${(d.in / max) * 100}%`, minHeight: d.in ? 4 : 0 }} />
              <div className="w-1/3 max-w-[18px] rounded-t bg-red-500 transition-all" style={{ height: `${(d.out / max) * 100}%`, minHeight: d.out ? 4 : 0 }} />
            </div>
            <span className="mt-1.5 text-center text-[11px] text-slate-500">{d.label}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ------------------------------------------------------------------ Vendas: Origem + Comercial

type Period = 'month' | '90d' | 'all'
const PERIOD_LABEL: Record<Period, string> = { month: 'Este mês', '90d': 'Últimos 90 dias', all: 'Tudo' }

function periodStart(p: Period): number {
  if (p === 'month') return startOfMonth(new Date()).getTime()
  if (p === '90d') return Date.now() - 90 * DAY
  return 0
}

/** Origem dos leads e resultado comercial, com o mesmo filtro de período. */
export function SalesSection({ leads, pipelines }: { leads: Lead[]; pipelines: ResolvedPipeline[] }) {
  const { isPrivacyMode } = usePrivacy()
  const [period, setPeriod] = useState<Period>('90d')
  const money = (v: number) => (isPrivacyMode ? 'R$ •.•••' : BRL(v))

  const stats = useMemo(() => {
    const since = periodStart(period)
    const created = (l: Lead) => l.createdAt?.toMillis?.() ?? 0
    const withOutcome = leads.map((l) => ({ lead: l, ...leadOutcome(l, pipelines) }))
    const inPeriod = (d: Date | null) => d != null && d.getTime() >= since

    // Origem: leads que CHEGARAM no período e quantos deles já fecharam.
    const arrived = withOutcome.filter((x) => created(x.lead) >= since)
    const bySource = new Map<LeadSource, { leads: number; won: number; value: number }>()
    for (const x of arrived) {
      const e = bySource.get(x.lead.source) ?? { leads: 0, won: 0, value: 0 }
      e.leads++
      if (x.kind === 'won') {
        e.won++
        e.value += x.lead.estimatedValue ?? 0
      }
      bySource.set(x.lead.source, e)
    }
    const sources = [...bySource.entries()].map(([source, e]) => ({ source, ...e, rate: e.leads ? (e.won / e.leads) * 100 : 0 })).sort((a, b) => b.leads - a.leads)
    const best = sources.filter((s) => s.leads >= 3 && s.won > 0).sort((a, b) => b.rate - a.rate)[0] ?? null

    // Comercial: o que aconteceu no período (fechou/perdeu no período).
    const won = withOutcome.filter((x) => x.kind === 'won' && inPeriod(x.at))
    const lost = withOutcome.filter((x) => x.kind === 'lost' && inPeriod(x.at))
    const inNegotiation = withOutcome.filter((x) => x.kind === 'open' && ['proposal_sent', 'negotiation'].includes(x.lead.status)).length
    const cycleDays = won
      .map((x) => (x.at && created(x.lead) ? (x.at.getTime() - created(x.lead)) / DAY : null))
      .filter((d): d is number => d != null && d >= 0)
    const reasons = new Map<string, number>()
    for (const x of lost) if (x.lead.lostReason) reasons.set(x.lead.lostReason, (reasons.get(x.lead.lostReason) ?? 0) + 1)
    const topReason = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]

    return {
      arrivedCount: arrived.length,
      sources,
      best,
      won: won.length,
      lost: lost.length,
      wonValue: won.reduce((s, x) => s + (x.lead.estimatedValue ?? 0), 0),
      closeRate: won.length + lost.length > 0 ? (won.length / (won.length + lost.length)) * 100 : null,
      inNegotiation,
      avgCycle: cycleDays.length ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : null,
      topReason: topReason ? { label: LEAD_LOST_REASON_LABEL[topReason[0] as keyof typeof LEAD_LOST_REASON_LABEL] ?? topReason[0], count: topReason[1] } : null,
    }
  }, [leads, pipelines, period])

  const maxLeads = Math.max(1, ...stats.sources.map((s) => s.leads))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-semibold text-slate-900">Vendas e marketing</p>
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${period === p ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle
            tip={{
              title: 'Origem dos leads',
              body: 'De onde vieram os leads que chegaram no período, e quantos deles já fecharam. Mostra qual canal traz lead que vira cliente — não só volume.',
            }}
          >
            Origem dos leads
          </CardTitle>
          {stats.sources.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum lead chegou nesse período.</p>
          ) : (
            <>
              <div className="mb-2 grid grid-cols-[minmax(0,1fr)_56px_76px] gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <span>Canal</span>
                <span className="text-right">Leads</span>
                <span className="text-right">Fecharam</span>
              </div>
              <ul className="flex flex-col gap-2.5">
                {stats.sources.map((s) => (
                  <li key={s.source} className="grid grid-cols-[minmax(0,1fr)_56px_76px] items-center gap-2 text-sm" title={`${s.won} de ${s.leads} fecharam · ${money(s.value)}`}>
                    <div className="min-w-0">
                      <p className="truncate text-slate-700">{LEAD_SOURCE_LABEL[s.source] ?? s.source}</p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${(s.leads / maxLeads) * 100}%` }} />
                      </div>
                    </div>
                    <span className="text-right font-bold text-slate-900">{s.leads}</span>
                    <span className="text-right text-slate-600">
                      {s.won} <span className="text-xs text-slate-400">({s.rate.toFixed(0)}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                {stats.best ? (
                  <>
                    Canal que mais converte: <strong className="text-slate-800">{LEAD_SOURCE_LABEL[stats.best.source]}</strong> ({stats.best.rate.toFixed(0)}% viram cliente).
                  </>
                ) : (
                  `${stats.arrivedCount} leads no período — ainda sem fechamentos suficientes pra comparar os canais.`
                )}
              </p>
            </>
          )}
        </Card>

        <Card>
          <CardTitle
            tip={{
              title: 'Comercial',
              body: 'Resultado das negociações no período: leads fechados e perdidos (pela data em que foram pra etapa de ganho/perda), taxa de fechamento e valor fechado. Depende do pipeline estar atualizado.',
            }}
          >
            Comercial
          </CardTitle>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Fechados" value={String(stats.won)} color="#059669" />
            <Stat label="Perdidos" value={String(stats.lost)} color="#DC2626" />
            <Stat label="Taxa de fechamento" value={stats.closeRate == null ? '—' : `${stats.closeRate.toFixed(0)}%`} hint="fechados ÷ (fechados + perdidos)" />
            <Stat label="Valor fechado" value={money(stats.wonValue)} hint="soma do valor estimado" />
            <Stat label="Em proposta/negociação" value={String(stats.inNegotiation)} hint="agora, no pipeline" />
            <Stat label="Tempo até fechar" value={stats.avgCycle == null ? '—' : `${Math.round(stats.avgCycle)} dias`} hint="média, da chegada ao fechamento" />
          </div>
          {stats.topReason && (
            <p className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
              Principal motivo de perda: <strong className="text-slate-800">{stats.topReason.label}</strong> ({stats.topReason.count})
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-extrabold text-slate-900" style={color ? { color } : undefined}>
        {value}
      </p>
      {hint && <p className="text-[11px] leading-tight text-slate-400">{hint}</p>}
    </div>
  )
}

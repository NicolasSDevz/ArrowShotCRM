import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format, eachDayOfInterval } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ArrowLeft,
  Maximize2,
  X,
  Wallet,
  Eye,
  Users,
  MousePointerClick,
  Percent,
  Coins,
  Gauge,
  MessageCircle,
  DollarSign,
  Trophy,
} from 'lucide-react'
import { useReports } from '../hooks/useReports'
import { useClients } from '../hooks/useClients'
import { FullPageSpinner } from '../components/ui/FullPageSpinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { ReportLineChart, type ChartSeries } from '../components/reports/ReportLineChart'
import { previousPeriod } from '../utils/metaReportData'
import { buildExecutiveSummary, buildFunnelSentence, pctChange } from '../utils/reportSummary'
import type { ReportMetaSnapshot, ReportEntitySummary } from '../types'

/* ---------- formatters ---------- */
const fmtInt = (v?: number) => (v == null || Number.isNaN(v) ? '—' : Math.round(v).toLocaleString('pt-BR'))
const fmtBRL = (v?: number) =>
  v == null || Number.isNaN(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (v?: number) => (v == null || Number.isNaN(v) ? '—' : `${v.toFixed(2).replace('.', ',')}%`)
const fmtDate = (d: Date) => (Number.isNaN(d?.getTime?.()) ? '—' : format(d, 'dd/MM/yyyy', { locale: ptBR }))

/** Variação vs período anterior. A seta reflete a direção real; a cor reflete
 *  se a mudança é BOA para o negócio (`goodWhen`): para métricas de volume
 *  (impressões, cliques, conversas…) subir é bom; para métricas de custo
 *  (CPC, CPM, custo por conversa, investimento) cair é bom. */
function Delta({ curr, prev, goodWhen = 'up' }: { curr?: number; prev?: number; goodWhen?: 'up' | 'down' }) {
  const d = pctChange(curr, prev)
  if (d == null) return null
  if (Math.round(d) === 0) return <span className="text-xs font-medium text-slate-400">≈ 0%</span>
  const rising = d > 0
  const good = goodWhen === 'up' ? rising : !rising
  return (
    <span className={`text-xs font-semibold ${good ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
      {rising ? '▲' : '▼'} {rising ? '+' : ''}
      {d.toFixed(0)}%
    </span>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="mb-1 flex items-center gap-2.5 text-[18px] font-bold text-[#0F172A]">
      <span className="inline-block h-5 w-1 rounded-full bg-[#2563EB]" />
      {children}
    </h2>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="border-t border-[#E2E8F0] pt-8">
      <SectionTitle>{title}</SectionTitle>
      {subtitle && <p className="mb-4 ml-3.5 text-sm text-slate-400">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  )
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)] ${className}`}
    >
      {children}
    </div>
  )
}

/* ---------- Section 1: cards ---------- */
function MetricCard({
  icon,
  name,
  value,
  explanation,
  curr,
  prev,
  goodWhen = 'up',
}: {
  icon: ReactNode
  name: string
  value: string
  explanation: string
  curr?: number
  prev?: number
  goodWhen?: 'up' | 'down'
}) {
  return (
    <Card>
      <div className="mb-1.5 flex items-center gap-1.5 text-slate-400">{icon}</div>
      <p className="text-[12px] font-medium text-[#64748B]">{name}</p>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
        <p className="text-[28px] font-bold leading-tight text-[#0F172A]">{value}</p>
        <Delta curr={curr} prev={prev} goodWhen={goodWhen} />
      </div>
      <p className="mt-1 text-[11px] leading-snug text-[#94A3B8]">{explanation}</p>
    </Card>
  )
}

function OverviewSection({ meta }: { meta: ReportMetaSnapshot }) {
  const c = meta.metrics.current
  const p = meta.metrics.previous
  const costPerConv = (m?: { spend?: number; conversations?: number }) =>
    m?.spend && m?.conversations ? m.spend / m.conversations : undefined

  return (
    <Section title="Meta Ads — Visão Geral">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <MetricCard icon={<Wallet size={18} />} name="Valor Investido" value={fmtBRL(c.spend)} curr={c.spend} prev={p?.spend} goodWhen="down" explanation="Total gasto em anúncios no período" />
        <MetricCard icon={<Eye size={18} />} name="Impressões" value={fmtInt(c.impressions)} curr={c.impressions} prev={p?.impressions} explanation="Quantas vezes seus anúncios foram exibidos" />
        <MetricCard icon={<Users size={18} />} name="Alcance" value={fmtInt(c.reach)} curr={c.reach} prev={p?.reach} explanation="Pessoas únicas que viram seus anúncios" />
        <MetricCard icon={<MousePointerClick size={18} />} name="Cliques" value={fmtInt(c.clicks)} curr={c.clicks} prev={p?.clicks} explanation="Pessoas que clicaram nos anúncios" />
        <MetricCard icon={<Percent size={18} />} name="CTR" value={fmtPct(c.ctr)} curr={c.ctr} prev={p?.ctr} explanation="% de pessoas que clicaram ao ver o anúncio" />
        <MetricCard icon={<Coins size={18} />} name="CPC médio" value={fmtBRL(c.cpc)} curr={c.cpc} prev={p?.cpc} goodWhen="down" explanation="Custo médio por cada clique" />
        <MetricCard icon={<Gauge size={18} />} name="CPM médio" value={fmtBRL(c.cpm)} curr={c.cpm} prev={p?.cpm} goodWhen="down" explanation="Custo a cada mil vezes que o anúncio aparece" />
        <MetricCard icon={<MessageCircle size={18} />} name="Conversas iniciadas" value={fmtInt(c.conversations)} curr={c.conversations} prev={p?.conversations} explanation="Pessoas que mandaram mensagem pelo anúncio" />
        <MetricCard icon={<DollarSign size={18} />} name="Custo por conversa" value={fmtBRL(costPerConv(c))} curr={costPerConv(c)} prev={costPerConv(p)} goodWhen="down" explanation="Quanto custou cada nova conversa" />
      </div>
    </Section>
  )
}

/* ---------- Section 2: funnel ---------- */
const pctPtBR = (v: number) => `${v.toFixed(1).replace('.', ',')}%`

function FunnelSection({ meta }: { meta: ReportMetaSnapshot }) {
  const c = meta.metrics.current
  const stages: { label: string; value?: number; color: string; prevLabel?: string; prevValue?: number }[] = [
    { label: 'Impressões', value: c.impressions, color: '#1E3A8A' },
    { label: 'Alcance', value: c.reach, color: '#1D4ED8', prevLabel: 'das impressões', prevValue: c.impressions },
    { label: 'Cliques', value: c.clicks, color: '#3B82F6', prevLabel: 'do alcance', prevValue: c.reach },
    { label: 'Cliques no link', value: c.linkClicks, color: '#60A5FA', prevLabel: 'dos cliques', prevValue: c.clicks },
    { label: 'Conversas iniciadas', value: c.conversations, color: '#10B981', prevLabel: 'dos cliques no link', prevValue: c.linkClicks ?? c.clicks },
  ]
  const base = c.impressions ?? 0
  const placeholder = [100, 82, 60, 44, 28]

  return (
    <Section title="Jornada do Cliente" subtitle="Do anúncio à conversa">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div className="flex flex-col items-center">
          {stages.map((s, i) => {
            const width =
              base > 0 && s.value != null ? Math.min(100, Math.max(20, (s.value / base) * 100)) : placeholder[i]
            const ratio =
              s.prevValue && s.value != null && s.prevValue > 0 ? (s.value / s.prevValue) * 100 : undefined
            return (
              <div key={s.label} className="flex w-full flex-col items-center">
                <div
                  className="flex flex-col items-center justify-center py-3 text-center text-white transition-all"
                  style={{
                    width: `${width}%`,
                    minWidth: '46%',
                    backgroundColor: s.color,
                    clipPath: 'polygon(4% 0, 96% 0, 100% 100%, 0 100%)',
                  }}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide opacity-90">{s.label}</span>
                  <span className="text-base font-bold">{fmtInt(s.value)}</span>
                  {i > 0 && s.prevLabel && (
                    <span className="text-[11px] opacity-90">
                      {ratio != null ? `${pctPtBR(Math.min(100, ratio))} ${s.prevLabel}` : `— ${s.prevLabel}`}
                    </span>
                  )}
                </div>
                {i < stages.length - 1 && <div className="my-0.5 text-slate-300">▼</div>}
              </div>
            )
          })}
        </div>
        <Card className="bg-[#F8FAFC]">
          <p className="text-sm leading-relaxed text-slate-700">
            {buildFunnelSentence(meta) || 'Sem dados suficientes para montar o funil.'}
          </p>
        </Card>
      </div>
    </Section>
  )
}

/* ---------- Section 3: evolution ---------- */
const CHART_METRICS = {
  impressions: { label: 'Impressões', color: '#2563EB', fmt: fmtInt },
  clicks: { label: 'Cliques', color: '#7C3AED', fmt: fmtInt },
  reach: { label: 'Alcance', color: '#0891B2', fmt: fmtInt },
  conversations: { label: 'Conversas', color: '#10B981', fmt: fmtInt },
  spend: { label: 'Investimento', color: '#F59E0B', fmt: (v: number) => fmtBRL(v) },
} as const
type ChartMetricKey = keyof typeof CHART_METRICS

function EvolutionSection({ meta, periodStart, periodEnd }: { meta: ReportMetaSnapshot; periodStart: Date; periodEnd: Date }) {
  const [a, setA] = useState<ChartMetricKey>('impressions')
  const [b, setB] = useState<ChartMetricKey>('conversations')

  const daily = meta.dailySeries
  const chart = useMemo(() => {
    try {
      if (!daily || daily.length === 0) return null
      if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd < periodStart) return null
      const spanDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000)
      if (spanDays > 400) return null
      const days = eachDayOfInterval({ start: periodStart, end: periodEnd })
      const byDate = new Map(daily.map((d) => [d.date, d]))
      const labels = days.map((d) => format(d, 'dd/MM'))
      const valuesFor = (key: ChartMetricKey) => days.map((d) => byDate.get(format(d, 'yyyy-MM-dd'))?.[key])
      return { labels, valuesFor }
    } catch (err) {
      console.error('EvolutionSection chart', err)
      return null
    }
  }, [daily, periodStart, periodEnd])

  const seriesA: ChartSeries = { label: CHART_METRICS[a].label, color: CHART_METRICS[a].color, values: chart?.valuesFor(a) ?? [], format: CHART_METRICS[a].fmt }
  const seriesB: ChartSeries = { label: CHART_METRICS[b].label, color: CHART_METRICS[b].color, values: chart?.valuesFor(b) ?? [], format: CHART_METRICS[b].fmt }

  return (
    <Section title="Desempenho ao longo do período">
      {!chart ? (
        <Card>
          <p className="text-sm text-slate-400">
            Este relatório não tem a série diária (foi gerado antes desta versão do painel). Gere um novo
            relatório para ver a evolução dia a dia.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_METRICS[a].color }} />
              <select value={a} onChange={(e) => setA(e.target.value as ChartMetricKey)} className="rounded-lg border border-slate-200 px-2 py-1 text-sm">
                {Object.entries(CHART_METRICS).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_METRICS[b].color }} />
              <select value={b} onChange={(e) => setB(e.target.value as ChartMetricKey)} className="rounded-lg border border-slate-200 px-2 py-1 text-sm">
                {Object.entries(CHART_METRICS).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </select>
            </label>
          </div>
          <ReportLineChart labels={chart.labels} seriesA={seriesA} seriesB={seriesB} />
        </Card>
      )}
    </Section>
  )
}

/* ---------- Section 4: campaigns ---------- */
function costPerResult(e: ReportEntitySummary) {
  return e.spend && e.conversations ? e.spend / e.conversations : undefined
}

function CampaignsSection({ campaigns }: { campaigns: ReportEntitySummary[] }) {
  const withConv = campaigns.filter((c) => (c.conversations ?? 0) > 0)
  const best = withConv.length
    ? withConv.reduce((a, b) => ((costPerResult(a) ?? Infinity) <= (costPerResult(b) ?? Infinity) ? a : b))
    : undefined

  return (
    <Section title="Suas campanhas no período">
      {campaigns.length === 0 ? (
        <Card><p className="text-sm text-slate-400">Sem dados de campanhas no período.</p></Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#2563EB] text-xs font-semibold uppercase tracking-wide text-white">
                <tr>
                  <th className="px-4 py-2.5">Campanha</th>
                  <th className="px-4 py-2.5">Resultado</th>
                  <th className="px-4 py-2.5">Custo / resultado</th>
                  <th className="px-4 py-2.5">Investido</th>
                  <th className="px-4 py-2.5">CTR</th>
                  <th className="px-4 py-2.5">Alcance</th>
                  <th className="px-4 py-2.5">Impressões</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c, i) => (
                  <tr key={c.id || i} className={`border-t border-slate-100 text-slate-700 transition-colors hover:bg-[#F8FAFC] ${i % 2 === 1 ? 'bg-[#F8FAFC]' : 'bg-white'}`}>
                    <td className="max-w-[240px] truncate px-4 py-2.5 font-medium text-slate-800">{c.name}</td>
                    <td className="px-4 py-2.5">{fmtInt(c.conversations)}</td>
                    <td className="px-4 py-2.5">{fmtBRL(costPerResult(c))}</td>
                    <td className="px-4 py-2.5">{fmtBRL(c.spend)}</td>
                    <td className="px-4 py-2.5">{fmtPct(c.ctr)}</td>
                    <td className="px-4 py-2.5">{fmtInt(c.reach)}</td>
                    <td className="px-4 py-2.5">{fmtInt(c.impressions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {best && (
            <p className="mt-3 text-sm text-slate-600">
              A campanha <span className="font-semibold text-slate-800">{best.name}</span> trouxe mais resultados
              pelo menor custo no período.
            </p>
          )}
        </>
      )}
    </Section>
  )
}

/* ---------- Section 5: top ads ---------- */
function AdsSection({ ads }: { ads: ReportEntitySummary[] }) {
  const ranked = [...ads]
    .sort((a, b) => (b.conversations ?? 0) - (a.conversations ?? 0) || (b.spend ?? 0) - (a.spend ?? 0))
    .slice(0, 3)

  return (
    <Section title="Anúncios que mais performaram">
      {ranked.length === 0 ? (
        <Card><p className="text-sm text-slate-400">Sem dados de anúncios no período.</p></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {ranked.map((ad, i) => (
            <Card key={ad.id || i}>
              {i === 0 && (
                <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  <Trophy size={11} /> Melhor resultado
                </span>
              )}
              <p className="truncate text-sm font-semibold text-slate-800" title={ad.name}>{ad.name}</p>
              <dl className="mt-2 space-y-1 text-xs text-slate-500">
                <div className="flex justify-between"><dt>Resultado</dt><dd className="font-medium text-slate-700">{fmtInt(ad.conversations)}</dd></div>
                <div className="flex justify-between"><dt>Custo / resultado</dt><dd className="font-medium text-slate-700">{fmtBRL(costPerResult(ad))}</dd></div>
                <div className="flex justify-between"><dt>Investido</dt><dd className="font-medium text-slate-700">{fmtBRL(ad.spend)}</dd></div>
                <div className="flex justify-between"><dt>CTR</dt><dd className="font-medium text-slate-700">{fmtPct(ad.ctr)}</dd></div>
                <div className="flex justify-between"><dt>CPC</dt><dd className="font-medium text-slate-700">{fmtBRL(ad.cpc)}</dd></div>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </Section>
  )
}

/* ---------- Section 6: FB vs IG ---------- */
function PlatCard({ title, row }: { title: string; row?: { reach?: number; impressions?: number; clicks?: number; spend?: number } }) {
  return (
    <Card>
      <p className="mb-2 text-sm font-semibold text-slate-800">{title}</p>
      <dl className="space-y-1 text-xs text-slate-500">
        <div className="flex justify-between"><dt>Alcance</dt><dd className="font-medium text-slate-700">{fmtInt(row?.reach)}</dd></div>
        <div className="flex justify-between"><dt>Impressões</dt><dd className="font-medium text-slate-700">{fmtInt(row?.impressions)}</dd></div>
        <div className="flex justify-between"><dt>Cliques</dt><dd className="font-medium text-slate-700">{fmtInt(row?.clicks)}</dd></div>
        <div className="flex justify-between"><dt>Investido</dt><dd className="font-medium text-slate-700">{fmtBRL(row?.spend)}</dd></div>
      </dl>
    </Card>
  )
}

function PlatformSection({ meta }: { meta: ReportMetaSnapshot }) {
  const rows = meta.platformBreakdown ?? []
  const fb = rows.find((r) => r.platform === 'facebook')
  const ig = rows.find((r) => r.platform === 'instagram')
  const fbSpend = fb?.spend ?? 0
  const igSpend = ig?.spend ?? 0
  const totalSpend = fbSpend + igSpend
  const igSpendPct = totalSpend > 0 ? (igSpend / totalSpend) * 100 : 50

  const fbReach = fb?.reach ?? 0
  const igReach = ig?.reach ?? 0
  const totalReach = fbReach + igReach
  const igReachPct = totalReach > 0 ? Math.round((igReach / totalReach) * 100) : 0
  const fbReachPct = totalReach > 0 ? 100 - igReachPct : 0

  return (
    <Section title="Onde seu público está">
      {rows.length === 0 ? (
        <Card><p className="text-sm text-slate-400">Sem dados de breakdown por plataforma.</p></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <PlatCard title="Facebook" row={fb} />
            <PlatCard title="Instagram" row={ig} />
          </div>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[11px] font-medium text-slate-500">
              <span>Facebook {Math.round(100 - igSpendPct)}%</span>
              <span>Instagram {Math.round(igSpendPct)}%</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
              <div style={{ width: `${100 - igSpendPct}%`, backgroundColor: '#1877F2' }} />
              <div style={{ width: `${igSpendPct}%`, backgroundColor: '#E1306C' }} />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Proporção do investimento entre as plataformas</p>
          </div>
          {totalReach > 0 && (
            <p className="mt-3 text-sm text-slate-600">
              {igReachPct}% do seu público interagiu pelo Instagram e {fbReachPct}% pelo Facebook.
            </p>
          )}
        </>
      )}
    </Section>
  )
}

/* ---------- Page ---------- */
function toValidDate(ts: unknown): Date {
  try {
    const d = ts && typeof (ts as { toDate?: () => Date }).toDate === 'function' ? (ts as { toDate: () => Date }).toDate() : new Date(NaN)
    return Number.isNaN(d.getTime()) ? new Date() : d
  } catch {
    return new Date()
  }
}

export function MonthlyReportPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: reports, loading } = useReports()
  const { data: clients } = useClients()
  const [presenting, setPresenting] = useState(false)
  // Um relatório recém-criado pode levar um instante para aparecer no snapshot
  // — dá uma janela de tolerância antes de mostrar "não encontrado".
  const [graceOver, setGraceOver] = useState(false)

  const report = reports.find((r) => r.id === id)
  const clientName = report ? (clients.find((c) => c.id === report.clientId)?.companyName ?? 'Cliente') : ''

  useEffect(() => {
    const t = setTimeout(() => setGraceOver(true), 2500)
    return () => clearTimeout(t)
  }, [id])

  useEffect(() => {
    if (!presenting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresenting(false)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [presenting])

  if (loading || (!report && !graceOver)) return <FullPageSpinner label="Carregando relatório…" />
  if (!report || report.type !== 'monthly') {
    return (
      <EmptyState
        title="Relatório não encontrado"
        description="Ele pode ter sido excluído, ou o link está incorreto."
        action={<Button onClick={() => navigate('/relatorios')}>Voltar para Relatórios</Button>}
      />
    )
  }

  const periodStart = toValidDate(report.periodStart)
  const periodEnd = toValidDate(report.periodEnd)
  const prev = previousPeriod(periodStart, periodEnd)
  const meta = report.meta

  // DEBUG — por que os dados do Meta Ads não aparecem no painel mensal.
  console.log('[MonthlyReport] relatório carregado:', {
    id: report.id,
    type: report.type,
    clientId: report.clientId,
    temMeta: !!meta,
    accountId: meta?.accountId,
    metricasCurrent: meta?.metrics?.current,
    metricasPrevious: meta?.metrics?.previous,
    qtdCampanhas: meta?.topCampaigns?.length ?? 0,
    qtdAds: meta?.topAds?.length ?? 0,
    qtdPlataformas: meta?.platformBreakdown?.length ?? 0,
    temSerieDiaria: !!meta?.dailySeries?.length,
    meta,
  })
  if (meta && (!meta.metrics?.current || Object.keys(meta.metrics.current).length === 0)) {
    console.warn('[MonthlyReport] meta.metrics.current está vazio — a API do Meta não retornou métricas para o período.')
  }
  if (!meta) {
    console.warn('[MonthlyReport] report.meta ausente — o snapshot não foi salvo na geração do relatório.')
  }

  const body = (
    <div className={`mx-auto flex max-w-6xl flex-col gap-8 ${presenting ? 'p-6 pb-16' : ''}`}>
      {!meta ? (
        <Card><p className="text-sm text-slate-400">Este relatório não tem dados do Meta Ads.</p></Card>
      ) : (
        <>
          <OverviewSection meta={meta} />
          <FunnelSection meta={meta} />
          <EvolutionSection meta={meta} periodStart={periodStart} periodEnd={periodEnd} />
          <CampaignsSection campaigns={meta.topCampaigns} />
          <AdsSection ads={meta.topAds} />
          <PlatformSection meta={meta} />
          <Section title="Resumo do período">
            <div className="rounded-2xl bg-[#F8FAFC] p-6">
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">
                {buildExecutiveSummary(meta, periodStart, periodEnd)}
              </p>
            </div>
          </Section>
        </>
      )}
    </div>
  )

  const header = (
    <div className="flex flex-wrap items-center gap-4 bg-[#0F172A] px-6 py-5 text-white">
      <img src="/favicon.png" alt="Arrow Shot" className="h-9 w-9 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[24px] font-bold leading-tight">{clientName}</p>
        <p className="text-xs text-slate-300">
          {fmtDate(periodStart)} — {fmtDate(periodEnd)}
          <span className="ml-2 text-slate-500">vs {fmtDate(prev.start)} — {fmtDate(prev.end)}</span>
        </p>
      </div>
      {presenting ? (
        <button
          onClick={() => setPresenting(false)}
          className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
        >
          <X size={14} /> Sair da apresentação (ESC)
        </button>
      ) : (
        <button
          onClick={() => setPresenting(true)}
          className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
        >
          <Maximize2 size={14} /> Modo apresentação
        </button>
      )}
    </div>
  )

  if (presenting) {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#F1F5F9]" style={{ zoom: 1.2 }}>
        {header}
        {body}
      </div>
    )
  }

  return (
    <div className="-mx-8 -my-8 flex flex-col bg-[#F1F5F9]">
      <div className="px-8 pt-6">
        <button onClick={() => navigate('/relatorios')} className="mb-4 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={14} /> Relatórios
        </button>
      </div>
      {header}
      <div className="px-4 py-8 sm:px-8">{body}</div>
    </div>
  )
}

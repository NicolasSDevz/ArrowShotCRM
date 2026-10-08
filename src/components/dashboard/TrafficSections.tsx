import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, startOfWeek, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AlertTriangle, Briefcase, CalendarClock, FileBarChart, Megaphone, RefreshCw, Wallet } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { useOptimizationSchedule } from '../../hooks/useOptimizations'
import { subscribeWeeklyReportCheck } from '../../services/weeklyReportCheckService'
import { fetchMetaAgencyOverview, type MetaAgencyOverview } from '../../services/metaAgencyService'
import { getGoogleAdsInsights, type GoogleAdsInsightsSummary } from '../../services/googleAdsApi'
import { hasContractedPaidTraffic, trafficServices } from '../../utils/clientServices'
import { isoWeekKey } from '../../utils/isoWeek'
import { getClientOwnerIds, type Client, type Optimization, type Task, type WeeklyReportCheck } from '../../types'
import { Card, CardTitle } from './DashboardCard'

/** Blocos de tráfego pago do Dashboard: carteira do gestor, desempenho das
 *  campanhas (Meta + Google), otimizações dos últimos 30 dias e saldo das
 *  contas. Gestor vê só os clientes dele; quem não é gestor (Comercial/admin)
 *  vê a equipe inteira. */

const BRL = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const BRL2 = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const INT = (v: number) => Math.round(v).toLocaleString('pt-BR')

/** Saldo abaixo disso fica em destaque (mesmo corte da página Meta Ads). */
const LOW_BALANCE = 50
/** Cliente sem otimização há mais que isso entra na lista de atenção. */
const STALE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

function toDate(v: unknown): Date | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') return (v as { toDate: () => Date }).toDate()
  return null
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export type TrafficSectionId = 'trafego_carteira' | 'trafego_desempenho' | 'trafego_otimizacoes' | 'trafego_saldos'

interface Props {
  clients: Client[]
  tasks: Task[]
  optimizations: Optimization[]
  /** true = gestor de tráfego (só a carteira dele); false = visão da equipe. */
  ownOnly: boolean
  show: (section: TrafficSectionId) => boolean
}

export function TrafficSections({ clients, tasks, optimizations, ownOnly, show }: Props) {
  const { profile } = useAuth()
  const { rows: scheduleRows } = useOptimizationSchedule()

  // Dono do cliente: o calendário de otimizações manda; sem linha lá, cai no
  // ownerIds do cadastro (mesmo critério do widget de Relatórios Semanais).
  const myClients = useMemo(() => {
    const paid = clients.filter((c) => (c.status === 'active' || c.status === 'prospect') && hasContractedPaidTraffic(c))
    if (!ownOnly || !profile) return paid.filter((c) => c.status === 'active')
    return paid.filter((c) => {
      if (c.status === 'prospect' && !optimizations.some((o) => o.clientId === c.id)) return false
      const row = scheduleRows.find((r) => r.clientId === c.id)
      if (row) return row.userId === profile.id
      return getClientOwnerIds(c).includes(profile.id)
    })
  }, [clients, ownOnly, profile, scheduleRows, optimizations])

  const myIds = useMemo(() => new Set(myClients.map((c) => c.id)), [myClients])
  const myOptimizations = useMemo(() => optimizations.filter((o) => myIds.has(o.clientId)), [optimizations, myIds])

  const anyVisible = (['trafego_carteira', 'trafego_desempenho', 'trafego_otimizacoes', 'trafego_saldos'] as const).some(show)
  if (!anyVisible) return null

  return (
    <div className="space-y-4">
      {show('trafego_carteira') && <WalletSummary clients={myClients} tasks={tasks} ownOnly={ownOnly} />}
      {show('trafego_desempenho') && <PerformanceCard clients={myClients} ownOnly={ownOnly} />}
      {(show('trafego_otimizacoes') || show('trafego_saldos')) && (
        <div className={`grid grid-cols-1 gap-4 ${show('trafego_otimizacoes') && show('trafego_saldos') ? 'lg:grid-cols-2' : ''}`}>
          {show('trafego_otimizacoes') && (
            <OptimizationsCard clients={myClients} optimizations={myOptimizations} ownOnly={ownOnly} />
          )}
          {show('trafego_saldos') && <BalancesCard clients={myClients} optimizations={myOptimizations} />}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Minha carteira
// ---------------------------------------------------------------------------

function Stat({ icon, label, value, hint, tone = 'slate' }: { icon: ReactNode; label: string; value: string; hint?: string; tone?: 'slate' | 'red' | 'emerald' }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'emerald' ? 'text-emerald-600' : 'text-slate-900'
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <span aria-hidden="true">{icon}</span>
        {label}
      </div>
      <p className={`mt-1 text-xl font-extrabold ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

function WalletSummary({ clients, tasks, ownOnly }: { clients: Client[]; tasks: Task[]; ownOnly: boolean }) {
  const { profile } = useAuth()
  const { isPrivacyMode } = usePrivacy()
  const [reportCheck, setReportCheck] = useState<WeeklyReportCheck | null>(null)

  useEffect(() => {
    if (!ownOnly || !profile) return
    return subscribeWeeklyReportCheck(profile.id, isoWeekKey(), setReportCheck, () => setReportCheck(null))
  }, [ownOnly, profile])

  const active = clients.filter((c) => c.status === 'active')
  const monthly = active.reduce((s, c) => s + (c.monthlyValue ?? 0), 0)
  let onlyMeta = 0
  let onlyGoogle = 0
  let both = 0
  for (const c of clients) {
    const t = trafficServices(c)
    if (t.both) both++
    else if (t.onlyMeta) onlyMeta++
    else if (t.onlyGoogle) onlyGoogle++
  }

  const ids = new Set(clients.map((c) => c.id))
  const today = startOfToday()
  const overdue = tasks.filter((t) => {
    if (t.status === 'done') return false
    const due = toDate(t.dueDate)
    if (!due || due >= today) return false
    return ownOnly ? t.assignedTo === profile?.id : !!t.clientId && ids.has(t.clientId)
  }).length

  const checks = reportCheck?.checks ?? {}
  const reportTotal = Object.keys(checks).length
  const reportDone = Object.values(checks).filter(Boolean).length

  return (
    <Card>
      <CardTitle
        tip={{
          body: 'Clientes de tráfego pago ativos (e em onboarding que já têm otimização registrada). O dono do cliente é quem está no Calendário de Otimizações; sem linha lá, vale o responsável do cadastro.',
        }}
      >
        {ownOnly ? 'Minha carteira de tráfego' : 'Carteira de tráfego da equipe'}
      </CardTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat icon={<Briefcase size={13} />} label="Clientes" value={String(clients.length)} hint={`${active.length} ativos`} />
        <Stat
          icon={<Wallet size={13} />}
          label="Valor mensal"
          value={isPrivacyMode ? 'R$ •.•••' : BRL(monthly)}
          hint="Soma dos contratos ativos"
        />
        <Stat icon={<Megaphone size={13} />} label="Só Meta" value={String(onlyMeta)} />
        <Stat icon={<Megaphone size={13} />} label="Só Google" value={String(onlyGoogle)} />
        <Stat icon={<Megaphone size={13} />} label="Meta + Google" value={String(both)} />
        <Stat
          icon={<CalendarClock size={13} />}
          label="Tarefas atrasadas"
          value={String(overdue)}
          tone={overdue > 0 ? 'red' : 'emerald'}
          hint={ownOnly ? 'Atribuídas a você' : 'Dos clientes de tráfego'}
        />
      </div>
      {ownOnly && reportTotal > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          <FileBarChart size={13} aria-hidden="true" />
          Relatórios semanais desta semana: <strong className="text-slate-700">{reportDone} de {reportTotal}</strong> enviados
        </p>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Desempenho das campanhas
// ---------------------------------------------------------------------------

type Period = 'last_7d' | 'last_30d'
const PERIOD_DAYS: Record<Period, number> = { last_7d: 7, last_30d: 30 }

interface PerfRow {
  clientId: string
  name: string
  platform: 'Meta' | 'Google'
  spend: number
  results: number
  error: string | null
}

/** Cache em memória do Google (a página Meta já tem cache de 1h no servidor). */
const googleCache = new Map<string, { at: number; data: GoogleAdsInsightsSummary }>()
const GOOGLE_CACHE_MS = 30 * 60 * 1000

async function loadGoogle(customerId: string, from: string, to: string, force: boolean) {
  const key = `${customerId}_${from}_${to}`
  const hit = googleCache.get(key)
  if (!force && hit && Date.now() - hit.at < GOOGLE_CACHE_MS) return hit.data
  const body = await getGoogleAdsInsights(customerId, from, to)
  googleCache.set(key, { at: Date.now(), data: body.summary })
  return body.summary
}

function PerformanceCard({ clients, ownOnly }: { clients: Client[]; ownOnly: boolean }) {
  const navigate = useNavigate()
  const { isPrivacyMode } = usePrivacy()
  const [period, setPeriod] = useState<Period>('last_7d')
  const [reloadKey, setReloadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState<MetaAgencyOverview | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [googleRows, setGoogleRows] = useState<PerfRow[]>([])

  const googleClients = useMemo(
    () => clients.filter((c) => trafficServices(c).google && c.campaignPlanning?.acessos?.googleAdsAccountId),
    [clients]
  )
  const clientIdsKey = clients.map((c) => c.id).join(',')

  useEffect(() => {
    let cancelled = false
    const force = reloadKey > 0
    setLoading(true)
    const yesterday = subDays(new Date(), 1)
    const from = format(subDays(yesterday, PERIOD_DAYS[period] - 1), 'yyyy-MM-dd')
    const to = format(yesterday, 'yyyy-MM-dd')

    const metaP = fetchMetaAgencyOverview({ preset: period, force })
      .then((d) => !cancelled && (setMeta(d), setMetaError(null)))
      .catch((e: Error) => !cancelled && (setMeta(null), setMetaError(e.message)))

    const googleP = Promise.all(
      googleClients.map(async (c): Promise<PerfRow> => {
        const base = { clientId: c.id, name: c.companyName, platform: 'Google' as const }
        try {
          const s = await loadGoogle(c.campaignPlanning!.acessos!.googleAdsAccountId!, from, to, force)
          return { ...base, spend: s.cost, results: s.conversions, error: null }
        } catch (e) {
          return { ...base, spend: 0, results: 0, error: (e as Error).message }
        }
      })
    ).then((rows) => !cancelled && setGoogleRows(rows))

    Promise.allSettled([metaP, googleP]).then(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, reloadKey, clientIdsKey])

  const ids = useMemo(() => new Set(clients.map((c) => c.id)), [clients])
  const metaRows: PerfRow[] = useMemo(
    () =>
      (meta?.rows ?? [])
        .filter((r) => r.metrics && (!ownOnly || ids.has(r.clientId)))
        .map((r) => ({
          clientId: r.clientId,
          name: r.companyName,
          platform: 'Meta' as const,
          spend: r.metrics!.spend,
          results: r.metrics!.conversations,
          error: r.graphError,
        })),
    [meta, ownOnly, ids]
  )
  const rows = [...metaRows, ...googleRows].sort((a, b) => b.spend - a.spend)

  const metaSpend = metaRows.reduce((s, r) => s + r.spend, 0)
  const metaResults = metaRows.reduce((s, r) => s + r.results, 0)
  const googleSpend = googleRows.reduce((s, r) => s + r.spend, 0)
  const googleResults = googleRows.reduce((s, r) => s + r.results, 0)
  const totalSpend = metaSpend + googleSpend
  const totalResults = metaResults + googleResults
  const money = (v: number) => (isPrivacyMode ? 'R$ •.•••' : BRL(v))
  const cpr = (spend: number, results: number) => (results > 0 ? (isPrivacyMode ? 'R$ ••,••' : BRL2(spend / results)) : '—')
  const metaWithoutToken = (meta?.rows ?? []).filter((r) => !r.hasToken && (!ownOnly || ids.has(r.clientId))).length

  return (
    <Card>
      <CardTitle
        tip={{
          body: 'Meta: gasto e conversas iniciadas de cada conta com token configurado. Google: custo e conversões das contas com ID cadastrado no planejamento. Período termina ontem.',
        }}
        action={
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="trafego-periodo">
              Período
            </label>
            <select
              id="trafego-periodo"
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
            >
              <option value="last_7d">Últimos 7 dias</option>
              <option value="last_30d">Últimos 30 dias</option>
            </select>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              aria-label="Atualizar dados das campanhas"
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        }
      >
        Desempenho das campanhas
      </CardTitle>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-live="polite">
        <Stat icon={<Wallet size={13} />} label="Investido (total)" value={loading ? '…' : money(totalSpend)} />
        <Stat icon={<Megaphone size={13} />} label="Resultados" value={loading ? '…' : INT(totalResults)} hint="Conversas (Meta) + conversões (Google)" />
        <Stat icon={<Megaphone size={13} />} label="Meta Ads" value={loading ? '…' : money(metaSpend)} hint={`${INT(metaResults)} conversas · ${cpr(metaSpend, metaResults)} cada`} />
        <Stat icon={<Megaphone size={13} />} label="Google Ads" value={loading ? '…' : money(googleSpend)} hint={`${INT(googleResults)} conversões · ${cpr(googleSpend, googleResults)} cada`} />
      </div>

      {metaError && <p className="mt-3 text-xs text-red-600">Meta Ads: {metaError}</p>}
      {metaWithoutToken > 0 && (
        <p className="mt-2 text-xs text-amber-600">
          {metaWithoutToken} {metaWithoutToken === 1 ? 'cliente Meta está' : 'clientes Meta estão'} sem token — não entram na soma.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <div className="mt-4 max-h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Gasto e resultados por cliente e plataforma</caption>
            <thead className="sticky top-0 bg-white text-xs text-slate-500">
              <tr>
                <th scope="col" className="py-1.5 pr-2 font-medium">Cliente</th>
                <th scope="col" className="py-1.5 pr-2 font-medium">Plataforma</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">Investido</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">Resultados</th>
                <th scope="col" className="py-1.5 text-right font-medium">Custo/resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={`${r.platform}-${r.clientId}`}>
                  <td className="py-1.5 pr-2">
                    <button type="button" onClick={() => navigate(`/clientes/${r.clientId}`)} className="text-left font-medium text-slate-800 hover:underline">
                      {r.name}
                    </button>
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className={`badge ${r.platform === 'Meta' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{r.platform}</span>
                  </td>
                  {r.error ? (
                    <td colSpan={3} className="py-1.5 text-right text-xs text-red-600">
                      Erro ao buscar dados
                    </td>
                  ) : (
                    <>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{money(r.spend)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{INT(r.results)}</td>
                      <td className={`py-1.5 text-right tabular-nums ${r.spend > 0 && r.results === 0 ? 'font-semibold text-red-600' : ''}`}>
                        {r.spend > 0 && r.results === 0 ? 'Sem resultado' : cpr(r.spend, r.results)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && rows.length === 0 && !metaError && (
        <p className="mt-3 text-sm text-slate-400">Nenhuma conta com dados no período.</p>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Otimizações (30 dias)
// ---------------------------------------------------------------------------

function OptimizationsCard({ clients, optimizations, ownOnly }: { clients: Client[]; optimizations: Optimization[]; ownOnly: boolean }) {
  const navigate = useNavigate()
  const today = startOfToday()

  let metaCount = 0
  let googleCount = 0
  const byGestor = new Map<string, number>()
  const lastByClient = new Map<string, Date>()
  for (const o of optimizations) {
    if (o.platforms?.includes('meta')) metaCount++
    if (o.platforms?.includes('google')) googleCount++
    byGestor.set(o.responsavelName || '—', (byGestor.get(o.responsavelName || '—') ?? 0) + 1)
    const d = toDate(o.date)
    if (d && (!lastByClient.get(o.clientId) || d > lastByClient.get(o.clientId)!)) lastByClient.set(o.clientId, d)
  }

  // 4 semanas (seg–dom), da mais antiga pra atual — cabem nos 30 dias carregados.
  const weeks = Array.from({ length: 4 }, (_, i) => {
    const start = startOfWeek(subDays(today, (3 - i) * 7), { weekStartsOn: 1 })
    const end = new Date(start.getTime() + 7 * DAY_MS)
    const count = optimizations.filter((o) => {
      const d = toDate(o.date)
      return d && d >= start && d < end
    }).length
    return { label: i === 3 ? 'Esta semana' : format(start, "dd/MM", { locale: ptBR }), count }
  })
  const maxWeek = Math.max(...weeks.map((w) => w.count), 1)

  const stale = clients
    .filter((c) => c.status === 'active')
    .map((c) => {
      const last = lastByClient.get(c.id) ?? null
      const days = last ? Math.floor((today.getTime() - new Date(last).setHours(0, 0, 0, 0)) / DAY_MS) : null
      return { client: c, days }
    })
    .filter((x) => x.days === null || x.days > STALE_DAYS)
    .sort((a, b) => (b.days ?? 999) - (a.days ?? 999))

  return (
    <Card>
      <CardTitle tip={{ body: `Otimizações registradas nos últimos 30 dias. A lista mostra clientes ativos sem otimização há mais de ${STALE_DAYS} dias.` }}>
        Otimizações — últimos 30 dias
      </CardTitle>
      <div className="grid grid-cols-3 gap-3">
        <Stat icon={<RefreshCw size={13} />} label="Total" value={String(optimizations.length)} />
        <Stat icon={<Megaphone size={13} />} label="Meta" value={String(metaCount)} />
        <Stat icon={<Megaphone size={13} />} label="Google" value={String(googleCount)} />
      </div>

      <p className="mt-4 text-xs font-medium text-slate-500">Por semana</p>
      <ul className="mt-1.5 space-y-1.5">
        {weeks.map((w) => (
          <li key={w.label} className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 text-slate-500">{w.label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${(w.count / maxWeek) * 100}%` }} />
            </div>
            <span className="w-8 text-right font-semibold text-slate-700">{w.count}</span>
          </li>
        ))}
      </ul>

      {!ownOnly && byGestor.size > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Por gestor:{' '}
          {[...byGestor.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, n]) => `${name.split(' ')[0]} ${n}`)
            .join(' · ')}
        </p>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <AlertTriangle size={13} className={stale.length > 0 ? 'text-amber-500' : 'text-slate-400'} aria-hidden="true" />
        Sem otimização há mais de {STALE_DAYS} dias ({stale.length})
      </p>
      {stale.length === 0 ? (
        <p className="mt-1 text-sm text-emerald-600">Todos os clientes otimizados na última semana.</p>
      ) : (
        <ul className="mt-1.5 max-h-44 space-y-1 overflow-auto">
          {stale.map(({ client, days }) => (
            <li key={client.id} className="flex items-center justify-between gap-2 text-sm">
              <button type="button" onClick={() => navigate(`/clientes/${client.id}`)} className="truncate text-left text-slate-800 hover:underline">
                {client.companyName}
              </button>
              <span className={`shrink-0 text-xs font-semibold ${days === null || days > 14 ? 'text-red-600' : 'text-amber-600'}`}>
                {days === null ? 'Nenhuma em 30 dias' : `há ${days} dias`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Saldo das contas
// ---------------------------------------------------------------------------

function BalancesCard({ clients, optimizations }: { clients: Client[]; optimizations: Optimization[] }) {
  const navigate = useNavigate()
  const { isPrivacyMode } = usePrivacy()

  // Último saldo registrado nas otimizações, por cliente e plataforma.
  const rows = useMemo(() => {
    const latest = new Map<string, { value: number; date: Date }>()
    const sorted = [...optimizations].sort((a, b) => (toDate(b.date)?.getTime() ?? 0) - (toDate(a.date)?.getTime() ?? 0))
    for (const o of sorted) {
      const d = toDate(o.date)
      if (!d) continue
      if (typeof o.metaBalance === 'number' && !latest.has(`meta|${o.clientId}`)) latest.set(`meta|${o.clientId}`, { value: o.metaBalance, date: d })
      if (typeof o.googleBalance === 'number' && !latest.has(`google|${o.clientId}`)) latest.set(`google|${o.clientId}`, { value: o.googleBalance, date: d })
    }
    const out: { clientId: string; name: string; platform: 'Meta' | 'Google'; value: number | null; date: Date | null }[] = []
    for (const c of clients) {
      const t = trafficServices(c)
      for (const p of ['meta', 'google'] as const) {
        if (!t[p]) continue
        const hit = latest.get(`${p}|${c.id}`)
        out.push({ clientId: c.id, name: c.companyName, platform: p === 'meta' ? 'Meta' : 'Google', value: hit?.value ?? null, date: hit?.date ?? null })
      }
    }
    // Saldo baixo primeiro, depois sem registro, depois o resto (menor saldo antes).
    const rank = (r: (typeof out)[number]) => (r.value === null ? 1 : r.value < LOW_BALANCE ? 0 : 2)
    return out.sort((a, b) => rank(a) - rank(b) || (a.value ?? 0) - (b.value ?? 0))
  }, [clients, optimizations])

  const low = rows.filter((r) => r.value !== null && r.value < LOW_BALANCE).length
  const missing = rows.filter((r) => r.value === null).length

  return (
    <Card>
      <CardTitle
        tip={{
          body: `Último saldo informado no registro de otimização de cada conta (últimos 30 dias). Abaixo de ${BRL(LOW_BALANCE)} aparece em vermelho.`,
        }}
      >
        Saldo das contas
      </CardTitle>
      <div className="grid grid-cols-2 gap-3">
        <Stat icon={<Wallet size={13} />} label="Saldo baixo" value={String(low)} tone={low > 0 ? 'red' : 'emerald'} />
        <Stat icon={<AlertTriangle size={13} />} label="Sem saldo registrado" value={String(missing)} />
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Nenhuma conta de tráfego na carteira.</p>
      ) : (
        <div className="mt-3 max-h-72 overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Último saldo registrado por conta</caption>
            <thead className="sticky top-0 bg-white text-xs text-slate-500">
              <tr>
                <th scope="col" className="py-1.5 pr-2 font-medium">Cliente</th>
                <th scope="col" className="py-1.5 pr-2 font-medium">Conta</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">Saldo</th>
                <th scope="col" className="py-1.5 text-right font-medium">Registrado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={`${r.platform}-${r.clientId}`}>
                  <td className="py-1.5 pr-2">
                    <button type="button" onClick={() => navigate(`/clientes/${r.clientId}`)} className="text-left text-slate-800 hover:underline">
                      {r.name}
                    </button>
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className={`badge ${r.platform === 'Meta' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{r.platform}</span>
                  </td>
                  <td
                    className={`py-1.5 pr-2 text-right tabular-nums ${
                      r.value === null ? 'text-slate-400' : r.value < LOW_BALANCE ? 'font-semibold text-red-600' : 'text-slate-800'
                    }`}
                  >
                    {r.value === null ? '—' : isPrivacyMode ? 'R$ •••,••' : BRL2(r.value)}
                    {r.value !== null && r.value < LOW_BALANCE && <span className="sr-only"> (saldo baixo)</span>}
                  </td>
                  <td className="py-1.5 text-right text-xs text-slate-400">{r.date ? format(r.date, 'dd/MM') : 'nunca'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

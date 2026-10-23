import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle, FileBarChart, KeyRound, Wallet, MessageCircle, Coins, Users, Eye, MousePointerClick, type LucideIcon } from 'lucide-react'
import { MetaTokenRenewModal } from '../components/clients/MetaTokenRenewModal'
import { useAuth } from '../context/AuthContext'
import { useUsers } from '../hooks/useUsers'
import { useReports } from '../hooks/useReports'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { InfoTip } from '../components/ui/InfoTip'
import { usePrivacy } from '../context/PrivacyContext'
import { tokenValidity } from '../utils/metaTokenValidity'
import { findUserIdByName } from '../utils/userLookup'
import {
  fetchMetaAgencyOverview,
  META_PERIOD_LABEL,
  type MetaAgencyOverview,
  type MetaAgencyRow,
  type MetaPeriodPreset,
} from '../services/metaAgencyService'

const BRL = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const BRL0 = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const INT = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })

const PRESETS: Exclude<MetaPeriodPreset, 'custom'>[] = ['last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month']

/** Explicações do ícone "i" de cada card — mesmo padrão do painel Visão
 *  Geral (ver TIPS em OverviewDashboard.tsx). */
const TIPS = {
  spend: 'Soma do valor gasto em anúncios no período, em todas as contas Meta Ads da agência.',
  conversations: 'Pessoas que iniciaram uma conversa pelo WhatsApp/Messenger/Instagram Direct a partir do anúncio.',
  costPerConversation: 'Total investido dividido pelo número de conversas iniciadas — quanto menor, melhor.',
  reach: 'Pessoas únicas que viram os anúncios no período (não conta a mesma pessoa duas vezes).',
  impressions: 'Quantas vezes os anúncios foram exibidos ao todo — a mesma pessoa pode ver o anúncio mais de uma vez.',
  ctr: 'Percentual de pessoas que clicaram no anúncio em relação a quantas o viram (cliques ÷ impressões). Média ponderada de todas as contas.',
} as const

type AlertKey = 'restricted' | 'expiring' | 'noToken' | 'lowBalance'

function pct(curr: number, prev: number): number | null {
  if (!prev) return null
  return ((curr - prev) / prev) * 100
}

function Delta({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) return null
  const up = value >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-600'}`}>
      <Icon size={13} />
      {up ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      {children}
    </div>
  )
}

/** Cor de destaque de cada cartão (ícone e brilho do canto). */
const ACCENTS = {
  blue: { fg: '#60a5fa', bg: 'rgb(59 130 246 / 0.14)', glow: 'rgb(59 130 246 / 0.16)' },
  green: { fg: '#4cc38a', bg: 'rgb(16 185 129 / 0.14)', glow: 'rgb(16 185 129 / 0.14)' },
  amber: { fg: '#fbbf24', bg: 'rgb(245 158 11 / 0.14)', glow: 'rgb(245 158 11 / 0.13)' },
  violet: { fg: '#a78bfa', bg: 'rgb(139 92 246 / 0.15)', glow: 'rgb(139 92 246 / 0.14)' },
  sky: { fg: '#38bdf8', bg: 'rgb(14 165 233 / 0.14)', glow: 'rgb(14 165 233 / 0.13)' },
  pink: { fg: '#f472b6', bg: 'rgb(236 72 153 / 0.14)', glow: 'rgb(236 72 153 / 0.13)' },
} as const

function MetricCard({
  label,
  value,
  valueColor,
  delta,
  subtitle,
  tip,
  icon: Icon,
  accent = 'blue',
}: {
  label: string
  value: string
  valueColor?: string
  delta?: number | null
  subtitle?: string
  tip?: ReactNode
  icon: LucideIcon
  accent?: keyof typeof ACCENTS
}) {
  const a = ACCENTS[accent]
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta)
  return (
    <div className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full blur-2xl"
        style={{ background: a.glow }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: a.bg, color: a.fg }}>
          <Icon size={18} aria-hidden="true" />
        </span>
        {tip && <InfoTip title={label}>{tip}</InfoTip>}
      </div>
      <p className="relative mt-3 text-[12.5px] font-medium leading-snug text-slate-500">{label}</p>
      <p
        className={`relative mt-0.5 whitespace-nowrap text-[22px] font-bold leading-tight tracking-tight tabular-nums ${valueColor ? '' : 'text-slate-900'}`}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </p>
      <div className="relative mt-auto flex min-h-[18px] items-center gap-1.5 pt-1.5 text-[11.5px] text-slate-400">
        {hasDelta ? (
          <>
            <Delta value={delta ?? null} />
            <span className="truncate">vs. período anterior</span>
          </>
        ) : (
          subtitle && <span className="truncate">{subtitle}</span>
        )}
      </div>
    </div>
  )
}

function SpendChart({ daily }: { daily: { date: string; spend: number }[] }) {
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
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" style={{ height: H }} role="img" aria-label="Investimento diário consolidado">
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

export function MetaAdsPage() {
  const { profile } = useAuth()
  // Colocar/renovar o token direto da tabela (sem ir em Configurações).
  const [tokenFor, setTokenFor] = useState<{ clientId: string; name: string; isNew: boolean } | null>(null)
  const { isPrivacyMode } = usePrivacy()
  const navigate = useNavigate()
  const { data: users } = useUsers()
  const { data: reports } = useReports()

  const [preset, setPreset] = useState<MetaPeriodPreset>('last_7d')
  const [customSince, setCustomSince] = useState('')
  const [customUntil, setCustomUntil] = useState('')
  const [data, setData] = useState<MetaAgencyOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gestor, setGestor] = useState<'all' | 'ciane' | 'nicolas'>('all')
  const [alertFilter, setAlertFilter] = useState<AlertKey | null>(null)

  const cianeId = useMemo(() => findUserIdByName(users, 'Ciane'), [users])
  const nicolasId = useMemo(() => findUserIdByName(users, 'Nicolas'), [users])

  const load = useCallback(
    async (force: boolean) => {
      if (preset === 'custom' && (!customSince || !customUntil)) return
      setLoading(true)
      setError(null)
      try {
        const res = await fetchMetaAgencyOverview({ preset, since: customSince, until: customUntil, force })
        setData(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar dados do Meta Ads')
      } finally {
        setLoading(false)
      }
    },
    [preset, customSince, customUntil]
  )

  useEffect(() => {
    void load(false)
  }, [load])

  const handleRefresh = async () => {
    await load(true)
    if (!error) toast.success('Dados atualizados')
  }

  // ---- filtros da tabela ----
  const rowsForGestor = useMemo(() => {
    if (!data) return []
    if (gestor === 'all') return data.rows
    const id = gestor === 'ciane' ? cianeId : nicolasId
    return id ? data.rows.filter((r) => r.ownerIds.includes(id)) : data.rows
  }, [data, gestor, cianeId, nicolasId])

  const tokenExpiringSoon = (r: MetaAgencyRow) => {
    if (!r.tokenExpiresAt) return false
    const days = (new Date(r.tokenExpiresAt).getTime() - new Date().getTime()) / 86400000
    return days >= 0 && days <= 7
  }
  const lowBalance = (r: MetaAgencyRow) => r.balance != null && r.balance < 50

  const alerts = useMemo(() => {
    const rows = rowsForGestor
    return {
      restricted: rows.filter((r) => r.restricted),
      expiring: rows.filter(tokenExpiringSoon),
      noToken: rows.filter((r) => !r.hasToken),
      lowBalance: rows.filter(lowBalance),
    }
  }, [rowsForGestor])

  const visibleRows = useMemo(() => {
    let rows = rowsForGestor
    if (alertFilter) rows = alerts[alertFilter]
    return [...rows].sort((a, b) => (b.metrics?.spend ?? -1) - (a.metrics?.spend ?? -1))
  }, [rowsForGestor, alertFilter, alerts])

  const openReport = (clientId: string) => {
    const monthly = reports
      .filter((r) => r.clientId === clientId && r.type === 'monthly')
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0]
    navigate(monthly ? `/relatorios/${monthly.id}` : '/relatorios')
  }

  const fetchedAt = data ? new Date(data.fetchedAt) : null
  const hoursAgo = fetchedAt ? (new Date().getTime() - fetchedAt.getTime()) / 3600000 : 0

  const t = data?.totals
  const p = data?.prevTotals
  const cpcColor = t ? (t.costPerConversation < 20 ? '#4cc38a' : t.costPerConversation <= 40 ? '#fbbf24' : '#f28b8b') : undefined
  const ctrColor = t ? (t.ctr > 1 ? '#4cc38a' : t.ctr >= 0.5 ? '#fbbf24' : '#f28b8b') : undefined

  return (
    <div className="flex flex-col gap-4">
      {/* Resumo — status, atualização e período */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] font-semibold text-slate-900">Resumo</p>
          <div className="flex flex-wrap items-center gap-3">
            {fetchedAt && (
              <span className="text-sm text-slate-400">
                Atualizado em {format(fetchedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                {hoursAgo >= 1 && <span className="ml-1 text-amber-600">· dados de {Math.floor(hoursAgo)}h atrás</span>}
              </span>
            )}
            <Button icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />} onClick={handleRefresh} loading={loading}>
              Atualizar
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          {PRESETS.map((pk) => (
            <button
              key={pk}
              onClick={() => setPreset(pk)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                preset === pk ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {META_PERIOD_LABEL[pk]}
            </button>
          ))}
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1">
            <input
              type="date"
              value={customSince}
              onChange={(e) => {
                setCustomSince(e.target.value)
                setPreset('custom')
              }}
              className="bg-transparent text-sm outline-none"
            />
            <span className="text-slate-400">–</span>
            <input
              type="date"
              value={customUntil}
              onChange={(e) => {
                setCustomUntil(e.target.value)
                setPreset('custom')
              }}
              className="bg-transparent text-sm outline-none"
            />
          </div>
        </div>
      </div>

      {error && <EmptyState icon={<AlertTriangle size={26} />} title="Não foi possível carregar" description={error} />}

      {loading && !data && (
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-500">Carregando dados das contas Meta Ads…</p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-500" />
          </div>
        </div>
      )}

      {data && (
        <>
          {/* LINHA 1 — cards consolidados */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
            <MetricCard
              label="Total investido"
              icon={Wallet}
              accent="blue"
              value={isPrivacyMode ? 'R$ •.•••,••' : BRL(t!.spend)}
              delta={pct(t!.spend, p!.spend)}
              tip={TIPS.spend}
            />
            <MetricCard
              label="Conversas iniciadas"
              icon={MessageCircle}
              accent="green"
              value={isPrivacyMode ? '•••' : INT(t!.conversations)}
              delta={pct(t!.conversations, p!.conversations)}
              tip={TIPS.conversations}
            />
            <MetricCard
              label="Custo por conversa"
              icon={Coins}
              accent="amber"
              value={isPrivacyMode ? 'R$ ••,••' : BRL(t!.costPerConversation)}
              valueColor={cpcColor}
              subtitle="Investido ÷ conversas"
              tip={TIPS.costPerConversation}
            />
            <MetricCard
              label="Alcance total"
              icon={Users}
              accent="violet"
              value={isPrivacyMode ? '•••.•••' : INT(t!.reach)}
              delta={pct(t!.reach, p!.reach)}
              tip={TIPS.reach}
            />
            <MetricCard
              label="Impressões totais"
              icon={Eye}
              accent="sky"
              value={isPrivacyMode ? '•••.•••' : INT(t!.impressions)}
              subtitle="Vezes que os anúncios apareceram"
              tip={TIPS.impressions}
            />
            <MetricCard
              label="CTR médio"
              icon={MousePointerClick}
              accent="pink"
              value={isPrivacyMode ? '•,••%' : `${t!.ctr.toFixed(2)}%`}
              valueColor={ctrColor}
              subtitle="Média ponderada"
              tip={TIPS.ctr}
            />
          </div>

          {/* LINHA 2 — gráfico */}
          <Card>
            <p className="mb-3 text-[15px] font-semibold text-slate-900">Investimento diário consolidado</p>
            <SpendChart daily={data.daily} />
          </Card>

          {/* Alertas */}
          {(alerts.restricted.length > 0 ||
            alerts.expiring.length > 0 ||
            alerts.noToken.length > 0 ||
            alerts.lowBalance.length > 0) && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 text-sm font-semibold text-amber-800">⚠️ Atenção necessária</p>
              <div className="flex flex-wrap gap-2">
                {alerts.restricted.length > 0 && (
                  <AlertChip active={alertFilter === 'restricted'} onClick={() => setAlertFilter((f) => (f === 'restricted' ? null : 'restricted'))}>
                    {alerts.restricted.length} conta(s) com restrição de pagamento
                  </AlertChip>
                )}
                {alerts.expiring.length > 0 && (
                  <AlertChip active={alertFilter === 'expiring'} onClick={() => setAlertFilter((f) => (f === 'expiring' ? null : 'expiring'))}>
                    {alerts.expiring.length} token(s) expirando nos próximos 7 dias
                  </AlertChip>
                )}
                {alerts.noToken.length > 0 && (
                  <AlertChip active={alertFilter === 'noToken'} onClick={() => setAlertFilter((f) => (f === 'noToken' ? null : 'noToken'))}>
                    {alerts.noToken.length} cliente(s) sem token configurado
                  </AlertChip>
                )}
                {alerts.lowBalance.length > 0 && (
                  <AlertChip active={alertFilter === 'lowBalance'} onClick={() => setAlertFilter((f) => (f === 'lowBalance' ? null : 'lowBalance'))}>
                    {alerts.lowBalance.length} conta(s) com saldo baixo (menos de R$50)
                  </AlertChip>
                )}
              </div>
            </div>
          )}

          {/* LINHA 3 — tabela */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {(['all', 'ciane', 'nicolas'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGestor(g)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    gestor === g ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {g === 'all' ? 'Todos' : g === 'ciane' ? 'Ciane' : 'Nicolas'}
                </button>
              ))}
            </div>
            {alertFilter && (
              <button onClick={() => setAlertFilter(null)} className="text-xs font-medium text-brand-600 hover:underline">
                Limpar filtro
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5">Cliente</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Investido</th>
                    <th className="px-3 py-2.5 text-right">Conversas</th>
                    <th className="px-3 py-2.5 text-right">CPL</th>
                    <th className="px-3 py-2.5 text-right">Alcance</th>
                    <th className="px-3 py-2.5 text-right">CTR</th>
                    <th className="px-3 py-2.5 text-right">Saldo</th>
                    <th className="px-3 py-2.5">Token</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-6 text-center text-slate-400">
                        Nenhum cliente com Meta Ads {gestor !== 'all' ? 'para este gestor' : ''}
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((r) => {
                      const tv = tokenValidity({ hasToken: r.hasToken, expiresAt: r.tokenExpiresAt })
                      const rowBg = r.restricted
                        ? 'bg-red-50'
                        : !r.hasToken
                          ? 'bg-slate-50'
                          : tokenExpiringSoon(r)
                            ? 'bg-amber-50'
                            : ''
                      const status = !r.hasToken
                        ? '⚪ Sem token'
                        : r.restricted
                          ? '🔴 Restrito'
                          : '🟢 Ativo'
                      return (
                        <tr key={r.clientId} className={`border-b border-slate-50 text-slate-700 last:border-0 ${rowBg}`}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <Avatar name={isPrivacyMode ? 'Cliente' : r.companyName} photoURL={isPrivacyMode ? undefined : r.logoUrl ?? undefined} size="xs" />
                              <span className="truncate font-medium text-slate-900">{isPrivacyMode ? '••••••' : r.companyName}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">{status}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{r.metrics ? (isPrivacyMode ? 'R$ •.•••,••' : BRL(r.metrics.spend)) : '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{r.metrics ? (isPrivacyMode ? '•••' : INT(r.metrics.conversations)) : '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {r.metrics && r.metrics.conversations > 0 ? (isPrivacyMode ? 'R$ ••,••' : BRL(r.metrics.costPerConversation)) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{r.metrics ? (isPrivacyMode ? '•••.•••' : INT(r.metrics.reach)) : '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {r.metrics ? (isPrivacyMode ? '•,••%' : `${r.metrics.ctr.toFixed(2)}%`) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {r.balance != null ? (isPrivacyMode ? 'R$ •.•••,••' : BRL(r.balance)) : '—'}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                            <div className="flex items-center gap-2">
                              {r.hasToken && <span>{tv.label.replace(/ —.*/, '')}</span>}
                              {(!r.hasToken || tokenExpiringSoon(r) || tv.level === 'red') && (
                                <Button
                                  size="sm"
                                  variant={r.hasToken ? 'secondary' : 'primary'}
                                  icon={<KeyRound size={12} />}
                                  onClick={() => setTokenFor({ clientId: r.clientId, name: r.companyName, isNew: !r.hasToken })}
                                  aria-label={`${r.companyName}: ${r.hasToken ? 'renovar o token' : 'colocar o token do Meta Ads'}`}
                                >
                                  {r.hasToken ? 'Renovar' : 'Colocar token'}
                                </Button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Button variant="ghost" size="sm" icon={<FileBarChart size={13} />} onClick={() => openReport(r.clientId)}>
                              Ver relatório
                            </Button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {tokenFor && (
            <MetaTokenRenewModal
              open
              onClose={() => setTokenFor(null)}
              clientId={tokenFor.clientId}
              clientName={tokenFor.name}
              isNew={tokenFor.isNew}
              onDone={() => void load(true)}
            />
          )}

          {profile?.role !== 'admin' && (
            <p className="text-xs text-slate-400">Você vê apenas os clientes dos quais é responsável.</p>
          )}
        </>
      )}
    </div>
  )
}

function AlertChip({ children, active, onClick }: { children: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-amber-500 bg-amber-500 text-white'
          : 'border-amber-300 bg-white text-amber-700 hover:bg-amber-100'
      }`}
    >
      {children}
    </button>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ExternalLink, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { openErrorDialog, toFriendlyError } from '../utils/notifyError'
import { useClients } from '../hooks/useClients'
import { useUsers } from '../hooks/useUsers'
import { useAuth } from '../context/AuthContext'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { EmptyState } from '../components/ui/EmptyState'
import { InfoTip } from '../components/ui/InfoTip'
import { usePrivacy } from '../context/PrivacyContext'
import { updateClient } from '../services/clientService'
import { getGoogleAdsInsights, type GoogleAdsInsightsSummary } from '../services/googleAdsApi'
import { maskGoogleAdsId } from '../utils/masks'
import { findUserIdByName } from '../utils/userLookup'
import { EMPTY_CAMPAIGN_PLANNING, EMPTY_CAMPAIGN_PLANNING_ACCESS } from '../types/campaignPlanning'
import { getClientOwnerIds, type Client } from '../types/client'

type PeriodPreset = 'last_7d' | 'last_14d' | 'last_30d' | 'this_month' | 'last_month' | 'custom'

const PERIOD_LABEL: Record<Exclude<PeriodPreset, 'custom'>, string> = {
  last_7d: 'Últimos 7 dias',
  last_14d: 'Últimos 14 dias',
  last_30d: 'Últimos 30 dias',
  this_month: 'Este mês',
  last_month: 'Mês passado',
}
const PRESETS: Exclude<PeriodPreset, 'custom'>[] = ['last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month']

const BRL = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const INT = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })

/** Explicações do ícone "i" de cada card — mesmo padrão do painel Visão
 *  Geral (ver TIPS em OverviewDashboard.tsx). */
const TIPS = {
  cost: 'Soma do custo de todas as campanhas ativas de todos os clientes, no período de 30 dias exibido.',
  conversions: 'Ações completadas atribuídas aos anúncios (leads, ligações, compras…), conforme as conversões configuradas em cada conta do Google Ads.',
  cpc: 'Custo total dividido pelo total de cliques no período — quanto menor, melhor.',
  ctr: 'Percentual de pessoas que clicaram no anúncio em relação a quantas o viram (cliques ÷ impressões). Acima de 3% é considerado bom para Rede de Pesquisa.',
} as const

type ClientResult =
  | { status: 'loading' }
  | { status: 'ok'; summary: GoogleAdsInsightsSummary }
  | { status: 'error'; message: string }

function periodRange(preset: PeriodPreset, customSince: string, customUntil: string) {
  if (preset === 'custom' && customSince && customUntil) return { dateFrom: customSince, dateTo: customUntil }
  const yesterday = subDays(new Date(), 1)
  switch (preset) {
    case 'last_14d':
      return { dateFrom: format(subDays(yesterday, 13), 'yyyy-MM-dd'), dateTo: format(yesterday, 'yyyy-MM-dd') }
    case 'last_30d':
      return { dateFrom: format(subDays(yesterday, 29), 'yyyy-MM-dd'), dateTo: format(yesterday, 'yyyy-MM-dd') }
    case 'this_month':
      return { dateFrom: format(startOfMonth(new Date()), 'yyyy-MM-dd'), dateTo: format(yesterday, 'yyyy-MM-dd') }
    case 'last_month': {
      const lastMonth = subMonths(new Date(), 1)
      return { dateFrom: format(startOfMonth(lastMonth), 'yyyy-MM-dd'), dateTo: format(endOfMonth(lastMonth), 'yyyy-MM-dd') }
    }
    case 'last_7d':
    default:
      return { dateFrom: format(subDays(yesterday, 6), 'yyyy-MM-dd'), dateTo: format(yesterday, 'yyyy-MM-dd') }
  }
}

function AccountIdCell({ client }: { client: Client }) {
  const { profile } = useAuth()
  const currentId = client.campaignPlanning?.acessos?.googleAdsAccountId ?? ''
  const [value, setValue] = useState(maskGoogleAdsId(currentId))
  const [editing, setEditing] = useState(currentId === '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const digits = value.replace(/\D/g, '')
    if (!profile || digits === currentId) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      const planning = client.campaignPlanning ?? EMPTY_CAMPAIGN_PLANNING
      const acessos = { ...(planning.acessos ?? EMPTY_CAMPAIGN_PLANNING_ACCESS), googleAdsAccountId: digits || undefined }
      await updateClient(client.id, { campaignPlanning: { ...planning, acessos } }, profile.id, profile.name)
      toast.success('ID da conta Google Ads salvo')
      setEditing(false)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar o ID da conta')
    } finally {
      setSaving(false)
    }
  }

  if (!editing && currentId) {
    return (
      <div className="flex items-center gap-2">
        <a href="https://ads.google.com" target="_blank" rel="noopener noreferrer" title="Abrir no Google Ads" className="text-brand-600 hover:underline">
          {maskGoogleAdsId(currentId)}
        </a>
        <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-slate-600">
          editar
        </button>
      </div>
    )
  }

  return (
    <Input
      value={value}
      onChange={(e) => setValue(maskGoogleAdsId(e.target.value))}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder="000-000-0000"
      disabled={saving}
      className="w-36 text-xs"
    />
  )
}

export function GoogleAdsPage() {
  const { isPrivacyMode } = usePrivacy()
  const { data: clients } = useClients()
  const { data: users } = useUsers()
  const googleAdsClients = useMemo(
    () => clients.filter((c) => !!c.modules?.googleAds && c.status !== 'churned'),
    [clients]
  )
  const clientsWithAccount = useMemo(
    () => googleAdsClients.filter((c) => !!c.campaignPlanning?.acessos?.googleAdsAccountId),
    [googleAdsClients]
  )

  const [results, setResults] = useState<Record<string, ClientResult>>({})
  const [loading, setLoading] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
  const [preset, setPreset] = useState<PeriodPreset>('last_30d')
  const [customSince, setCustomSince] = useState('')
  const [customUntil, setCustomUntil] = useState('')
  const [gestor, setGestor] = useState<'all' | 'ciane' | 'nicolas'>('all')

  const cianeId = useMemo(() => findUserIdByName(users, 'Ciane'), [users])
  const nicolasId = useMemo(() => findUserIdByName(users, 'Nicolas'), [users])

  const visibleClients = useMemo(() => {
    if (gestor === 'all') return googleAdsClients
    const id = gestor === 'ciane' ? cianeId : nicolasId
    return id ? googleAdsClients.filter((c) => getClientOwnerIds(c).includes(id)) : googleAdsClients
  }, [googleAdsClients, gestor, cianeId, nicolasId])

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (clientsWithAccount.length === 0) return
      if (preset === 'custom' && (!customSince || !customUntil)) return
      setLoading(true)
      const { dateFrom, dateTo } = periodRange(preset, customSince, customUntil)
      setResults((prev) => {
        const next = { ...prev }
        for (const c of clientsWithAccount) next[c.id] = { status: 'loading' }
        return next
      })

      await Promise.all(
        clientsWithAccount.map(async (c) => {
          const customerId = c.campaignPlanning!.acessos!.googleAdsAccountId!
          try {
            const body = await getGoogleAdsInsights(customerId, dateFrom, dateTo)
            setResults((prev) => ({ ...prev, [c.id]: { status: 'ok', summary: body.summary } }))
          } catch (err) {
            setResults((prev) => ({
              ...prev,
              [c.id]: { status: 'error', message: err instanceof Error ? err.message : 'Erro ao buscar dados' },
            }))
          }
        })
      )

      setLoading(false)
      setFetchedAt(new Date())
      if (!opts?.silent) toast.success('Dados atualizados')
    },
    [clientsWithAccount, preset, customSince, customUntil]
  )

  useEffect(() => {
    void load({ silent: true })
  }, [load])

  const successResults = Object.values(results).filter((r): r is Extract<ClientResult, { status: 'ok' }> => r.status === 'ok')
  const hasAnyData = successResults.length > 0
  const anyError = Object.values(results).some((r) => r.status === 'error')

  const totals = useMemo(() => {
    if (successResults.length === 0) return null
    const cost = successResults.reduce((s, r) => s + r.summary.cost, 0)
    const conversions = successResults.reduce((s, r) => s + r.summary.conversions, 0)
    const clicks = successResults.reduce((s, r) => s + r.summary.clicks, 0)
    const impressions = successResults.reduce((s, r) => s + r.summary.impressions, 0)
    return {
      cost,
      conversions,
      cpc: clicks > 0 ? cost / clicks : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    }
  }, [successResults])

  const noAccountsConfigured = googleAdsClients.length > 0 && clientsWithAccount.length === 0
  const ctrColor = totals ? (totals.ctr > 3 ? '#059669' : totals.ctr >= 1 ? '#D97706' : '#DC2626') : undefined

  return (
    <div className="flex flex-col gap-4">
      {/* Resumo — status, atualização e período */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] font-semibold text-slate-900">Resumo</p>
          <div className="flex flex-wrap items-center gap-3">
            {fetchedAt && (
              <span className="text-sm text-slate-400">Atualizado em {format(fetchedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
            )}
            {!hasAnyData && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                {noAccountsConfigured ? '⏳ Nenhuma conta configurada' : anyError ? '⚠️ Erro na integração' : '⏳ API em aprovação'}
              </span>
            )}
            <Button
              icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
              onClick={() => load()}
              loading={loading}
              disabled={clientsWithAccount.length === 0}
            >
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
              {PERIOD_LABEL[pk]}
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

      {/* Seção 1 — cards consolidados */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Investido', value: totals ? (isPrivacyMode ? 'R$ •.•••,••' : BRL(totals.cost)) : '--', tip: TIPS.cost },
          { label: 'Total de Conversões', value: totals ? (isPrivacyMode ? '•••' : INT(totals.conversions)) : '--', tip: TIPS.conversions },
          { label: 'CPC Médio', value: totals ? (isPrivacyMode ? 'R$ •,••' : BRL(totals.cpc)) : '--', tip: TIPS.cpc },
          { label: 'CTR Médio', value: totals ? (isPrivacyMode ? '•,••%' : `${totals.ctr.toFixed(2)}%`) : '--', tip: TIPS.ctr, color: ctrColor },
        ].map((card) => (
          <div key={card.label} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-slate-500">{card.label}</p>
              <InfoTip title={card.label}>{card.tip}</InfoTip>
            </div>
            <p
              className={`mt-1 text-[24px] font-extrabold leading-tight ${!totals ? 'text-slate-400' : !card.color ? 'text-slate-900' : ''}`}
              style={totals && card.color ? { color: card.color } : undefined}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Seção 2 — filtro por gestor + tabela de clientes */}
      {googleAdsClients.length > 0 && (
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
      )}

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2.5">Cliente</th>
                <th className="px-3 py-2.5">ID da conta Google Ads</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Investido</th>
                <th className="px-3 py-2.5 text-right">Conversões</th>
                <th className="px-3 py-2.5 text-right">CPC</th>
                <th className="px-3 py-2.5 text-right">CTR</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visibleClients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                    {googleAdsClients.length === 0 ? 'Nenhum cliente com Google Ads contratado' : 'Nenhum cliente com Google Ads para este gestor'}
                  </td>
                </tr>
              ) : (
                visibleClients.map((client) => {
                  const result = results[client.id]
                  const hasAccount = !!client.campaignPlanning?.acessos?.googleAdsAccountId
                  const status = !hasAccount
                    ? '⚪ Sem conta configurada'
                    : result?.status === 'ok'
                      ? '🟢 Ativo'
                      : result?.status === 'error'
                        ? '🔴 Erro'
                        : result?.status === 'loading'
                          ? '⏳ Carregando...'
                          : '⚪ —'
                  return (
                    <tr key={client.id} className="border-b border-slate-50 text-slate-700 last:border-0">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar name={isPrivacyMode ? 'Cliente' : client.companyName} photoURL={isPrivacyMode ? null : client.logoUrl} size="xs" />
                          <span className="truncate font-medium text-slate-900">{isPrivacyMode ? '••••••' : client.companyName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <AccountIdCell client={client} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                        {result?.status === 'error' ? (
                          <button
                            type="button"
                            onClick={() => openErrorDialog(toFriendlyError(new Error(result.message), 'Não foi possível buscar os dados do Google Ads desse cliente.'))}
                            className="font-medium text-red-600 underline decoration-dotted underline-offset-2 hover:text-red-700"
                          >
                            🔴 Erro — ver o motivo
                          </button>
                        ) : (
                          status
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{result?.status === 'ok' ? (isPrivacyMode ? 'R$ •.•••,••' : BRL(result.summary.cost)) : '--'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{result?.status === 'ok' ? (isPrivacyMode ? '•••' : INT(result.summary.conversions)) : '--'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{result?.status === 'ok' ? (isPrivacyMode ? 'R$ •,••' : BRL(result.summary.average_cpc)) : '--'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{result?.status === 'ok' ? (isPrivacyMode ? '•,••%' : `${result.summary.ctr.toFixed(2)}%`) : '--'}</td>
                      <td className="px-3 py-2.5 text-right">
                        <a
                          href="https://ads.google.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                        >
                          Abrir no Google Ads <ExternalLink size={12} />
                        </a>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {googleAdsClients.length === 0 && (
        <EmptyState
          title="Nenhum cliente com Google Ads contratado"
          description='Marque "Google Ads" em Serviços contratados, na edição do cliente, para que ele apareça aqui.'
        />
      )}

      {/* Seção 3 — aviso de integração */}
      {!hasAnyData && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">⏳ Integração com Google Ads API em andamento</p>
          <p className="mt-1 text-sm text-amber-700">
            {noAccountsConfigured
              ? 'Preencha o "ID da conta Google Ads" de cada cliente na tabela acima para começar a carregar os dados.'
              : 'O acesso à API foi solicitado ao Google e está em revisão. Assim que aprovado, todos os dados serão carregados automaticamente. Você será notificado quando a integração estiver ativa.'}
          </p>
        </div>
      )}
    </div>
  )
}

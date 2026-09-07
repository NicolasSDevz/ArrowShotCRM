import { format, subDays, differenceInCalendarDays } from 'date-fns'
import { getMetaCampaigns, getMetaInsightsRange, getMetaAccountInfo } from '../services/metaApi'
import type {
  ReportActionSummary,
  ReportDailyPoint,
  ReportEntitySummary,
  ReportMetaSnapshot,
  ReportMetricSet,
  ReportPlatformBreakdownRow,
} from '../types'

/** "act_123456789" ou "123456789" — a API sempre espera o id sem prefixo
 *  (as Vercel Functions montam "act_" + account_id sozinhas). */
export function normalizeMetaAccountId(raw: string): string {
  return raw.trim().replace(/^act_/i, '')
}

/** Garante o prefixo "act_" para ARMAZENAR/EXIBIR o id da conta Meta Ads.
 *  Retorna '' se a entrada for vazia. */
export function ensureActPrefix(raw?: string | null): string {
  const v = (raw ?? '').trim()
  if (!v) return ''
  return /^act_/i.test(v) ? v.replace(/^act_/i, 'act_') : `act_${v}`
}

function toDateParam(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** Período imediatamente anterior, com a mesma duração — base da variação
 *  % mostrada no PDF mensal. */
export function previousPeriod(start: Date, end: Date): { start: Date; end: Date } {
  const days = differenceInCalendarDays(end, start) + 1
  const prevEnd = subDays(start, 1)
  const prevStart = subDays(prevEnd, days - 1)
  return { start: prevStart, end: prevEnd }
}

export function percentChange(curr?: number, prev?: number): number | undefined {
  if (curr == null || prev == null || prev === 0) return undefined
  return ((curr - prev) / prev) * 100
}

const CONVERSATION_ACTION_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
  'messaging_conversation_started_7d',
]
const LINK_CLICK_ACTION_TYPES = ['link_click']

const ACTION_TYPE_LABEL: Record<string, string> = {
  link_click: 'Cliques no link',
  landing_page_view: 'Visualizações da página de destino',
  lead: 'Cadastros (leads)',
  purchase: 'Compras',
  'onsite_conversion.messaging_conversation_started_7d': 'Conversas iniciadas',
  'onsite_conversion.messaging_first_reply': 'Conversas iniciadas',
  messaging_conversation_started_7d: 'Conversas iniciadas',
  post_engagement: 'Engajamento com a publicação',
  page_engagement: 'Engajamento com a página',
  video_view: 'Visualizações de vídeo',
}

interface RawAction {
  action_type: string
  value: string
}

interface RawInsightsRow {
  spend?: string
  impressions?: string
  clicks?: string
  reach?: string
  ctr?: string
  cpc?: string
  cpm?: string
  actions?: RawAction[]
  campaign_id?: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
  ad_id?: string
  ad_name?: string
  publisher_platform?: string
  /** "yyyy-MM-dd" — presente quando a chamada usa time_increment=1. */
  date_start?: string
}

function num(v?: string): number | undefined {
  if (v == null) return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}

function findAction(actions: RawAction[] | undefined, types: string[]): number | undefined {
  if (!actions) return undefined
  const hit = actions.find((a) => types.includes(a.action_type))
  return hit ? num(hit.value) : undefined
}

function parseMetricSet(row?: RawInsightsRow): ReportMetricSet {
  if (!row) return {}
  return {
    spend: num(row.spend),
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    reach: num(row.reach),
    ctr: num(row.ctr),
    cpc: num(row.cpc),
    cpm: num(row.cpm),
    conversations: findAction(row.actions, CONVERSATION_ACTION_TYPES),
    linkClicks: findAction(row.actions, LINK_CLICK_ACTION_TYPES),
  }
}

function sumActions(rows: RawInsightsRow[]): ReportActionSummary[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    for (const action of row.actions ?? []) {
      const v = num(action.value) ?? 0
      totals.set(action.action_type, (totals.get(action.action_type) ?? 0) + v)
    }
  }
  return Array.from(totals.entries())
    .map(([type, value]) => ({ type, label: ACTION_TYPE_LABEL[type] ?? type, value }))
    .sort((a, b) => b.value - a.value)
}

function toEntitySummary(row: RawInsightsRow, idKey: 'campaign_id' | 'adset_id' | 'ad_id', nameKey: 'campaign_name' | 'adset_name' | 'ad_name'): ReportEntitySummary {
  return {
    id: row[idKey] ?? '',
    name: row[nameKey] ?? '—',
    spend: num(row.spend),
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    ctr: num(row.ctr),
    cpc: num(row.cpc),
    reach: num(row.reach),
    conversations: findAction(row.actions, CONVERSATION_ACTION_TYPES),
  }
}

function toDailyPoint(row: RawInsightsRow): ReportDailyPoint {
  return {
    date: row.date_start ?? '',
    spend: num(row.spend),
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    reach: num(row.reach),
    conversations: findAction(row.actions, CONVERSATION_ACTION_TYPES),
  }
}

function topN(rows: ReportEntitySummary[], n: number): ReportEntitySummary[] {
  return [...rows].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0)).slice(0, n)
}

/** Busca tudo que o relatório precisa da API do Meta Ads e já devolve no
 *  formato pronto para salvar no Firestore (ReportMetaSnapshot). Chamadas
 *  independentes via Promise.allSettled — uma falhar (ex: sem permissão
 *  para ler o saldo da conta) não derruba o relatório inteiro. */
export async function fetchMetaReportSnapshot(
  accountIdRaw: string,
  start: Date,
  end: Date,
  clientId?: string
): Promise<ReportMetaSnapshot> {
  const accountId = normalizeMetaAccountId(accountIdRaw)
  const timeRange = { since: toDateParam(start), until: toDateParam(end) }
  const prev = previousPeriod(start, end)
  const prevTimeRange = { since: toDateParam(prev.start), until: toDateParam(prev.end) }

  const accountFields = 'impressions,clicks,spend,cpc,ctr,cpm,reach,actions'
  const campaignFields = 'campaign_id,campaign_name,impressions,clicks,spend,ctr,cpc,reach,actions'
  const adsetFields = 'adset_id,adset_name,impressions,clicks,spend,ctr'
  const adFields = 'ad_id,ad_name,impressions,clicks,spend,ctr,cpc,reach,actions'
  const platformFields = 'impressions,clicks,spend,reach,publisher_platform'
  const dailyFields = 'spend,impressions,clicks,reach,actions'

  console.log('[metaReport] buscando snapshot:', { accountIdRaw, accountId, timeRange, prevTimeRange })

  const [current, previous, campaignsList, campaignLevel, adsetLevel, adLevel, platformLevel, account, daily] =
    await Promise.allSettled([
      getMetaInsightsRange(accountId, { timeRange, fields: accountFields, clientId }),
      getMetaInsightsRange(accountId, { timeRange: prevTimeRange, fields: accountFields, clientId }),
      getMetaCampaigns(accountId, clientId),
      getMetaInsightsRange(accountId, { timeRange, fields: campaignFields, level: 'campaign', limit: 50, clientId }),
      getMetaInsightsRange(accountId, { timeRange, fields: adsetFields, level: 'adset', limit: 50, clientId }),
      getMetaInsightsRange(accountId, { timeRange, fields: adFields, level: 'ad', limit: 50, clientId }),
      getMetaInsightsRange(accountId, { timeRange, fields: platformFields, breakdowns: 'publisher_platform', clientId }),
      getMetaAccountInfo(accountId, clientId),
      getMetaInsightsRange(accountId, { timeRange, fields: dailyFields, timeIncrement: 1, limit: 400, clientId }),
    ])

  // DEBUG — mostra o resultado de cada chamada à API do Meta.
  const settledLabels = ['current', 'previous', 'campaignsList', 'campaignLevel', 'adsetLevel', 'adLevel', 'platformLevel', 'account', 'daily']
  for (const [i, r] of [current, previous, campaignsList, campaignLevel, adsetLevel, adLevel, platformLevel, account, daily].entries()) {
    if (r.status === 'rejected') {
      console.error(`[metaReport] ${settledLabels[i]} FALHOU:`, r.reason instanceof Error ? r.reason.message : r.reason)
    } else {
      const rows = Array.isArray(r.value?.data) ? r.value.data.length : undefined
      console.log(`[metaReport] ${settledLabels[i]} OK — linhas: ${rows ?? '(sem data[])'}`, r.value)
    }
  }

  const currentRow: RawInsightsRow | undefined = current.status === 'fulfilled' ? current.value?.data?.[0] : undefined
  const previousRow: RawInsightsRow | undefined = previous.status === 'fulfilled' ? previous.value?.data?.[0] : undefined
  const campaignRows: RawInsightsRow[] = campaignLevel.status === 'fulfilled' ? (campaignLevel.value?.data ?? []) : []
  const adsetRows: RawInsightsRow[] = adsetLevel.status === 'fulfilled' ? (adsetLevel.value?.data ?? []) : []
  const adRows: RawInsightsRow[] = adLevel.status === 'fulfilled' ? (adLevel.value?.data ?? []) : []
  const platformRows: RawInsightsRow[] = platformLevel.status === 'fulfilled' ? (platformLevel.value?.data ?? []) : []
  const dailyRows: RawInsightsRow[] = daily.status === 'fulfilled' ? (daily.value?.data ?? []) : []

  // campaigns.js só traz status/objetivo (não métricas) — cruza pelo id com
  // as linhas de insights por campanha para completar o "em destaque".
  const campaignMetaById = new Map<string, { status?: string; objective?: string }>()
  if (campaignsList.status === 'fulfilled') {
    for (const c of campaignsList.value?.data ?? []) {
      campaignMetaById.set(c.id, { status: c.status, objective: c.objective })
    }
  }
  const topCampaigns = topN(
    campaignRows.map((row) => ({
      ...toEntitySummary(row, 'campaign_id', 'campaign_name'),
      ...campaignMetaById.get(row.campaign_id ?? ''),
    })),
    5
  )
  const topAdSets = topN(adsetRows.map((row) => toEntitySummary(row, 'adset_id', 'adset_name')), 5)
  const topAds = topN(adRows.map((row) => toEntitySummary(row, 'ad_id', 'ad_name')), 5)

  const platformBreakdown: ReportPlatformBreakdownRow[] = platformRows.map((row) => ({
    platform: row.publisher_platform ?? 'other',
    reach: num(row.reach),
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    spend: num(row.spend),
  }))

  const actionsSummary = sumActions(currentRow ? [currentRow] : [])

  const dailySeries: ReportDailyPoint[] = dailyRows
    .map(toDailyPoint)
    .filter((p) => p.date)
    .sort((a, b) => a.date.localeCompare(b.date))

  // balance/amount_spent vêm em centavos da menor unidade da moeda.
  const accountData = account.status === 'fulfilled' ? account.value : undefined
  const balance = accountData?.balance != null ? Number(accountData.balance) / 100 : undefined

  const snapshot: ReportMetaSnapshot = {
    accountId,
    metrics: { current: parseMetricSet(currentRow), previous: previousRow ? parseMetricSet(previousRow) : undefined },
    balance,
    currency: accountData?.currency,
    topCampaigns,
    topAdSets,
    topAds,
    platformBreakdown,
    actionsSummary,
    dailySeries: dailySeries.length > 0 ? dailySeries : undefined,
  }
  console.log('[metaReport] snapshot final:', snapshot)
  return snapshot
}

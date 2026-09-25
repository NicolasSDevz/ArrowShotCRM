// Google Ads via REST (sem SDK oficial), compartilhado pelas Vercel Functions:
// /api/google/insights (páginas do CRM) e /api/ai/chat (ferramentas do
// Archer). Troca o refresh token da agência por um access token (OAuth2) e
// chama googleAds:search com uma GAQL fixa. Credenciais no Vercel:
// GOOGLE_ADS_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN/DEVELOPER_TOKEN (e
// GOOGLE_ADS_LOGIN_CUSTOMER_ID pra contas por baixo da MCC).

const GOOGLE_ADS_API_VERSION = 'v25'
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const VALID_LEVELS = new Set(['campaign', 'keywords', 'search_terms'])
// fetch() nativo não tem timeout — sem isso, uma resposta lenta/sem retorno
// do OAuth do Google ou do googleAds:search prende a function até o limite
// de execução do Vercel (o chamador então só vê a requisição travada, sem
// erro nenhum). 20s falha rápido em vez disso.
const FETCH_TIMEOUT_MS = 20_000

function num(v) {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function hasGoogleAdsCredentials() {
  return !!(
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  )
}

export async function getAccessToken() {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw Object.assign(
      new Error(data?.error_description || data?.error || 'Falha ao gerar access token do Google Ads'),
      { httpStatus: 502 }
    )
  }
  return data.access_token
}

/** `limit` = quantas linhas (as de maior custo primeiro) nos níveis de
 *  palavra-chave/termo. `detailed` = campos extras que só o Archer usa
 *  (índice de qualidade, status do termo) — fora do formato das páginas. */
export function buildQuery(dateFrom, dateTo, level, { limit = 30, detailed = false } = {}) {
  if (level === 'keywords') {
    // Sem segments.date no SELECT: a API já soma os metrics por palavra-chave
    // no período do WHERE (não precisa agregar na mão como em `campaign`,
    // que soma por dia por causa de segments.date estar selecionado ali).
    return `SELECT
      campaign.name,
      ad_group.name,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,${detailed ? '\n      ad_group_criterion.status,\n      ad_group_criterion.quality_info.quality_score,' : ''}
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.cost_per_conversion
    FROM keyword_view
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    AND ad_group_criterion.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT ${limit}`
  }

  if (level === 'search_terms') {
    return `SELECT
      search_term_view.search_term,${detailed ? '\n      search_term_view.status,' : ''}
      segments.search_term_match_type,
      campaign.name,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.cost_per_conversion
    FROM search_term_view
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    ORDER BY metrics.cost_micros DESC
    LIMIT ${limit}`
  }

  return `SELECT
    campaign.name,
    campaign.status,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.ctr,
    metrics.average_cpc,
    metrics.conversions,
    metrics.cost_per_conversion,
    segments.date
  FROM campaign
  WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
  AND campaign.status != 'REMOVED'
  ORDER BY metrics.cost_micros DESC`
}

function rowMetrics(row) {
  const impressions = num(row.metrics?.impressions)
  const clicks = num(row.metrics?.clicks)
  const costMicros = num(row.metrics?.costMicros)
  const conversions = num(row.metrics?.conversions)
  return {
    impressoes: impressions,
    cliques: clicks,
    custo: costMicros / 1_000_000,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    conversoes: conversions,
    custoPorConversao: conversions > 0 ? costMicros / conversions / 1_000_000 : 0,
  }
}

/** keyword_view e search_term_view não têm segments.date no SELECT (ver
 *  buildQuery), então cada linha já é o total do período pra aquela
 *  palavra-chave/termo — só recalcula CTR e custo/conversão a partir dos
 *  totais da própria linha. */
export function mapKeywordRows(rows) {
  return rows.map((row) => {
    const quality = row.adGroupCriterion?.qualityInfo?.qualityScore
    return {
      campanha: row.campaign?.name ?? '—',
      grupoDeAnuncios: row.adGroup?.name ?? '—',
      palavraChave: row.adGroupCriterion?.keyword?.text ?? '—',
      tipoDeCorrespondencia: row.adGroupCriterion?.keyword?.matchType ?? '—',
      ...(row.adGroupCriterion?.status ? { status: row.adGroupCriterion.status } : {}),
      ...(quality != null ? { indiceDeQualidade: num(quality) } : {}),
      ...rowMetrics(row),
    }
  })
}

export function mapSearchTermRows(rows) {
  return rows.map((row) => ({
    termoDePesquisa: row.searchTermView?.searchTerm ?? '—',
    tipoDeCorrespondencia: row.segments?.searchTermMatchType ?? '—',
    // ADDED = já virou palavra-chave, EXCLUDED = já negativado, NONE = nenhum dos dois.
    ...(row.searchTermView?.status ? { statusDoTermo: row.searchTermView.status } : {}),
    campanha: row.campaign?.name ?? '—',
    grupoDeAnuncios: row.adGroup?.name ?? '—',
    ...rowMetrics(row),
  }))
}

async function searchGoogleAds(accessToken, customerId, query, loginCustomerId) {
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      'login-customer-id': loginCustomerId,
      'Content-Type': 'application/json',
    },
    // googleAds:search não aceita pageSize — o tamanho de página é fixo em
    // 10.000 linhas (API rejeita com PAGE_SIZE_NOT_SUPPORTED se enviado).
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  // Lê como texto primeiro: uma resposta de erro nem sempre vem em JSON (ex:
  // 404 de rota/versão inválida costuma vir em HTML/texto puro) — sem isso, o
  // erro real ficava escondido atrás de uma mensagem genérica.
  const rawText = await res.text()
  let data = {}
  try {
    data = JSON.parse(rawText)
  } catch {
    // não era JSON — segue com data={} e usa rawText na mensagem de erro
  }
  return { ok: res.ok, status: res.status, data, rawText }
}

/** A mensagem específica do Google Ads (ex: "NOT_ADS_USER", developer token
 *  não aprovado, etc.) vem aninhada em error.details[], não no error.message
 *  genérico — sem isso, todo erro de auth parece a mesma mensagem inútil de
 *  "missing authentication credential". */
export function extractErrorMessage(result) {
  const nestedMessage = result.data?.error?.details?.flatMap((d) => d?.errors ?? []).find((e) => e?.message)?.message
  return (
    nestedMessage ||
    result.data?.error?.message ||
    result.rawText.slice(0, 300) ||
    `Erro ${result.status} ao consultar a API do Google Ads`
  )
}

/** Detecta o erro específico do Google pedindo login-customer-id de uma conta
 *  gerenciadora (cliente por baixo de uma MCC) — só nesse caso vale tentar de
 *  novo com GOOGLE_ADS_LOGIN_CUSTOMER_ID; qualquer outro 403 (developer token
 *  não aprovado, sem acesso nenhum à conta etc.) uma segunda tentativa não
 *  resolveria, só dobraria a latência de um erro que já é definitivo. */
function needsManagerLoginCustomerId(result) {
  if (result.status !== 403) return false
  return /login-customer-id/i.test(extractErrorMessage(result))
}

/** Roda uma GAQL na conta. Tenta primeiro acesso direto (login-customer-id =
 *  a própria conta) — é o caso da maioria dos clientes. Só troca pra
 *  GOOGLE_ADS_LOGIN_CUSTOMER_ID (a MCC) se o Google recusar especificamente
 *  pedindo isso: as contas dos clientes ficam divididas entre acesso direto
 *  e acesso via MCC, então um login-customer-id fixo pra tudo consertava uma
 *  categoria e quebrava a outra. */
export async function runGoogleAdsQuery(accessToken, customerId, query, logLabel = 'google') {
  let result = await searchGoogleAds(accessToken, customerId, query, customerId)
  if (!result.ok && needsManagerLoginCustomerId(result) && process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    console.log(
      `[${logLabel}] conta ${customerId} precisa de login-customer-id de gerenciador — tentando de novo com ${process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID}`
    )
    result = await searchGoogleAds(accessToken, customerId, query, process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)
  }
  return result
}

/** A GAQL de campanha traz 1 linha por campanha+dia (por causa de
 *  segments.date) — soma por campanha, por dia e pelo total do período.
 *  CTR, CPC médio e custo/conversão são recalculados a partir dos totais
 *  somados, nunca somando ou tirando média das linhas diárias/por campanha
 *  (isso daria um número matematicamente errado). */
export function aggregateResults(rows) {
  const byCampaign = new Map()
  const byDate = new Map()
  const totals = { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 }

  for (const row of rows) {
    const name = row.campaign?.name ?? '—'
    const status = row.campaign?.status ?? 'UNKNOWN'
    const date = row.segments?.date
    const impressions = num(row.metrics?.impressions)
    const clicks = num(row.metrics?.clicks)
    const costMicros = num(row.metrics?.costMicros)
    const conversions = num(row.metrics?.conversions)

    totals.impressions += impressions
    totals.clicks += clicks
    totals.costMicros += costMicros
    totals.conversions += conversions

    const key = row.campaign?.resourceName ?? name
    const entry = byCampaign.get(key) ?? { name, status, impressions: 0, clicks: 0, costMicros: 0, conversions: 0 }
    entry.impressions += impressions
    entry.clicks += clicks
    entry.costMicros += costMicros
    entry.conversions += conversions
    byCampaign.set(key, entry)

    if (date) {
      const dayEntry = byDate.get(date) ?? { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 }
      dayEntry.impressions += impressions
      dayEntry.clicks += clicks
      dayEntry.costMicros += costMicros
      dayEntry.conversions += conversions
      byDate.set(date, dayEntry)
    }
  }

  const campaigns = Array.from(byCampaign.values())
    .map((c) => ({
      name: c.name,
      status: c.status,
      impressions: c.impressions,
      clicks: c.clicks,
      cost: c.costMicros / 1_000_000,
      ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
      conversions: c.conversions,
    }))
    .sort((a, b) => b.cost - a.cost)

  const daily = Array.from(byDate.entries())
    .map(([date, d]) => ({
      date,
      impressions: d.impressions,
      clicks: d.clicks,
      cost: d.costMicros / 1_000_000,
      conversions: d.conversions,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const summary = {
    impressions: totals.impressions,
    clicks: totals.clicks,
    cost: totals.costMicros / 1_000_000,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
    average_cpc: totals.clicks > 0 ? totals.costMicros / totals.clicks / 1_000_000 : 0,
    conversions: totals.conversions,
    cost_per_conversion: totals.conversions > 0 ? totals.costMicros / totals.conversions / 1_000_000 : 0,
  }

  return { summary, campaigns, daily }
}

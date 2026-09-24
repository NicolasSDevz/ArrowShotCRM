// Vercel Function — GET /api/google/insights
//
// Métricas de campanhas do Google Ads via REST (sem SDK oficial): troca o
// refresh token por um access token (OAuth2) e chama googleAds:search com
// uma GAQL fixa. Arquivo único (não por-cliente) — usa as credenciais da
// agência já configuradas no Vercel (GOOGLE_ADS_CLIENT_ID/CLIENT_SECRET/
// REFRESH_TOKEN/DEVELOPER_TOKEN). O projeto está no limite de Serverless
// Functions do plano Hobby, então esse é o único endpoint novo do Google Ads.
//
// Query params:
//   customer_id (obrigatório) — ID da conta Google Ads, sem hífens
//   date_from   (obrigatório) — "yyyy-MM-dd"
//   date_to     (obrigatório) — "yyyy-MM-dd"
//   level       (opcional) — "campaign" (padrão, mantém o formato antigo
//               {summary,campaigns,daily}), "keywords" (keyword_view) ou
//               "search_terms" (search_term_view) — os dois últimos pra
//               otimização "cirúrgica" (pausar termo ruim, ajustar lance de
//               uma palavra-chave específica), que o agregado por campanha
//               não permite. Endpoint único de propósito (ver nota acima
//               sobre limite de Serverless Functions do plano Hobby).

const GOOGLE_ADS_API_VERSION = 'v25'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const VALID_LEVELS = new Set(['campaign', 'keywords', 'search_terms'])

function num(v) {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function getAccessToken() {
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

function buildQuery(dateFrom, dateTo, level) {
  if (level === 'keywords') {
    // Sem segments.date no SELECT: a API já soma os metrics por palavra-chave
    // no período do WHERE (não precisa agregar na mão como em `campaign`,
    // que soma por dia por causa de segments.date estar selecionado ali).
    return `SELECT
      campaign.name,
      ad_group.name,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.cost_per_conversion
    FROM keyword_view
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    AND ad_group_criterion.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 30`
  }

  if (level === 'search_terms') {
    return `SELECT
      search_term_view.search_term,
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
    LIMIT 30`
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

/** keyword_view e search_term_view não têm segments.date no SELECT (ver
 *  buildQuery), então cada linha já é o total do período pra aquela
 *  palavra-chave/termo — só recalcula CTR e custo/conversão a partir dos
 *  totais da própria linha (mesma lógica de aggregateResults, sem precisar
 *  somar linhas diferentes). */
function mapKeywordRows(rows) {
  return rows.map((row) => {
    const impressions = num(row.metrics?.impressions)
    const clicks = num(row.metrics?.clicks)
    const costMicros = num(row.metrics?.costMicros)
    const conversions = num(row.metrics?.conversions)
    return {
      campanha: row.campaign?.name ?? '—',
      grupoDeAnuncios: row.adGroup?.name ?? '—',
      palavraChave: row.adGroupCriterion?.keyword?.text ?? '—',
      tipoDeCorrespondencia: row.adGroupCriterion?.keyword?.matchType ?? '—',
      impressoes: impressions,
      cliques: clicks,
      custo: costMicros / 1_000_000,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      conversoes: conversions,
      custoPorConversao: conversions > 0 ? costMicros / conversions / 1_000_000 : 0,
    }
  })
}

function mapSearchTermRows(rows) {
  return rows.map((row) => {
    const impressions = num(row.metrics?.impressions)
    const clicks = num(row.metrics?.clicks)
    const costMicros = num(row.metrics?.costMicros)
    const conversions = num(row.metrics?.conversions)
    return {
      termoDePesquisa: row.searchTermView?.searchTerm ?? '—',
      tipoDeCorrespondencia: row.segments?.searchTermMatchType ?? '—',
      campanha: row.campaign?.name ?? '—',
      grupoDeAnuncios: row.adGroup?.name ?? '—',
      impressoes: impressions,
      cliques: clicks,
      custo: costMicros / 1_000_000,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      conversoes: conversions,
      custoPorConversao: conversions > 0 ? costMicros / conversions / 1_000_000 : 0,
    }
  })
}

/** A GAQL traz 1 linha por campanha+dia (por causa de segments.date) — soma
 *  por campanha, por dia e pelo total do período. CTR, CPC médio e
 *  custo/conversão são recalculados a partir dos totais somados, nunca
 *  somando ou tirando média das linhas diárias/por campanha (isso daria um
 *  número matematicamente errado). */
function aggregateResults(rows) {
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

export default async function handler(req, res) {
  try {
    const customerId = String(req.query.customer_id || '').replace(/\D/g, '')
    const { date_from: dateFrom, date_to: dateTo } = req.query
    const level = VALID_LEVELS.has(req.query.level) ? req.query.level : 'campaign'

    if (!customerId) {
      return res.status(400).json({ error: 'Parâmetro obrigatório ausente: customer_id' })
    }
    if (!dateFrom || !dateTo || !DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo)) {
      return res.status(400).json({ error: 'Informe date_from e date_to no formato yyyy-MM-dd' })
    }
    if (
      !process.env.GOOGLE_ADS_CLIENT_ID ||
      !process.env.GOOGLE_ADS_CLIENT_SECRET ||
      !process.env.GOOGLE_ADS_REFRESH_TOKEN ||
      !process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    ) {
      return res.status(500).json({
        error:
          'Credenciais do Google Ads não configuradas no servidor (GOOGLE_ADS_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN/DEVELOPER_TOKEN).',
      })
    }

    console.log('[google/insights] payload recebido:', { customer_id: customerId, date_from: dateFrom, date_to: dateTo })

    let accessToken
    try {
      accessToken = await getAccessToken()
    } catch (err) {
      console.error('[google/insights] falha ao gerar access token:', err.message)
      return res.status(err.httpStatus || 502).json({ error: err.message, code: err.httpStatus || 502 })
    }

    const query = buildQuery(dateFrom, dateTo, level)
    const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`
    // Sem login-customer-id próprio configurado, assume que o refresh token
    // tem acesso direto à conta (sem hierarquia de gerenciador/MCC no meio).
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || customerId

    console.log(`[google/insights] URL: ${url} — login-customer-id: ${loginCustomerId}`)

    const googleResponse = await fetch(url, {
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
    })

    // Lê como texto primeiro: uma resposta de erro nem sempre vem em JSON
    // (ex: 404 de rota/versão inválida costuma vir em HTML/texto puro) — sem
    // isso, o erro real ficava escondido atrás de uma mensagem genérica.
    const rawText = await googleResponse.text()
    let data = {}
    try {
      data = JSON.parse(rawText)
    } catch {
      // não era JSON — segue com data={} e usa rawText na mensagem abaixo
    }

    if (!googleResponse.ok) {
      // A mensagem específica do Google Ads (ex: "NOT_ADS_USER", developer
      // token não aprovado, etc.) vem aninhada em error.details[], não no
      // error.message genérico — sem isso, todo erro de auth parece a mesma
      // mensagem inútil de "missing authentication credential".
      const nestedMessage = data?.error?.details?.flatMap((d) => d?.errors ?? []).find((e) => e?.message)?.message
      const message =
        nestedMessage ||
        data?.error?.message ||
        rawText.slice(0, 300) ||
        `Erro ${googleResponse.status} ao consultar a API do Google Ads`
      console.error('[google/insights] Google Ads API erro:', googleResponse.status, rawText.slice(0, 1000))
      const status = googleResponse.status >= 400 && googleResponse.status < 600 ? googleResponse.status : 502
      return res.status(status).json({ error: message, code: data?.error?.code ?? status })
    }

    const rows = data.results ?? []

    if (level === 'keywords') {
      const keywords = mapKeywordRows(rows)
      console.log(`[google/insights] OK — level=keywords — linhas: ${keywords.length}`)
      return res.status(200).json({ level, keywords })
    }

    if (level === 'search_terms') {
      const searchTerms = mapSearchTermRows(rows)
      console.log(`[google/insights] OK — level=search_terms — linhas: ${searchTerms.length}`)
      return res.status(200).json({ level, searchTerms })
    }

    const { summary, campaigns, daily } = aggregateResults(rows)
    console.log(`[google/insights] OK — campanhas: ${campaigns.length}`)
    return res.status(200).json({ summary, campaigns, daily })
  } catch (err) {
    console.error('[google/insights] erro interno:', err)
    return res.status(500).json({ error: 'Erro interno ao buscar dados do Google Ads' })
  }
}

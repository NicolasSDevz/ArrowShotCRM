// Cliente do frontend para o backend seguro do Meta Ads (Vercel Functions em
// /api/meta/*). O access_token nunca passa por aqui — fica só no servidor
// (process.env.META_ACCESS_TOKEN), configurado nas Environment Variables do
// Vercel. Nunca chame graph.facebook.com diretamente do frontend.

export async function getMetaInsights(accountId, datePreset) {
  const response = await fetch(`/api/meta/insights?account_id=${accountId}&date_preset=${datePreset}`)
  if (!response.ok) throw new Error('Erro ao buscar dados do Meta')
  return response.json()
}

export async function getMetaCampaigns(accountId) {
  const response = await fetch(`/api/meta/campaigns?account_id=${accountId}`)
  if (!response.ok) throw new Error('Erro ao buscar campanhas')
  return response.json()
}

export async function getMetaAdSets(accountId, campaignId) {
  const params = new URLSearchParams({ account_id: accountId })
  if (campaignId) params.set('campaign_id', campaignId)
  const response = await fetch(`/api/meta/adsets?${params.toString()}`)
  if (!response.ok) throw new Error('Erro ao buscar conjuntos de anúncios')
  return response.json()
}

export async function getMetaAds(accountId, adSetId) {
  const params = new URLSearchParams({ account_id: accountId })
  if (adSetId) params.set('adset_id', adSetId)
  const response = await fetch(`/api/meta/ads?${params.toString()}`)
  if (!response.ok) throw new Error('Erro ao buscar anúncios')
  return response.json()
}

/** Insights com controle total dos parâmetros — usado pelo módulo de
 *  Relatórios (período customizado, nível de detalhe, breakdown por
 *  plataforma). `timeRange` é um objeto { since, until } ("yyyy-MM-dd"). */
export async function getMetaInsightsRange(accountId, { timeRange, fields, level, breakdowns, limit, timeIncrement } = {}) {
  const params = new URLSearchParams({ account_id: accountId })
  if (timeRange) params.set('time_range', JSON.stringify(timeRange))
  if (fields) params.set('fields', fields)
  if (level) params.set('level', level)
  if (breakdowns) params.set('breakdowns', breakdowns)
  if (limit) params.set('limit', String(limit))
  if (timeIncrement) params.set('time_increment', String(timeIncrement))

  const requestUrl = `/api/meta/insights?${params.toString()}`
  console.log('[metaApi] GET', requestUrl)
  const response = await fetch(requestUrl)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    console.error('[metaApi] insights ERRO', response.status, body)
    throw new Error(body.error || 'Erro ao buscar dados do Meta')
  }
  const json = await response.json()
  console.log('[metaApi] insights OK', requestUrl, '— linhas:', Array.isArray(json?.data) ? json.data.length : '(sem data[])', json)
  return json
}

/** Nome, moeda e saldo da conta de anúncios — usado no campo "Saldo Atual"
 *  dos relatórios. */
export async function getMetaAccountInfo(accountId) {
  const response = await fetch(`/api/meta/account?account_id=${accountId}`)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'Erro ao buscar dados da conta do Meta')
  }
  return response.json()
}

// Cliente do frontend para o backend seguro do Google Ads (/api/google/*).
// As credenciais (client secret, refresh token, developer token) nunca
// passam por aqui — ficam no servidor, em api/google/insights.js.

/** Métricas de campanhas do Google Ads no período. `customerId` sem hífens. */
export async function getGoogleAdsInsights(customerId, dateFrom, dateTo) {
  const params = new URLSearchParams({ customer_id: customerId, date_from: dateFrom, date_to: dateTo })
  const response = await fetch(`/api/google/insights?${params.toString()}`)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Erro ao buscar dados do Google Ads')
  return body
}

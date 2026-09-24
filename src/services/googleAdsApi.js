// Cliente do frontend para o backend seguro do Google Ads (/api/google/*).
// As credenciais (client secret, refresh token, developer token) nunca
// passam por aqui — ficam no servidor, em api/google/insights.js.

// fetch() não tem timeout por padrão — sem isso, uma resposta lenta da API do
// Google Ads (ou do próprio Vercel Function) trava a chamada indefinidamente,
// o que no Archer significa a mensagem nunca terminar de enviar (bolinhas de
// "digitando" pra sempre, sem erro nenhum aparecer). 20s é folgado pro que é
// uma chamada rápida na prática, mas corta qualquer travamento visível.
const FETCH_TIMEOUT_MS = 20_000

async function fetchInsights(params) {
  const response = await fetch(`/api/google/insights?${params.toString()}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Erro ao buscar dados do Google Ads')
  return body
}

/** Métricas de campanhas do Google Ads no período. `customerId` sem hífens. */
export async function getGoogleAdsInsights(customerId, dateFrom, dateTo) {
  return fetchInsights(new URLSearchParams({ customer_id: customerId, date_from: dateFrom, date_to: dateTo }))
}

/** Top 30 palavras-chave por custo no período (keyword_view) — nível que o
 *  agregado por campanha não tem, pra otimização "cirúrgica" (ajustar lance
 *  de uma palavra-chave específica). */
export async function getGoogleAdsKeywordInsights(customerId, dateFrom, dateTo) {
  return fetchInsights(new URLSearchParams({ customer_id: customerId, date_from: dateFrom, date_to: dateTo, level: 'keywords' }))
}

/** Top 30 termos de pesquisa por custo no período (search_term_view) — pra
 *  identificar/pausar um termo ruim que está consumindo verba sem converter. */
export async function getGoogleAdsSearchTermInsights(customerId, dateFrom, dateTo) {
  return fetchInsights(new URLSearchParams({ customer_id: customerId, date_from: dateFrom, date_to: dateTo, level: 'search_terms' }))
}

// Vercel Function — GET /api/google/insights
//
// Métricas de campanhas do Google Ads via REST (a lógica fica em
// api/_lib/googleAds.js, compartilhada com as ferramentas do Archer).
// Arquivo único (não por-cliente) — usa as credenciais da agência já
// configuradas no Vercel. O projeto está no limite de Serverless Functions do
// plano Hobby, então esse é o único endpoint do Google Ads.
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
//               não permite.

import {
  DATE_RE,
  VALID_LEVELS,
  aggregateResults,
  buildQuery,
  extractErrorMessage,
  getAccessToken,
  hasGoogleAdsCredentials,
  mapKeywordRows,
  mapSearchTermRows,
  runGoogleAdsQuery,
} from '../_lib/googleAds.js'

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
    if (!hasGoogleAdsCredentials()) {
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

    const result = await runGoogleAdsQuery(accessToken, customerId, buildQuery(dateFrom, dateTo, level), 'google/insights')

    if (!result.ok) {
      const message = extractErrorMessage(result)
      console.error('[google/insights] Google Ads API erro:', result.status, result.rawText.slice(0, 1000))
      const status = result.status >= 400 && result.status < 600 ? result.status : 502
      return res.status(status).json({ error: message, code: result.data?.error?.code ?? status })
    }

    const rows = result.data.results ?? []

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

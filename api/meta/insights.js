// Vercel Function — GET /api/meta/insights
//
// Busca métricas de campanhas do Meta Ads. O access_token nunca chega ao
// frontend: fica só em process.env.META_ACCESS_TOKEN, configurado nas
// Environment Variables do Vercel (Settings → Environment Variables).
//
// Query params:
//   account_id  (obrigatório) — ID da conta de anúncios, sem o prefixo "act_"
//   date_preset (opcional)    — ex: "last_30d", "last_7d", "today"
//   time_range  (opcional)    — JSON, ex: {"since":"2024-01-01","until":"2024-01-31"}
//                               (um dos dois — date_preset ou time_range — é obrigatório)
//   fields      (opcional)    — lista de métricas separadas por vírgula
//   level       (opcional)    — "account" (padrão) | "campaign" | "adset" | "ad"
//   breakdowns  (opcional)    — ex: "publisher_platform" (Facebook vs Instagram)
//   limit       (opcional)    — máximo de linhas retornadas

const GRAPH_VERSION = 'v19.0'
const DEFAULT_FIELDS = 'campaign_name,impressions,clicks,spend,cpc,ctr,reach,actions,cost_per_action_type'

export default async function handler(req, res) {
  try {
    const { account_id, date_preset, time_range, fields, level, breakdowns, limit, time_increment } = req.query

    if (!account_id) {
      return res.status(400).json({ error: 'Parâmetro obrigatório ausente: account_id' })
    }
    if (!date_preset && !time_range) {
      return res.status(400).json({ error: 'Informe date_preset ou time_range' })
    }

    const accessToken = process.env.META_ACCESS_TOKEN
    if (!accessToken) {
      return res.status(500).json({ error: 'META_ACCESS_TOKEN não configurado no servidor' })
    }

    const params = new URLSearchParams({
      fields: fields || DEFAULT_FIELDS,
      access_token: accessToken,
    })
    if (date_preset) params.set('date_preset', date_preset)
    if (time_range) params.set('time_range', time_range)
    if (level) params.set('level', level)
    if (breakdowns) params.set('breakdowns', breakdowns)
    if (limit) params.set('limit', limit)
    if (time_increment) params.set('time_increment', time_increment)

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/act_${account_id}/insights?${params.toString()}`
    const metaResponse = await fetch(url)
    const data = await metaResponse.json()

    if (!metaResponse.ok) {
      const status = metaResponse.status >= 400 && metaResponse.status < 600 ? metaResponse.status : 502
      return res.status(status).json({ error: data?.error?.message || 'Erro ao buscar insights do Meta Ads' })
    }

    return res.status(200).json(data)
  } catch (err) {
    console.error('Erro em /api/meta/insights:', err)
    return res.status(500).json({ error: 'Erro interno ao buscar insights do Meta Ads' })
  }
}

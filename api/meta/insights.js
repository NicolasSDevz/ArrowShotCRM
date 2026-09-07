// Vercel Function — GET /api/meta/insights
//
// Busca métricas de campanhas do Meta Ads. O access_token nunca chega ao
// frontend. Duas fontes possíveis, resolvidas em api/_lib/metaTokenStore.js:
//   1. Token próprio do cliente, salvo (criptografado) no Firestore via
//      POST /api/meta/token — necessário quando a conta de anúncios do
//      cliente vive no Business Manager DELE, fora do alcance do usuário
//      "automacaoads" da Arrow Shot.
//   2. Token global da agência — process.env.META_ACCESS_TOKEN — usado
//      quando não há token de cliente salvo (conta própria da Arrow Shot,
//      ou clientes cuja conta já está acessível pelo BM da agência).
//
// Query params:
//   account_id  (obrigatório) — ID da conta de anúncios, sem o prefixo "act_"
//   client_id   (opcional)    — id do cliente no CRM; se tiver token próprio
//                               salvo, é ele que é usado (ver acima)
//   date_preset (opcional)    — ex: "last_30d", "last_7d", "today"
//   time_range  (opcional)    — JSON, ex: {"since":"2024-01-01","until":"2024-01-31"}
//                               (um dos dois — date_preset ou time_range — é obrigatório)
//   fields      (opcional)    — lista de métricas separadas por vírgula
//   level       (opcional)    — "account" (padrão) | "campaign" | "adset" | "ad"
//   breakdowns  (opcional)    — ex: "publisher_platform" (Facebook vs Instagram)
//   limit       (opcional)    — máximo de linhas retornadas

import { resolveMetaToken } from '../_lib/metaTokenStore.js'

const GRAPH_VERSION = 'v19.0'
const DEFAULT_FIELDS = 'campaign_name,impressions,clicks,spend,cpc,ctr,reach,actions,cost_per_action_type'

export default async function handler(req, res) {
  try {
    const { account_id, client_id, date_preset, time_range, fields, level, breakdowns, limit, time_increment } = req.query

    if (!account_id) {
      return res.status(400).json({ error: 'Parâmetro obrigatório ausente: account_id' })
    }
    if (!date_preset && !time_range) {
      return res.status(400).json({ error: 'Informe date_preset ou time_range' })
    }

    let resolved
    try {
      resolved = await resolveMetaToken(client_id)
    } catch (err) {
      return res.status(409).json({ error: err.message })
    }
    if (!resolved) {
      return res.status(500).json({
        error: 'Nenhum token de acesso disponível — configure o token deste cliente em Acessos, ou META_ACCESS_TOKEN no servidor.',
      })
    }
    const accessToken = resolved.token

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
    // DEBUG — nunca logar o access_token: mostra a URL com o token mascarado.
    const safeUrl = url.replace(/access_token=[^&]+/, 'access_token=***')
    console.log('[meta/insights] account_id recebido:', account_id, '— fonte do token:', resolved.source)
    console.log('[meta/insights] URL chamada:', safeUrl)

    const metaResponse = await fetch(url)
    const data = await metaResponse.json()

    console.log('[meta/insights] status da resposta:', metaResponse.status)
    console.log('[meta/insights] body da resposta:', JSON.stringify(data))

    if (!metaResponse.ok) {
      const status = metaResponse.status >= 400 && metaResponse.status < 600 ? metaResponse.status : 502
      return res.status(status).json({ error: data?.error?.message || 'Erro ao buscar insights do Meta Ads' })
    }

    console.log('[meta/insights] linhas retornadas:', Array.isArray(data?.data) ? data.data.length : '(sem data[])')
    return res.status(200).json(data)
  } catch (err) {
    console.error('[meta/insights] erro interno:', err)
    return res.status(500).json({ error: 'Erro interno ao buscar insights do Meta Ads' })
  }
}

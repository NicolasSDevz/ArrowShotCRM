// Vercel Function — GET /api/meta/insights
//
// Arquivo estático (não dinâmico) por design: a rota dinâmica
// api/meta/[action].js não estava sendo resolvida pelo Vercel em produção
// (retornava o index.html da SPA — rewrite catch-all — em vez de JSON), então
// os 5 endpoints de leitura voltaram a ser arquivos próprios. Usa mais vagas
// de Serverless Function no plano Hobby (12 no limite, sem folga), mas é o
// comportamento comprovadamente estável.
//
// Query params:
//   account_id  (obrigatório) — ID da conta de anúncios, sem o prefixo "act_"
//   client_id   (opcional)    — usa o token próprio desse cliente, se houver
//   date_preset (opcional)    — ex: "last_30d" (um dos dois é obrigatório)
//   time_range  (opcional)    — JSON {"since":"yyyy-MM-dd","until":"yyyy-MM-dd"}
//   fields, level, breakdowns, limit, time_increment (opcionais)

import { respondMetaGraphRequest } from '../_lib/metaGraph.js'

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

    console.log('[meta/insights] payload recebido:', { account_id, time_range, date_preset, fields, level, breakdowns })

    const params = new URLSearchParams({ fields: fields || DEFAULT_FIELDS })
    if (date_preset) params.set('date_preset', date_preset)
    if (time_range) params.set('time_range', time_range)
    if (level) params.set('level', level)
    if (breakdowns) params.set('breakdowns', breakdowns)
    if (limit) params.set('limit', limit)
    if (time_increment) params.set('time_increment', time_increment)

    await respondMetaGraphRequest(req, res, {
      label: 'insights do Meta Ads',
      path: `act_${account_id}/insights`,
      params,
    })
  } catch (err) {
    console.error('[meta/insights] erro interno:', err)
    return res.status(500).json({ error: 'Erro interno ao buscar dados do Meta Ads' })
  }
}

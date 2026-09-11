// Vercel Function — GET /api/meta/campaigns
// Campanhas ativas da conta. Ver api/meta/insights.js para o porquê deste
// ser um arquivo estático em vez de parte da rota dinâmica [action].js.
//
// Query params: account_id (obrigatório), client_id (opcional)

import { respondMetaGraphRequest } from '../_lib/metaGraph.js'

export default async function handler(req, res) {
  try {
    const { account_id } = req.query
    if (!account_id) {
      return res.status(400).json({ error: 'Parâmetro obrigatório ausente: account_id' })
    }

    const params = new URLSearchParams({
      fields: 'id,name,status,objective,daily_budget,lifetime_budget',
      effective_status: JSON.stringify(['ACTIVE']),
    })

    await respondMetaGraphRequest(req, res, {
      label: 'campanhas do Meta Ads',
      path: `act_${account_id}/campaigns`,
      params,
    })
  } catch (err) {
    console.error('[meta/campaigns] erro interno:', err)
    return res.status(500).json({ error: 'Erro interno ao buscar campanhas do Meta Ads' })
  }
}

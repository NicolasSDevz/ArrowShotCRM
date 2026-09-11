// Vercel Function — GET /api/meta/adsets
// Conjuntos de anúncios, com filtro opcional por campanha. Ver
// api/meta/insights.js para o porquê deste ser um arquivo estático em vez de
// parte da rota dinâmica [action].js.
//
// Query params: account_id (obrigatório), campaign_id (opcional), client_id (opcional)

import { respondMetaGraphRequest } from '../_lib/metaGraph.js'

export default async function handler(req, res) {
  try {
    const { account_id, campaign_id } = req.query
    if (!account_id) {
      return res.status(400).json({ error: 'Parâmetro obrigatório ausente: account_id' })
    }

    const params = new URLSearchParams({
      fields: 'id,name,status,campaign_id,daily_budget,lifetime_budget,optimization_goal,targeting',
    })
    if (campaign_id) {
      params.set('filtering', JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: campaign_id }]))
    }

    await respondMetaGraphRequest(req, res, {
      label: 'conjuntos de anúncios do Meta Ads',
      path: `act_${account_id}/adsets`,
      params,
    })
  } catch (err) {
    console.error('[meta/adsets] erro interno:', err)
    return res.status(500).json({ error: 'Erro interno ao buscar conjuntos de anúncios do Meta Ads' })
  }
}

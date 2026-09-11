// Vercel Function — GET /api/meta/ads
// Anúncios, com filtro opcional por conjunto de anúncios. Ver
// api/meta/insights.js para o porquê deste ser um arquivo estático em vez de
// parte da rota dinâmica [action].js.
//
// Query params: account_id (obrigatório), adset_id (opcional), client_id (opcional)

import { respondMetaGraphRequest } from '../_lib/metaGraph.js'

export default async function handler(req, res) {
  try {
    const { account_id, adset_id } = req.query
    if (!account_id) {
      return res.status(400).json({ error: 'Parâmetro obrigatório ausente: account_id' })
    }

    const params = new URLSearchParams({ fields: 'id,name,status,adset_id,campaign_id,creative' })
    if (adset_id) {
      params.set('filtering', JSON.stringify([{ field: 'adset.id', operator: 'EQUAL', value: adset_id }]))
    }

    await respondMetaGraphRequest(req, res, {
      label: 'anúncios do Meta Ads',
      path: `act_${account_id}/ads`,
      params,
    })
  } catch (err) {
    console.error('[meta/ads] erro interno:', err)
    return res.status(500).json({ error: 'Erro interno ao buscar anúncios do Meta Ads' })
  }
}

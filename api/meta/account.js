// Vercel Function — GET /api/meta/account
// Nome, moeda e saldo da conta de anúncios (usado no "Saldo Atual" dos
// relatórios). Ver api/meta/insights.js para o porquê deste ser um arquivo
// estático em vez de parte da rota dinâmica [action].js.
//
// Query params: account_id (obrigatório), client_id (opcional)

import { respondMetaGraphRequest } from '../_lib/metaGraph.js'

export default async function handler(req, res) {
  try {
    const { account_id } = req.query
    if (!account_id) {
      return res.status(400).json({ error: 'Parâmetro obrigatório ausente: account_id' })
    }

    const params = new URLSearchParams({ fields: 'name,currency,balance,amount_spent' })

    await respondMetaGraphRequest(req, res, {
      label: 'dados da conta do Meta Ads',
      path: `act_${account_id}`,
      params,
    })
  } catch (err) {
    console.error('[meta/account] erro interno:', err)
    return res.status(500).json({ error: 'Erro interno ao buscar dados da conta do Meta Ads' })
  }
}

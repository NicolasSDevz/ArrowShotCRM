// Vercel Function — GET /api/meta/account
//
// Dados da própria conta de anúncios (nome, moeda, saldo) — usado nos
// relatórios para o campo "Saldo Atual". `balance` e `amount_spent` vêm da
// Graph API na menor unidade da moeda (ex: centavos); o frontend divide por
// 100 ao exibir.
//
// Query params:
//   account_id (obrigatório) — ID da conta de anúncios, sem o prefixo "act_"
//   client_id  (opcional)    — ver api/meta/insights.js para como o token é
//                              resolvido a partir disso

import { resolveMetaToken } from '../_lib/metaTokenStore.js'

const GRAPH_VERSION = 'v19.0'
const FIELDS = 'name,currency,balance,amount_spent'

export default async function handler(req, res) {
  try {
    const { account_id, client_id } = req.query

    if (!account_id) {
      return res.status(400).json({ error: 'Parâmetro obrigatório ausente: account_id' })
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

    const params = new URLSearchParams({ fields: FIELDS, access_token: resolved.token })
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/act_${account_id}?${params.toString()}`
    const metaResponse = await fetch(url)
    const data = await metaResponse.json()

    if (!metaResponse.ok) {
      const status = metaResponse.status >= 400 && metaResponse.status < 600 ? metaResponse.status : 502
      return res.status(status).json({ error: data?.error?.message || 'Erro ao buscar dados da conta do Meta Ads' })
    }

    return res.status(200).json(data)
  } catch (err) {
    console.error('Erro em /api/meta/account:', err)
    return res.status(500).json({ error: 'Erro interno ao buscar dados da conta do Meta Ads' })
  }
}

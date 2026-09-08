// Vercel Function — /api/meta/token
//
// Gerencia o token de acesso do Meta Ads de UM cliente específico (para
// contas que vivem no Business Manager do cliente, fora do alcance do
// usuário "automacaoads" da Arrow Shot). O token em claro nunca é gravado
// no Firestore nem devolvido depois de salvo — só entra e sai criptografado
// (ver api/_lib/tokenCrypto.js e api/_lib/metaTokenStore.js), e todas as
// rotas aqui exigem um usuário interno autenticado (ver api/_lib/auth.js).
//
// GET    /api/meta/token?client_id=X   → { hasToken, updatedAt, updatedBy }
// POST   /api/meta/token { clientId, token } → salva/substitui
// DELETE /api/meta/token?client_id=X   → remove (relatórios desse cliente
//                                          voltam a usar o token da agência,
//                                          se houver)

import { withInternalAuth } from '../_lib/auth.js'
import { setClientToken, deleteClientToken, getClientTokenStatus } from '../_lib/metaTokenStore.js'

const GRAPH_VERSION = 'v19.0'

/** Validação leve: confirma que o token é aceito pela Graph API antes de
 *  salvar, pra não guardar lixo/token expirado sem o usuário perceber. Não
 *  loga o token nem o resultado completo — só se deu certo ou não. */
async function validateTokenWithGraph(token) {
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me?access_token=${encodeURIComponent(token)}`)
    const data = await res.json()
    if (!res.ok) {
      return { ok: false, message: data?.error?.message || 'Token rejeitado pela API do Meta' }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: 'Não foi possível validar o token com a API do Meta (falha de rede)' }
  }
}

async function handler(req, res, user) {
  if (req.method === 'GET') {
    const clientId = req.query.client_id
    if (!clientId) return res.status(400).json({ error: 'Parâmetro obrigatório ausente: client_id' })
    const status = await getClientTokenStatus(clientId)
    return res.status(200).json(status)
  }

  if (req.method === 'POST') {
    const { clientId, token } = req.body || {}
    if (!clientId) return res.status(400).json({ error: 'Parâmetro obrigatório ausente: clientId' })
    if (!token || typeof token !== 'string' || token.trim().length < 20) {
      return res.status(400).json({ error: 'Token ausente ou inválido' })
    }

    const trimmed = token.trim()
    console.log(`[meta/token] POST clientId=${clientId} por ${user.name} — validando com o Graph…`)
    const validation = await validateTokenWithGraph(trimmed)
    if (!validation.ok) {
      console.warn('[meta/token] validação recusada:', validation.message)
      return res.status(400).json({ error: `Token não pôde ser validado: ${validation.message}` })
    }

    await setClientToken(clientId, trimmed, user.name)
    console.log(`[meta/token] token do cliente ${clientId} gravado com sucesso`)
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const clientId = req.query.client_id
    if (!clientId) return res.status(400).json({ error: 'Parâmetro obrigatório ausente: client_id' })
    await deleteClientToken(clientId)
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, POST, DELETE')
  return res.status(405).json({ error: 'Método não permitido' })
}

export default withInternalAuth(handler)

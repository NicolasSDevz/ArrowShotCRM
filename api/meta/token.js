// Vercel Function — /api/meta/token
//
// Gerencia o token de acesso do Meta Ads de UM cliente específico (para
// contas que vivem no Business Manager do cliente, fora do alcance do
// usuário "automacaoads" da Arrow Shot). O token em claro nunca é gravado
// no Firestore nem devolvido depois de salvo — só entra e sai criptografado
// (ver api/_lib/tokenCrypto.js e api/_lib/metaTokenStore.js), e todas as
// rotas aqui exigem um usuário interno autenticado (ver api/_lib/auth.js).
//
// GET    /api/meta/token?client_id=X   → { hasToken, updatedAt, updatedBy, expiresAt }
// GET    /api/meta/token               → { tokens: [{ clientId, ... }] }  (todos)
// POST   /api/meta/token { clientId, token } → salva/substitui
// DELETE /api/meta/token?client_id=X   → remove

import { withInternalAuth } from '../_lib/auth.js'
import {
  setClientToken,
  deleteClientToken,
  getClientTokenStatus,
  listAllTokenStatuses,
} from '../_lib/metaTokenStore.js'

const GRAPH_VERSION = 'v19.0'

/** Valida o token com a Graph API e, de quebra, descobre quando ele expira
 *  (debug_token). Retorna { ok, message?, expiresAt? }. */
async function inspectToken(token) {
  try {
    const meRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me?access_token=${encodeURIComponent(token)}`)
    const meData = await meRes.json()
    if (!meRes.ok) return { ok: false, message: meData?.error?.message || 'Token rejeitado pela API do Meta' }

    // expiração — só dá pra ler com um app access token (APP_ID|APP_SECRET)
    let expiresAt = null
    const appId = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET
    if (appId && appSecret) {
      try {
        const dbg = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=${encodeURIComponent(token)}` +
            `&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`
        )
        const dbgData = await dbg.json()
        const exp = dbgData?.data?.expires_at
        // 0 = nunca expira (system user token)
        if (typeof exp === 'number' && exp > 0) expiresAt = new Date(exp * 1000).toISOString()
      } catch {
        /* expiração é opcional — segue sem ela */
      }
    }
    return { ok: true, expiresAt }
  } catch {
    return { ok: false, message: 'Não foi possível validar o token com a API do Meta (falha de rede)' }
  }
}

async function handler(req, res, user) {
  if (req.method === 'GET') {
    const clientId = req.query.client_id
    if (!clientId) {
      const tokens = await listAllTokenStatuses()
      return res.status(200).json({ tokens })
    }
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
    const inspection = await inspectToken(trimmed)
    if (!inspection.ok) {
      console.warn('[meta/token] validação recusada:', inspection.message)
      return res.status(400).json({ error: `Token não pôde ser validado: ${inspection.message}` })
    }

    await setClientToken(clientId, trimmed, user.name, inspection.expiresAt)
    console.log(`[meta/token] token do cliente ${clientId} gravado (expira: ${inspection.expiresAt ?? 'desconhecido'})`)
    return res.status(200).json({ ok: true, expiresAt: inspection.expiresAt ?? null })
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

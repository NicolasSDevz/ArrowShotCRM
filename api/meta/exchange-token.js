// Vercel Function — POST /api/meta/exchange-token
//
// Troca um token CURTO (gerado no Explorador da API do Graph, ~1-2h de vida)
// por um token de LONGA duração (~60 dias) e salva já criptografado na ficha
// do cliente (mesmo store do /api/meta/token).
//
// O APP_SECRET nunca sai do servidor — por isso a troca acontece aqui, não
// no frontend.
//
// POST { clientId, short_token } → { ok, expires_in, expires_at }
//   (o token longo em si NUNCA é devolvido ao navegador)

import { withInternalAuth } from '../_lib/auth.js'
import { setClientToken } from '../_lib/metaTokenStore.js'

const GRAPH_VERSION = 'v19.0'

async function handler(req, res, user) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }

  const { clientId, short_token: shortToken } = req.body || {}
  if (!clientId) return res.status(400).json({ error: 'Parâmetro obrigatório ausente: clientId' })
  if (!shortToken || typeof shortToken !== 'string' || shortToken.trim().length < 20) {
    return res.status(400).json({ error: 'Token curto ausente ou inválido' })
  }

  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) {
    return res.status(500).json({
      error: 'META_APP_ID / META_APP_SECRET não configurados no servidor — não é possível trocar o token.',
    })
  }

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(shortToken.trim())}`

  let data
  try {
    const graphRes = await fetch(url)
    data = await graphRes.json()
    if (!graphRes.ok) {
      console.warn('[meta/exchange-token] Graph recusou:', data?.error?.message)
      return res.status(400).json({ error: data?.error?.message || 'A API do Meta recusou a troca do token' })
    }
  } catch {
    return res.status(502).json({ error: 'Falha de rede ao contatar a API do Meta' })
  }

  const longToken = data.access_token
  if (!longToken) {
    return res.status(502).json({ error: 'A API do Meta não retornou um token de longa duração' })
  }
  // fb_exchange_token devolve ~5184000s (60 dias). Se vier sem expires_in
  // (token já era de longa duração), assume 60 dias.
  const expiresIn = Number(data.expires_in) > 0 ? Number(data.expires_in) : 60 * 24 * 3600
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  await setClientToken(clientId, longToken, user.name, expiresAt)
  console.log(`[meta/exchange-token] cliente ${clientId} — token longo salvo por ${user.name}, expira ${expiresAt}`)

  return res.status(200).json({ ok: true, expires_in: expiresIn, expires_at: expiresAt })
}

export default withInternalAuth(handler)

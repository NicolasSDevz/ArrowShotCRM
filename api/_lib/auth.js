// Verificação de autenticação para as Vercel Functions que expõem dados ou
// aceitam mudanças sensíveis (ex: cadastrar o token de um cliente). Espera
// um header `Authorization: Bearer <Firebase ID token>` — o frontend envia
// isso automaticamente (ver src/services/metaApi.js).
//
// Replica em código o mesmo critério de "usuário interno" já usado nas
// Firestore Security Rules (isInternal(): active == true && role em
// admin/manager/employee) — ver firestore.rules.

import { verifyIdToken, getDoc } from './firebaseAdmin.js'

const INTERNAL_ROLES = new Set(['admin', 'manager', 'employee'])

export class AuthError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** Verifica o ID token do header Authorization e confirma que é um usuário
 *  interno ativo (admin/manager/employee). Lança AuthError (401/403) se não. */
export async function requireInternalUser(req) {
  const header = req.headers.authorization || req.headers.Authorization
  if (!header || !header.startsWith('Bearer ')) {
    throw new AuthError(401, 'Não autenticado — token ausente')
  }
  const idToken = header.slice('Bearer '.length).trim()

  let decoded
  try {
    decoded = await verifyIdToken(idToken)
  } catch (err) {
    console.error('[auth] verifyIdToken falhou:', err.message)
    throw new AuthError(401, 'Não autenticado — token inválido ou expirado')
  }

  const userDoc = await getDoc(`users/${decoded.uid}`)
  const profile = userDoc.exists ? userDoc.data() : null

  if (!profile || profile.active !== true || !INTERNAL_ROLES.has(profile.role)) {
    throw new AuthError(403, 'Sem permissão — apenas a equipe interna pode gerenciar tokens do Meta Ads')
  }

  return { uid: decoded.uid, name: profile.name || decoded.email || decoded.uid, role: profile.role }
}

/** Envolve um handler de API com a verificação acima, respondendo o erro
 *  apropriado automaticamente. */
export function withInternalAuth(handler) {
  return async (req, res) => {
    try {
      const user = await requireInternalUser(req)
      return await handler(req, res, user)
    } catch (err) {
      if (err instanceof AuthError) {
        return res.status(err.status).json({ error: err.message })
      }
      console.error('[auth] erro inesperado:', err)
      return res.status(500).json({ error: `Erro interno: ${err?.message || 'desconhecido'}` })
    }
  }
}

/** Leitura de dados do Meta Ads (/api/meta/insights, campaigns, account):
 *  aceita um usuário interno logado OU o token de um link público de
 *  relatório (/relatorio/:token) ativo cuja conta Meta seja a mesma pedida
 *  em `account_id`. No caso do link, força `client_id` para o cliente dono
 *  do link — assim o token de um cliente nunca é usado pra ler outra conta. */
export function withMetaReadAuth(handler) {
  return async (req, res) => {
    try {
      const header = req.headers.authorization || req.headers.Authorization
      const reportToken = typeof req.query.report_token === 'string' ? req.query.report_token.trim() : ''

      if (header || !reportToken) {
        const user = await requireInternalUser(req)
        return await handler(req, res, user)
      }

      if (!/^[A-Za-z0-9_-]{16,64}$/.test(reportToken)) {
        throw new AuthError(401, 'Link de relatório inválido')
      }
      const linkDoc = await getDoc(`reportLinks/${reportToken}`)
      const link = linkDoc.exists ? linkDoc.data() : null
      if (!link || link.active !== true) {
        throw new AuthError(401, 'Link de relatório inválido ou desativado')
      }
      const linkAccount = String(link.metaAccountId || '').trim().replace(/^act_/i, '')
      const askedAccount = String(req.query.account_id || '').trim().replace(/^act_/i, '')
      if (!linkAccount || linkAccount !== askedAccount) {
        throw new AuthError(403, 'Este link de relatório não dá acesso a essa conta')
      }
      req.query.client_id = link.clientId
      return await handler(req, res, null)
    } catch (err) {
      if (err instanceof AuthError) {
        return res.status(err.status).json({ error: err.message })
      }
      console.error('[auth] erro inesperado:', err)
      return res.status(500).json({ error: `Erro interno: ${err?.message || 'desconhecido'}` })
    }
  }
}

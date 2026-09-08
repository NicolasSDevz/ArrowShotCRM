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

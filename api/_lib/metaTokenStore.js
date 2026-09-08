// Armazena e resolve o token de acesso do Meta Ads por cliente.
//
// Os tokens ficam numa coleção própria — `metaClientTokens/{clientId}` —
// separada do documento `clients/{clientId}`:
//   1. As Firestore Security Rules negam explicitamente qualquer acesso do
//      SDK (cliente ou portal) a essa coleção — só chamadas server-side
//      autenticadas com a service account (aqui, via REST) leem/gravam.
//   2. O valor gravado é sempre o resultado de `encryptToken` (ver
//      tokenCrypto.js) — nunca o token em claro.

import { getDoc, setDoc, deleteDoc } from './firebaseAdmin.js'
import { encryptToken, decryptToken } from './tokenCrypto.js'

const COLLECTION = 'metaClientTokens'

/** Grava (ou substitui) o token de um cliente. `token` é o valor em claro —
 *  só existe em memória neste request, nunca é persistido assim. */
export async function setClientToken(clientId, token, updatedBy) {
  const enc = encryptToken(token)
  await setDoc(`${COLLECTION}/${clientId}`, {
    ...enc,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || null,
  })
}

export async function deleteClientToken(clientId) {
  await deleteDoc(`${COLLECTION}/${clientId}`)
}

/** Retorna { hasToken, updatedAt, updatedBy } sem nunca decifrar/expor o
 *  token — usado pra UI mostrar "token configurado em X por Y". */
export async function getClientTokenStatus(clientId) {
  const doc = await getDoc(`${COLLECTION}/${clientId}`)
  if (!doc.exists) return { hasToken: false }
  const data = doc.data()
  return { hasToken: true, updatedAt: data.updatedAt ?? null, updatedBy: data.updatedBy ?? null }
}

/** Resolve o token a usar para uma chamada à Graph API:
 *   1. Se o cliente tem token próprio salvo, decifra e usa esse.
 *   2. Senão, cai pro token global da agência (META_ACCESS_TOKEN).
 *  Retorna null se nenhum dos dois existir. */
export async function resolveMetaToken(clientId) {
  if (clientId) {
    const doc = await getDoc(`${COLLECTION}/${clientId}`)
    if (doc.exists) {
      try {
        return { token: decryptToken(doc.data()), source: 'client' }
      } catch (err) {
        console.error(`[metaTokenStore] falha ao decifrar token do cliente ${clientId}:`, err.message)
        throw new Error('Token salvo para este cliente não pôde ser decifrado — recadastre o token em Acessos.')
      }
    }
  }
  if (process.env.META_ACCESS_TOKEN) {
    return { token: process.env.META_ACCESS_TOKEN, source: 'agency' }
  }
  return null
}

// Armazena e resolve o token de acesso do Meta Ads por cliente.
//
// Os tokens ficam numa coleção própria — `metaClientTokens/{clientId}` —
// separada do documento `clients/{clientId}`:
//   1. As Firestore Security Rules negam explicitamente qualquer acesso do
//      SDK (cliente ou portal) a essa coleção — só chamadas server-side
//      autenticadas com a service account (aqui, via REST) leem/gravam.
//   2. O valor gravado é sempre o resultado de `encryptToken` (ver
//      tokenCrypto.js) — nunca o token em claro.

import { getDoc, setDoc, updateDoc, deleteDoc, listDocs } from './firebaseAdmin.js'
import { encryptToken, decryptToken } from './tokenCrypto.js'

const COLLECTION = 'metaClientTokens'

/** Grava (ou substitui) o token de um cliente. `token` é o valor em claro —
 *  só existe em memória neste request, nunca é persistido assim.
 *  `expiresAt` (ISO string) é opcional — a UI usa pra mostrar validade. */
export async function setClientToken(clientId, token, updatedBy, expiresAt) {
  const enc = encryptToken(token)
  await setDoc(`${COLLECTION}/${clientId}`, {
    ...enc,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || null,
    expiresAt: expiresAt || null,
    expiryNotifiedAt: null,
  })
}

export async function deleteClientToken(clientId) {
  await deleteDoc(`${COLLECTION}/${clientId}`)
}

/** Marca que já avisamos sobre a expiração deste token (evita spam de
 *  notificação no cron diário). */
export async function markExpiryNotified(clientId) {
  await updateDoc(`${COLLECTION}/${clientId}`, { expiryNotifiedAt: new Date().toISOString() }).catch(() => {})
}

function statusFrom(data) {
  return {
    hasToken: true,
    updatedAt: data.updatedAt ?? null,
    updatedBy: data.updatedBy ?? null,
    expiresAt: data.expiresAt ?? null,
  }
}

/** Retorna { hasToken, updatedAt, updatedBy, expiresAt } sem nunca
 *  decifrar/expor o token. */
export async function getClientTokenStatus(clientId) {
  const doc = await getDoc(`${COLLECTION}/${clientId}`)
  if (!doc.exists) return { hasToken: false }
  return statusFrom(doc.data())
}

/** Status de TODOS os clientes que têm token salvo. Usado pela página de
 *  gestão de tokens. Retorna [{ clientId, updatedAt, updatedBy, expiresAt,
 *  expiryNotifiedAt }]. */
export async function listAllTokenStatuses() {
  const docs = await listDocs(COLLECTION)
  return docs.map((d) => ({
    clientId: d.id,
    updatedAt: d.updatedAt ?? null,
    updatedBy: d.updatedBy ?? null,
    expiresAt: d.expiresAt ?? null,
    expiryNotifiedAt: d.expiryNotifiedAt ?? null,
  }))
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

// Armazena e resolve o token de acesso do Meta Ads por cliente.
//
// Os tokens ficam numa coleção própria — `metaClientTokens/{clientId}` —
// separada do documento `clients/{clientId}`, por dois motivos:
//   1. As Firestore Security Rules dão leitura do doc do cliente também a
//      usuários com role "client" (portal do próprio cliente). Uma
//      coleção separada, sem nenhuma regra liberando acesso a ela, fica
//      automaticamente bloqueada para o SDK do cliente (Firestore nega por
//      padrão o que não é explicitamente permitido) — só o Admin SDK
//      (usado aqui, server-side) consegue ler.
//   2. O valor gravado é sempre o resultado de `encryptToken` (ver
//      tokenCrypto.js) — nunca o token em claro. Mesmo que alguém
//      conseguisse ler o documento, teria só ciphertext.

import { adminDb } from './firebaseAdmin.js'
import { encryptToken, decryptToken } from './tokenCrypto.js'

const COLLECTION = 'metaClientTokens'

/** Grava (ou substitui) o token de um cliente. `token` é o valor em claro —
 *  só existe em memória neste request, nunca é persistido assim. */
export async function setClientToken(clientId, token, updatedBy) {
  const enc = encryptToken(token)
  await adminDb()
    .collection(COLLECTION)
    .doc(clientId)
    .set({
      ...enc,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || null,
    })
}

export async function deleteClientToken(clientId) {
  await adminDb().collection(COLLECTION).doc(clientId).delete()
}

/** Retorna { updatedAt, updatedBy } sem nunca decifrar/expor o token —
 *  usado pra UI mostrar "token configurado em X por Y". */
export async function getClientTokenStatus(clientId) {
  const doc = await adminDb().collection(COLLECTION).doc(clientId).get()
  if (!doc.exists) return { hasToken: false }
  const data = doc.data()
  return { hasToken: true, updatedAt: data.updatedAt ?? null, updatedBy: data.updatedBy ?? null }
}

/** Resolve o token a usar para uma chamada à Graph API:
 *   1. Se o cliente tem token próprio salvo, decifra e usa esse.
 *   2. Senão, cai pro token global da agência (META_ACCESS_TOKEN — a conta
 *      Arrow Shot em si, ou clientes cujas contas já estão no BM da agência).
 *  Retorna null se nenhum dos dois existir. */
export async function resolveMetaToken(clientId) {
  if (clientId) {
    const doc = await adminDb().collection(COLLECTION).doc(clientId).get()
    if (doc.exists) {
      const data = doc.data()
      try {
        return { token: decryptToken(data), source: 'client' }
      } catch (err) {
        console.error(`[metaTokenStore] falha ao decifrar token do cliente ${clientId}:`, err.message)
        // não usa fallback silenciosamente aqui — é melhor o chamador saber
        // que o token salvo está corrompido/ilegível do que reportar dados
        // da conta errada.
        throw new Error('Token salvo para este cliente não pôde ser decifrado — recadastre o token em Acessos.')
      }
    }
  }
  if (process.env.META_ACCESS_TOKEN) {
    return { token: process.env.META_ACCESS_TOKEN, source: 'agency' }
  }
  return null
}

// Contas do Mercado Pago (cada produto escolhe em qual conta cai o Pix e o cartão).
//
//   Conta principal          variáveis MP_ACCESS_TOKEN / MP_PUBLIC_KEY da Vercel
//   storeMpAccounts/{id}     contas extras: apelido, chave pública, conta no MP, privateTo
//                            (a equipe lê pelo CRM; só o servidor grava)
//   storeSecrets/mp_{id}     token de acesso da conta extra, cifrado (ninguém lê pelo navegador)
//
// O pedido guarda mpAccountId: webhook, conferência, reembolso e estorno usam a mesma conta.

import { getDoc, setDoc, deleteDoc } from '../firebaseAdmin.js'
import { encryptToken, decryptToken } from '../tokenCrypto.js'
import { envMpAccount, mpWhoAmI } from './mercadoPago.js'

const ID_RE = /^mp_[a-z0-9]{6,30}$/

/** Conta pelo id (vazio = principal). null = conta extra que não existe mais. */
export async function getMpAccount(id) {
  if (!id) return envMpAccount()
  if (!ID_RE.test(id)) return null
  const [meta, secret] = await Promise.all([getDoc(`storeMpAccounts/${id}`), getDoc(`storeSecrets/mp_${id}`)])
  if (!meta.exists || !secret.exists) return null
  let accessToken = null
  try {
    accessToken = decryptToken(secret.data().sealed)
  } catch {
    accessToken = null
  }
  return { id, label: meta.data().label || 'Conta extra', accessToken, publicKey: meta.data().publicKey || null }
}

/** Conta que recebe o produto. Conta extra apagada volta pra principal (melhor cobrar que travar a venda). */
export async function mpAccountForProduct(product) {
  return (await getMpAccount(product?.mpAccountId || null)) || envMpAccount()
}

/** Conta do pedido (a mesma em que ele foi cobrado). */
export async function mpAccountForOrder(order) {
  return (await getMpAccount(order?.mpAccountId || null)) || envMpAccount()
}

/** Cadastra ou atualiza uma conta extra. Token novo é conferido no MP antes de salvar. */
export async function saveMpAccount({ id, label, publicKey, accessToken, privateTo, user }) {
  const accId = id || `mp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  if (!ID_RE.test(accId)) throw new Error('Conta inválida')
  const prev = id ? await getDoc(`storeMpAccounts/${accId}`) : null
  if (id && !prev?.exists) throw new Error('Conta não encontrada')
  const meta = {
    label: String(label || '').trim().slice(0, 60),
    publicKey: String(publicKey || '').trim(),
    privateTo: privateTo ?? null,
    updatedAt: new Date().toISOString(),
    updatedBy: user.name,
    ...(prev?.exists ? {} : { createdAt: new Date().toISOString(), createdBy: user.uid }),
  }
  if (!meta.label) throw new Error('Dê um apelido pra conta (ex.: Bruno, Flores)')
  if (!/^(APP_USR|TEST)-[\w-]{20,}$/.test(meta.publicKey)) throw new Error('Chave pública inválida (começa com APP_USR-)')
  if (accessToken) {
    const token = String(accessToken).trim()
    if (!/^(APP_USR|TEST)-[\w-]{20,}$/.test(token)) throw new Error('Access token inválido (começa com APP_USR-)')
    const who = await mpWhoAmI(token).catch(() => {
      throw new Error('O Mercado Pago não aceitou esse access token. Confira se copiou o de Produção inteiro.')
    })
    Object.assign(meta, { mpUserId: who.userId, mpNickname: who.nickname, mpEmail: who.email })
    await setDoc(`storeSecrets/mp_${accId}`, { sealed: encryptToken(token), updatedAt: new Date().toISOString() })
  } else if (!prev?.exists) {
    throw new Error('Cole o access token da conta')
  }
  await setDoc(`storeMpAccounts/${accId}`, { ...(prev?.exists ? prev.data() : {}), ...meta })
  return accId
}

export async function deleteMpAccount(id) {
  if (!ID_RE.test(id)) throw new Error('Conta inválida')
  await Promise.all([deleteDoc(`storeMpAccounts/${id}`), deleteDoc(`storeSecrets/mp_${id}`)])
}

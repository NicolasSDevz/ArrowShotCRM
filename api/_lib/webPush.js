// Notificações push no celular/computador da equipe (CRM instalado como app).
//
// Cada aparelho que ativa as notificações vira um doc em pushSubscriptions/{sha256(endpoint)}
// com { userId, subscription, ua, createdAt }. Só o servidor lê e grava essa coleção
// (as regras do Firestore negam tudo pro navegador por padrão).
//
// Variáveis de ambiente (Vercel):
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY   par de chaves (npx web-push generate-vapid-keys)
//   VAPID_SUBJECT                          mailto: de contato (opcional)

import webpush from 'web-push'
import { createHash } from 'node:crypto'
import { setDoc, deleteDoc, queryDocs } from './firebaseAdmin.js'

const COLLECTION = 'pushSubscriptions'

export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null
}

let configured = false
function ensureVapid() {
  if (configured) return
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:contato@arrowshot.com.br', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)
  configured = true
}

const idFor = (endpoint) => createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 40)

/** Valida o que veio do navegador (PushSubscription.toJSON()). */
export function cleanSubscription(raw) {
  const endpoint = String(raw?.endpoint || '')
  const p256dh = String(raw?.keys?.p256dh || '')
  const auth = String(raw?.keys?.auth || '')
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) return null
  return { endpoint, keys: { p256dh, auth } }
}

export async function savePushSubscription(userId, subscription, ua) {
  await setDoc(`${COLLECTION}/${idFor(subscription.endpoint)}`, {
    userId,
    subscription,
    ua: String(ua || '').slice(0, 300),
    createdAt: new Date().toISOString(),
  })
}

export async function removePushSubscription(endpoint) {
  await deleteDoc(`${COLLECTION}/${idFor(endpoint)}`)
}

/** Manda o aviso para todos os aparelhos dessas pessoas. Aparelho que não existe
 *  mais (notificações desligadas, app apagado) é removido. Nunca lança erro. */
export async function sendPushToUsers(userIds, { title, body, url = '/', tag }) {
  if (!pushConfigured() || !userIds?.length) return { sent: 0 }
  ensureVapid()
  const payload = JSON.stringify({ title, body, url, tag })
  let sent = 0
  await Promise.all(
    [...new Set(userIds)].map(async (userId) => {
      const rows = await queryDocs(COLLECTION, [['userId', userId]]).catch(() => [])
      await Promise.all(
        rows.map(async (row) => {
          try {
            await webpush.sendNotification(row.subscription, payload, { TTL: 24 * 3600, urgency: 'high' })
            sent++
          } catch (err) {
            if (err?.statusCode === 404 || err?.statusCode === 410) await deleteDoc(`${COLLECTION}/${row.id}`).catch(() => {})
            else console.warn('[push] falha ao enviar:', err?.statusCode, err?.body || err?.message)
          }
        })
      )
    })
  )
  return { sent }
}

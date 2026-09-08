// Vercel Cron — GET /api/cron/check-meta-token-expiry  (rodar 1x/dia)
//
// Varre os tokens Meta Ads por cliente e, para os que expiram em até 7 dias,
// cria uma notificação interna para os Gestores e o Admin. Não repete o
// aviso do mesmo token dentro de ~20h (campo expiryNotifiedAt).
//
// Segurança: se CRON_SECRET estiver configurado, exige
// `Authorization: Bearer <CRON_SECRET>` (é o header que o Vercel Cron manda).
// Ver vercel.json → crons.

import { randomUUID } from 'node:crypto'
import { getDoc, setDoc, queryDocs } from '../_lib/firebaseAdmin.js'
import { listAllTokenStatuses, markExpiryNotified } from '../_lib/metaTokenStore.js'

const WARN_WITHIN_DAYS = 7
const RENOTIFY_AFTER_MS = 20 * 3600 * 1000

function daysUntil(iso) {
  return (new Date(iso).getTime() - Date.now()) / (24 * 3600 * 1000)
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'não autorizado' })
  }

  try {
    const all = await listAllTokenStatuses()
    const expiring = all.filter((t) => {
      if (!t.expiresAt) return false
      const d = daysUntil(t.expiresAt)
      if (d > WARN_WITHIN_DAYS) return false // ainda longe
      if (t.expiryNotifiedAt && Date.now() - new Date(t.expiryNotifiedAt).getTime() < RENOTIFY_AFTER_MS) return false
      return true
    })

    if (expiring.length === 0) {
      return res.status(200).json({ ok: true, checked: all.length, notified: 0 })
    }

    // destinatários: gestores + admins ativos
    const [managers, admins] = await Promise.all([
      queryDocs('users', [['role', 'manager']]),
      queryDocs('users', [['role', 'admin']]),
    ])
    const recipientIds = [...new Set([...managers, ...admins].filter((u) => u.active !== false).map((u) => u.id))]

    let created = 0
    for (const t of expiring) {
      const clientDoc = await getDoc(`clients/${t.clientId}`).catch(() => ({ exists: false }))
      const name = clientDoc.exists ? clientDoc.data().companyName || 'cliente' : 'cliente'
      const d = daysUntil(t.expiresAt)
      const dias = d <= 0 ? 'expirou' : `expira em ${Math.max(1, Math.ceil(d))} dia(s)`
      const message =
        `⚠️ Token Meta Ads expirando — ${name}. O token de acesso Meta Ads ${dias}. ` +
        `Abra a ficha do cliente → Planejamento de Campanha → Acessos para renovar.`

      for (const userId of recipientIds) {
        await setDoc(`notifications/${randomUUID()}`, {
          userId,
          type: 'meta_token_expiring',
          message,
          actorName: 'Sistema',
          entityType: 'client',
          entityId: t.clientId,
          read: false,
          createdAt: new Date(),
        }).catch((e) => console.error('[cron] falha ao criar notificação:', e.message))
        created++
      }
      await markExpiryNotified(t.clientId)
    }

    return res.status(200).json({ ok: true, checked: all.length, expiring: expiring.length, notificationsCreated: created })
  } catch (err) {
    console.error('[cron] check-meta-token-expiry falhou:', err)
    return res.status(500).json({ error: err.message })
  }
}

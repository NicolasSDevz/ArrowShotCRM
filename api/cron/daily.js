// Vercel Cron — GET /api/cron/daily  (rodar 1x/dia)
//
// Consolida as 3 rotinas diárias que antes eram Serverless Functions
// separadas (o plano Vercel Hobby limita a 12 functions por deployment):
//   1. check-meta-token-expiry — avisa tokens Meta Ads expirando em <=7 dias
//   2. update-metrics          — recalcula o snapshot diário de métricas
//   3. birthday-notifications  — avisa aniversários de responsáveis hoje
//
// Rodam em sequência; uma falhar não impede as outras de rodar — o erro
// fica registrado em `results.<rotina>.error` e o status HTTP vira 500.
//
// Segurança: se CRON_SECRET estiver configurado, exige
// `Authorization: Bearer <CRON_SECRET>` (header que o Vercel Cron manda).
// Ver vercel.json → crons.

import { randomUUID } from 'node:crypto'
import { getDoc, setDoc, queryDocs, listDocs, updateDoc } from '../_lib/firebaseAdmin.js'
import { listAllTokenStatuses, markExpiryNotified } from '../_lib/metaTokenStore.js'
import { computeAndStoreMetrics } from '../_lib/metricsStore.js'

const WARN_WITHIN_DAYS = 7
const RENOTIFY_AFTER_MS = 20 * 3600 * 1000
const SP_TZ = 'America/Sao_Paulo'
const INTERNAL_ROLES = new Set(['admin', 'manager', 'employee'])

function daysUntil(iso) {
  return (new Date(iso).getTime() - Date.now()) / (24 * 3600 * 1000)
}

/** Varre os tokens Meta Ads por cliente e notifica Gestores/Admins os que
 *  expiram em até WARN_WITHIN_DAYS dias (sem repetir dentro de ~20h). */
async function runTokenExpiryCheck() {
  const all = await listAllTokenStatuses()
  const expiring = all.filter((t) => {
    if (!t.expiresAt) return false
    const d = daysUntil(t.expiresAt)
    if (d > WARN_WITHIN_DAYS) return false
    if (t.expiryNotifiedAt && Date.now() - new Date(t.expiryNotifiedAt).getTime() < RENOTIFY_AFTER_MS) return false
    return true
  })

  if (expiring.length === 0) {
    return { checked: all.length, notified: 0 }
  }

  const [managers, admins] = await Promise.all([
    queryDocs('users', [['role', 'manager']]),
    queryDocs('users', [['role', 'admin']]),
  ])
  const recipientIds = [...new Set([...managers, ...admins].filter((u) => u.active !== false).map((u) => u.id))]

  let notified = 0
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
      }).catch((e) => console.error('[cron/daily] tokenExpiry — falha ao criar notificação:', e.message))
      notified++
    }
    await markExpiryNotified(t.clientId)
  }

  return { checked: all.length, notified }
}

/** Recalcula o snapshot diário de métricas da empresa (MRR, clientes ativos,
 *  churn, LTV, receita por gestor...) — lido pelo Dashboard "Visão Geral". */
async function runMetricsUpdate() {
  await computeAndStoreMetrics()
  return { updated: true }
}

/** { year, month, day } no fuso de São Paulo. */
function spTodayParts() {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: SP_TZ }).format(new Date())
  const [year, month, day] = s.split('-').map(Number)
  return { year, month, day }
}

function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '')
}

/** Igual a src/utils/masks.ts#toWhatsappDigits — o cron não importa de src/. */
function whatsappDigits(raw) {
  let d = digitsOnly(raw)
  if (!d) return ''
  if (d.length === 10 || d.length === 11) d = `55${d}`
  return d
}

/** Igual a src/utils/birthdayMessage.ts — manter os dois em sincronia. */
function birthdayMessage(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'você'
  return (
    `Olá, ${first}! 🎂\n\n` +
    `A equipe Arrow Shot veio te desejar um feliz aniversário! 🎉\n\n` +
    `Que este novo ano seja repleto de muito sucesso, conquistas e ótimos negócios!\n\n` +
    `Obrigado por confiar no nosso trabalho. É um prazer fazer parte da sua jornada! 🚀\n\n` +
    `— Equipe Arrow Shot`
  )
}

/** Percorre os eventos de aniversário do calendário e notifica a equipe
 *  para quem faz aniversário hoje. Idempotente via `lastNotifiedYear`. */
async function runBirthdayNotifications() {
  const { year, month, day } = spTodayParts()

  const [events, clients, users] = await Promise.all([
    listDocs('calendarEvents'),
    listDocs('clients'),
    listDocs('users'),
  ])

  const clientName = new Map(clients.map((c) => [c.id, c.companyName || 'cliente']))
  const recipientIds = users.filter((u) => u.active !== false && INTERNAL_ROLES.has(u.role)).map((u) => u.id)

  const birthdaysToday = events.filter(
    (e) => e.type === 'birthday' && e.birthdayMonth === month && e.birthdayDay === day && e.lastNotifiedYear !== year
  )

  if (birthdaysToday.length === 0 || recipientIds.length === 0) {
    return { checked: events.length, notified: 0 }
  }

  // Dedupe: mesma pessoa em vários papéis -> um aviso só (por whatsapp/nome).
  const seen = new Set()
  const unique = []
  for (const e of birthdaysToday) {
    const key = digitsOnly(e.contactWhatsapp) || String(e.contactName || '').trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(e)
  }

  let notified = 0
  for (const e of unique) {
    const nome = e.contactName || 'Um responsável'
    const cliente = e.clientId ? clientName.get(e.clientId) || 'um cliente' : 'um cliente'
    const wa = whatsappDigits(e.contactWhatsapp)
    const message =
      `🎂 Aniversário hoje!\n${nome} da ${cliente} faz aniversário hoje.\n` +
      `Que tal mandar uma mensagem de parabéns? 🎉` +
      (wa ? `\nWhatsApp: +${wa}` : '')
    const waLink = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(birthdayMessage(nome))}` : null

    for (const userId of recipientIds) {
      await setDoc(`notifications/${randomUUID()}`, {
        userId,
        type: 'birthday_today',
        message,
        actorName: 'Sistema',
        entityId: waLink,
        read: false,
        createdAt: new Date(),
      }).catch((err) => console.error('[cron/daily] birthdays — falha ao criar notificação:', err.message))
      notified++
    }
  }

  await Promise.all(
    birthdaysToday.map((e) =>
      updateDoc(`calendarEvents/${e.id}`, { lastNotifiedYear: year }).catch((err) =>
        console.error('[cron/daily] birthdays — falha ao marcar lastNotifiedYear:', e.id, err.message)
      )
    )
  )

  return { checked: events.length, notified }
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'não autorizado' })
  }

  const results = {}
  let ok = true

  for (const [key, run] of [
    ['tokenExpiry', runTokenExpiryCheck],
    ['metrics', runMetricsUpdate],
    ['birthdays', runBirthdayNotifications],
  ]) {
    try {
      results[key] = await run()
    } catch (err) {
      console.error(`[cron/daily] ${key} falhou:`, err)
      results[key] = { error: err.message }
      ok = false
    }
  }

  return res.status(ok ? 200 : 500).json({ ok, results })
}

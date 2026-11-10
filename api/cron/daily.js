// Vercel Cron — GET /api/cron/daily  (rodar 1x/dia)
//
// Consolida as 3 rotinas diárias que antes eram Serverless Functions
// separadas (o plano Vercel Hobby limita a 12 functions por deployment):
//   1. check-meta-token-expiry — avisa tokens Meta Ads expirando em <=7 dias
//   2. update-metrics          — recalcula o snapshot diário de métricas
//   3. birthday-notifications  — avisa aniversários de responsáveis hoje
//   4. Loja — notas em processamento, pedidos pendentes (webhook perdido) e
//      vendas que o Meta recusou na API de Conversões
//
// Rodam em sequência; uma falhar não impede as outras de rodar — o erro
// fica registrado em `results.<rotina>.error` e o status HTTP vira 500.
//
// Segurança: se CRON_SECRET estiver configurado, exige
// `Authorization: Bearer <CRON_SECRET>` (header que o Vercel Cron manda).
// Ver vercel.json → crons.

import '../_lib/quietDeprecation.js'
import { randomUUID } from 'node:crypto'
import { getDoc, setDoc, queryDocs, listDocs, updateDoc } from '../_lib/firebaseAdmin.js'
import { listAllTokenStatuses, markExpiryNotified, resolveMetaToken } from '../_lib/metaTokenStore.js'
import { fetchAccountInfo, fetchAccountInsights, normalizeAccountId } from '../_lib/metaGraph.js'
import { routedUserIds } from '../_lib/notificationRouting.js'
import { sendPushToUsers } from '../_lib/webPush.js'
import { computeAndStoreMetrics } from '../_lib/metricsStore.js'
import { syncInvoice } from '../_lib/store/invoice.js'
import { publicOrigin, reconcilePendingOrders, retryFailedCapi, notifyAbandonedCarts } from '../_lib/store/core.js'
import { sendRecoveryEmails } from '../_lib/store/archerCheckout.js'

const WARN_WITHIN_DAYS = 7
// Repete a cada ~3 dias (todo dia era barulho demais).
const RENOTIFY_AFTER_MS = 70 * 3600 * 1000
const SP_TZ = 'America/Sao_Paulo'

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

  const recipientIds = routedUserIds(await listDocs('users'), 'meta_token_expiring')

  // Um aviso só com todos os clientes (antes era 1 por cliente por pessoa, todo dia: ~50 avisos/dia).
  const rows = []
  for (const t of expiring) {
    const clientDoc = await getDoc(`clients/${t.clientId}`).catch(() => ({ exists: false }))
    const name = clientDoc.exists ? clientDoc.data().companyName || 'cliente' : 'cliente'
    const d = daysUntil(t.expiresAt)
    rows.push({ name, d, clientId: t.clientId })
  }
  rows.sort((x, y) => x.d - y.d)
  const label = (r) => `${r.name} (${r.d <= 0 ? 'expirou' : `${Math.max(1, Math.ceil(r.d))} dia${Math.ceil(r.d) > 1 ? 's' : ''}`})`
  const message =
    rows.length === 1
      ? `Token do Meta Ads expirando: ${label(rows[0])}. Renove em Métricas > Contas e tokens.`
      : `${rows.length} tokens do Meta Ads expirando: ${rows.map(label).join(', ')}. Renove em Métricas > Contas e tokens.`

  let notified = 0
  for (const userId of recipientIds) {
    await setDoc(`notifications/${randomUUID()}`, {
      userId,
      type: 'meta_token_expiring',
      message,
      actorName: 'Sistema',
      entityType: 'client',
      entityId: rows.length === 1 ? rows[0].clientId : '',
      read: false,
      createdAt: new Date(),
    }).catch((e) => console.error('[cron/daily] tokenExpiry — falha ao criar notificação:', e.message))
    notified++
  }
  for (const t of expiring) await markExpiryNotified(t.clientId)

  return { checked: all.length, notified }
}

/** Saldo das contas de anúncio dos clientes: avisa Nicolas e Ciane quando a
 *  conta pré-paga (ou com limite de gasto) tem saldo pra menos de 3 dias.
 *  Só lê; nunca mexe em saldo/orçamento. Um aviso por dia com todas as contas. */
const BALANCE_DAYS = 3
const BALANCE_MIN = 30

async function runAdBalanceCheck() {
  const [clients, users] = await Promise.all([listDocs('clients'), listDocs('users')])
  const active = clients.filter(
    (c) => c.status !== 'churned' && c.status !== 'paused' && c.campaignPlanning?.acessos?.metaAdsAccountId
  )
  const until = new Date().toISOString().slice(0, 10)
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
  const low = []
  for (const c of active) {
    try {
      const resolved = await resolveMetaToken(c.id)
      if (!resolved?.token) continue
      const accountId = normalizeAccountId(c.campaignPlanning.acessos.metaAdsAccountId)
      const info = await fetchAccountInfo(resolved.token, accountId)
      if (info.available == null) continue // cartão sem limite: não acaba
      const { totals } = await fetchAccountInsights(resolved.token, accountId, since, until)
      const perDay = (totals.spend || 0) / 7
      if (perDay <= 0) continue // não está gastando
      const limit = Math.max(BALANCE_MIN, perDay * BALANCE_DAYS)
      if (info.available < limit) low.push({ name: c.companyName || 'cliente', clientId: c.id, available: info.available, days: info.available / perDay })
    } catch (err) {
      console.warn('[cron/daily] balance —', c.companyName, err.message)
    }
  }
  if (!low.length) return { checked: active.length, low: 0 }

  low.sort((a, b) => a.days - b.days)
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const label = (r) => `${r.name} com ${brl(r.available)} (${r.days < 1 ? 'acaba hoje' : `dá uns ${Math.floor(r.days)} dia${Math.floor(r.days) > 1 ? 's' : ''}`})`
  const message =
    low.length === 1
      ? `Saldo acabando no Meta Ads: ${label(low[0])}. Avise o cliente pra recarregar.`
      : `Saldo acabando no Meta Ads em ${low.length} contas: ${low.map(label).join('; ')}. Avise os clientes pra recarregar.`

  const ids = routedUserIds(users, 'ad_balance_low')
  const day = until
  for (const userId of ids) {
    await setDoc(`notifications/balance_${day}_${userId.slice(0, 8)}`, {
      userId,
      type: 'ad_balance_low',
      message,
      actorName: 'Sistema',
      entityType: 'client',
      entityId: low.length === 1 ? low[0].clientId : '',
      read: false,
      createdAt: new Date(),
    }).catch((e) => console.error('[cron/daily] balance — falha ao criar notificação:', e.message))
  }
  await sendPushToUsers(ids, { title: 'Saldo acabando', body: message, url: '/metricas?aba=meta&alerta=saldo', tag: `saldo-${day}` }).catch(() => {})
  return { checked: active.length, low: low.length }
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
    `A equipe Quiver veio te desejar um feliz aniversário! 🎉\n\n` +
    `Que este novo ano seja repleto de muito sucesso, conquistas e ótimos negócios!\n\n` +
    `Obrigado por confiar no nosso trabalho. É um prazer fazer parte da sua jornada! 🚀\n\n` +
    `— Equipe Quiver`
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
  const recipientIds = routedUserIds(users, 'birthday_today')

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

/** Loja: notas fiscais que ficaram em processamento (rede de segurança do webhook da Focus). */
async function runInvoiceSync() {
  const pending = await queryDocs('storeOrders', [['invoice.status', 'processando']])
  let updated = 0
  for (const o of pending.slice(0, 50)) {
    const inv = await syncInvoice(o.id).catch(() => null)
    if (inv && inv.status !== 'processando') updated++
  }
  return { pending: pending.length, updated }
}

/** Loja: pedidos que o webhook do Mercado Pago não atualizou + Pix direto esquecido. */
function runStoreReconcile(req) {
  return reconcilePendingOrders(publicOrigin(req), 60)
}

/** Loja: reenvia ao Meta as vendas que a API de Conversões recusou. */
function runCapiRetry() {
  return retryFailedCapi(60)
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
    ['adBalance', runAdBalanceCheck],
    ['metrics', runMetricsUpdate],
    ['birthdays', runBirthdayNotifications],
    ['invoices', runInvoiceSync],
    ['storeOrders', runStoreReconcile],
    ['metaCapi', runCapiRetry],
    ['abandonedCarts', () => notifyAbandonedCarts({ force: true })],
    ['recoveryEmails', () => sendRecoveryEmails(publicOrigin(req), { force: true })],
  ]) {
    try {
      results[key] = await run(req)
    } catch (err) {
      console.error(`[cron/daily] ${key} falhou:`, err)
      results[key] = { error: err.message }
      ok = false
    }
  }

  return res.status(ok ? 200 : 500).json({ ok, results })
}

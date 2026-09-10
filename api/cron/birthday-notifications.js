// Vercel Cron — GET /api/cron/birthday-notifications
// Roda todo dia às 11:00 UTC = 08:00 no horário de Brasília (crons do Vercel
// são sempre em UTC).
//
// Percorre os eventos de aniversário do calendário (type === 'birthday',
// criados a partir do Briefing de Tráfego Pago — ver src/services/
// birthdayService.ts) e, para quem faz aniversário HOJE, cria uma
// notificação interna para toda a equipe.
//
// Idempotente: marca `lastNotifiedYear` no evento — se o cron rodar duas
// vezes no mesmo dia, só notifica uma.
//
// Segurança: se CRON_SECRET estiver configurado, exige
// `Authorization: Bearer <CRON_SECRET>` (header do Vercel Cron).

import { randomUUID } from 'node:crypto'
import { listDocs, setDoc, updateDoc } from '../_lib/firebaseAdmin.js'

const SP_TZ = 'America/Sao_Paulo'
const INTERNAL_ROLES = new Set(['admin', 'manager', 'employee'])

/** { year, month, day } no fuso de São Paulo. */
function spTodayParts() {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: SP_TZ }).format(new Date())
  const [year, month, day] = s.split('-').map(Number)
  return { year, month, day }
}

function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '')
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'não autorizado' })
  }

  try {
    const { year, month, day } = spTodayParts()

    const [events, clients, users] = await Promise.all([
      listDocs('calendarEvents'),
      listDocs('clients'),
      listDocs('users'),
    ])

    const clientName = new Map(clients.map((c) => [c.id, c.companyName || 'cliente']))
    const recipientIds = users
      .filter((u) => u.active !== false && INTERNAL_ROLES.has(u.role))
      .map((u) => u.id)

    const birthdaysToday = events.filter(
      (e) =>
        e.type === 'birthday' &&
        e.birthdayMonth === month &&
        e.birthdayDay === day &&
        e.lastNotifiedYear !== year
    )

    if (birthdaysToday.length === 0 || recipientIds.length === 0) {
      return res.status(200).json({ ok: true, checked: events.length, birthdaysToday: 0, notificationsCreated: 0 })
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

    let created = 0
    for (const e of unique) {
      const nome = e.contactName || 'Um responsável'
      const cliente = e.clientId ? clientName.get(e.clientId) || 'um cliente' : 'um cliente'
      const wa = digitsOnly(e.contactWhatsapp)
      const message =
        `🎂 Aniversário hoje!\n${nome} da ${cliente} faz aniversário hoje.\n` +
        `Que tal mandar uma mensagem de parabéns? 🎉` +
        (wa ? `\nWhatsApp: +${wa}` : '')

      for (const userId of recipientIds) {
        await setDoc(`notifications/${randomUUID()}`, {
          userId,
          type: 'birthday_today',
          message,
          actorName: 'Sistema',
          // entityId carrega o número pronto p/ wa.me — o clique abre o WhatsApp
          // (ver resolveNotificationRoute).
          entityId: wa || null,
          read: false,
          createdAt: new Date(),
        }).catch((err) => console.error('[cron] falha ao criar notificação de aniversário:', err.message))
        created++
      }
    }

    // marca todos os eventos de hoje (inclusive os duplicados) como notificados
    await Promise.all(
      birthdaysToday.map((e) =>
        updateDoc(`calendarEvents/${e.id}`, { lastNotifiedYear: year }).catch((err) =>
          console.error('[cron] falha ao marcar lastNotifiedYear:', e.id, err.message)
        )
      )
    )

    return res.status(200).json({
      ok: true,
      checked: events.length,
      birthdaysToday: unique.length,
      notificationsCreated: created,
    })
  } catch (err) {
    console.error('[cron] birthday-notifications falhou:', err)
    return res.status(500).json({ error: err.message })
  }
}

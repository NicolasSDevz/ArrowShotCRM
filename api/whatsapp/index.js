// Vercel Function — /api/whatsapp/:acao (rewrite no vercel.json → /api/whatsapp?acao=:acao)
//
// WhatsApp da Arrow Shot (API oficial do Meta). Toda a lógica está em
// api/_lib/whatsapp.js; aqui só fica o roteamento.
//
// Públicas (chamadas pelo Meta ou pelo agendador):
//   GET  webhook   verificação do webhook (hub.challenge)
//   POST webhook   mensagens e status que o Meta manda
//   GET  sweep     follow-ups + WhatsApp do carrinho abandonado (GitHub Actions, 10 em 10 min)
// Equipe logada:
//   GET  status        conexão (sem segredos) + URL e token do webhook pra copiar no Meta
//   POST credentials   { token, appSecret, phoneNumberId, wabaId } (admin/gerente)
//   GET  templates     modelos aprovados
//   POST send          { to, text } ou { to, template: { name, lang, params } }
//   POST conversation  { waId, aiMode?, followUpStopped?, read?, leadId?, name? }
//   POST reply-ai      { waId } faz a IA responder agora (botão "Responder com IA")
//   POST sdr-analyze   { waId } refaz a análise do SDR (etapa, temperatura, perfil) sem mandar nada
//   POST broadcast     { name, template: { name, lang }, headerMedia?, aiMode, recipients: [{ to, name, leadId, params, headerText?, buttonParams? }] }
//   POST broadcast-cancel { id }
//   POST gcal-auth-url / gcal-connect { url } / gcal-sync / gcal-disconnect   agenda do Google (api/_lib/gcal.js)
//   POST broadcast-resume { id }   retoma um disparo pausado
//   POST broadcast-check  { id }   confere a entrega e agrupa os erros por motivo
//   POST broadcast-retry  { id }   novo disparo só com quem não recebeu (motivo que dá pra resolver)

import '../_lib/quietDeprecation.js'
import { waitUntil } from '@vercel/functions'
import { GcalError, gcalAuthUrl, gcalConnect, gcalDisconnect, runCalendarSync } from '../_lib/gcal.js'
import { requireInternalUser, AuthError } from '../_lib/auth.js'
import { rateLimit, publicOrigin } from '../_lib/store/core.js'
import {
  WaError,
  getWaConfig,
  verifyTokenForWebhook,
  signatureOk,
  handleWebhook,
  maybeAutoReply,
  analyzeConversation,
  runFollowUps,
  runMeetingReminders,
  runPendingReplies,
  runCartRecovery,
  waStatus,
  saveWaCredentials,
  listTemplates,
  sendMessage,
  updateConversation,
  markReadOnWhatsapp,
  createBroadcast,
  runBroadcast,
  runBroadcasts,
  cancelBroadcast,
  notifyCalendar,
  resumeBroadcast,
  checkBroadcast,
  retryBroadcast,
} from '../_lib/whatsapp.js'

// O webhook precisa do corpo cru pra conferir a assinatura do Meta.
export const config = { api: { bodyParser: false } }

async function readRaw(req) {
  if (Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body)
  const chunks = []
  try {
    for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  } catch {
    /* corpo já consumido */
  }
  if (chunks.length) return Buffer.concat(chunks)
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body))
  return Buffer.alloc(0)
}

async function readJson(req) {
  const raw = await readRaw(req)
  if (!raw.length) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw new WaError(400, 'Corpo inválido')
  }
}

const isWaId = (v) => /^\d{8,16}$/.test(String(v || ''))

/* ------------------------------ públicas ------------------------------ */

async function webhookVerify(req, res) {
  const mode = req.query['hub.mode']
  const token = String(req.query['hub.verify_token'] || '')
  const challenge = String(req.query['hub.challenge'] || '')
  const expected = await verifyTokenForWebhook()
  if (mode === 'subscribe' && expected && token === expected) {
    res.setHeader('Content-Type', 'text/plain')
    return res.status(200).send(challenge)
  }
  return res.status(403).send('forbidden')
}

/** O Meta manda o JSON com acentos e emoji escapados (barra-u + 4 dígitos) e a
 *  barra "/" escapada. Se a Vercel já entregou o corpo convertido em objeto,
 *  remonta do mesmo jeito pra conferir a assinatura. */
function metaStyleJson(obj) {
  return JSON.stringify(obj)
    .replace(/\//g, '\\/')
    .replace(/[^\x00-\x7e]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'))
}

function webhookSignatureOk(req, raw, appSecret) {
  const header = req.headers['x-hub-signature-256']
  if (signatureOk(raw, header, appSecret)) return true
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return signatureOk(Buffer.from(metaStyleJson(req.body)), header, appSecret) || signatureOk(Buffer.from(JSON.stringify(req.body)), header, appSecret)
  }
  return false
}

async function webhookReceive(req, res) {
  const raw = await readRaw(req)
  const cfg = await getWaConfig()
  if (cfg?.appSecret && !webhookSignatureOk(req, raw, cfg.appSecret)) {
    console.warn('[whatsapp] webhook com assinatura inválida')
    return res.status(401).json({ error: 'assinatura inválida' })
  }
  let payload
  try {
    payload = JSON.parse(raw.toString('utf8') || '{}')
  } catch {
    return res.status(400).json({ error: 'json inválido' })
  }
  const { touched = [] } = await handleWebhook(payload)
  // A IA responde aqui mesmo (o Meta espera até ~20s e reenvia se não tiver 200;
  // as travas por id de mensagem evitam resposta dupla).
  // Responde 200 na hora (o Meta não reenvia) e a IA segue em segundo plano,
  // esperando o contato terminar de digitar antes de responder.
  const origin = publicOrigin(req)
  waitUntil(Promise.all(touched.map((waId) => maybeAutoReply(waId, origin).catch((e) => console.warn('[whatsapp] IA falhou:', e.message)))))
  return res.status(200).json({ ok: true })
}

async function sweep(req, res) {
  if (!(await rateLimit('wa-sweep', 1, 4 * 60_000))) return res.status(200).json({ skipped: true })
  const origin = publicOrigin(req)
  // Agenda primeiro: reunião marcada pelo link já entra a tempo do lembrete.
  const calendar = await runCalendarSync({ notify: notifyCalendar }).catch((e) => ({ error: e.message }))
  const [followUps, carts, reminders, pending, broadcasts] = await Promise.all([
    runFollowUps(origin).catch((e) => ({ error: e.message })),
    runCartRecovery(origin).catch((e) => ({ error: e.message })),
    runMeetingReminders().catch((e) => ({ error: e.message })),
    runPendingReplies(origin).catch((e) => ({ error: e.message })),
    runBroadcasts().catch((e) => ({ error: e.message })),
  ])
  return res.status(200).json({ calendar, followUps, carts, reminders, pending, broadcasts })
}

/* ------------------------------ equipe ------------------------------ */

const ADMIN = {
  'GET status': async (req) => waStatus(publicOrigin(req)),
  'POST gcal-auth-url': async (req, user) => {
    if (user.role !== 'admin' && user.role !== 'manager') throw new WaError(403, 'Só admin ou gerente conecta a agenda.')
    return { url: gcalAuthUrl() }
  },
  'POST gcal-connect': async (req, user) => {
    if (user.role !== 'admin' && user.role !== 'manager') throw new WaError(403, 'Só admin ou gerente conecta a agenda.')
    const b = await readJson(req)
    const out = await gcalConnect(b.url)
    const sync = await runCalendarSync({ notify: notifyCalendar }).catch((e) => ({ error: e.message }))
    return { ...out, sync }
  },
  'POST gcal-sync': async () => runCalendarSync({ notify: notifyCalendar }),
  'POST gcal-disconnect': async (req, user) => {
    if (user.role !== 'admin' && user.role !== 'manager') throw new WaError(403, 'Só admin ou gerente desconecta a agenda.')
    return gcalDisconnect()
  },
  'POST credentials': async (req, user) => {
    if (user.role !== 'admin' && user.role !== 'manager') throw new WaError(403, 'Só admin ou gerente conecta o WhatsApp.')
    return saveWaCredentials(await readJson(req), user.uid)
  },
  'GET templates': async (req) => ({ templates: await listTemplates({ fresh: req.query.fresh === '1' }) }),
  'POST send': async (req, user) => {
    const b = await readJson(req)
    if (!b.to) throw new WaError(400, 'Informe o número.')
    const t = b.template
    const template = t?.name
      ? {
          name: String(t.name),
          lang: String(t.lang || 'pt_BR'),
          params: Array.isArray(t.params) ? t.params : [],
          headerText: t.headerText ? String(t.headerText).slice(0, 60) : '',
          headerMedia: t.headerMedia ? String(t.headerMedia).slice(0, 1000) : '',
          buttonParams: t.buttonParams && typeof t.buttonParams === 'object' ? t.buttonParams : {},
        }
      : null
    const out = await sendMessage({ to: b.to, text: template ? null : b.text, template, by: user.uid, byName: user.name, convExtra: b.name ? { name: String(b.name).slice(0, 80) } : {} })
    // Quem respondeu pelo CRM assume a conversa: a IA não responde por cima.
    if (b.takeOver !== false) await updateConversation(out.waId, { aiMode: 'off', read: true }).catch(() => {})
    return out
  },
  'POST conversation': async (req) => {
    const b = await readJson(req)
    if (!isWaId(b.waId)) throw new WaError(400, 'Conversa inválida.')
    const out = await updateConversation(b.waId, b)
    if (b.read === true) await markReadOnWhatsapp(b.waId)
    return out
  },
  'POST reply-ai': async (req) => {
    const b = await readJson(req)
    if (!isWaId(b.waId)) throw new WaError(400, 'Conversa inválida.')
    await updateConversation(b.waId, { aiMode: 'auto' })
    return maybeAutoReply(b.waId, publicOrigin(req), { waitMs: 0 })
  },
  'POST broadcast': async (req, user) => {
    const out = await createBroadcast(await readJson(req), user)
    // Começa a mandar já; o que não couber no tempo o sweep continua (5 em 5 min).
    waitUntil(runBroadcast(out.id, { budgetMs: 90_000 }).catch((e) => console.warn('[whatsapp] disparo falhou:', e.message)))
    return out
  },
  'POST broadcast-resume': async (req) => {
    const b = await readJson(req)
    if (!/^bc_[a-z0-9]+$/.test(String(b.id || ''))) throw new WaError(400, 'Disparo inválido.')
    const out = await resumeBroadcast(b.id)
    waitUntil(runBroadcast(b.id, { budgetMs: 90_000 }).catch((e) => console.warn('[whatsapp] disparo falhou:', e.message)))
    return out
  },
  'POST broadcast-check': async (req) => {
    const b = await readJson(req)
    if (!/^bc_[a-z0-9]+$/.test(String(b.id || ''))) throw new WaError(400, 'Disparo inválido.')
    return checkBroadcast(b.id)
  },
  'POST broadcast-retry': async (req, user) => {
    const b = await readJson(req)
    if (!/^bc_[a-z0-9]+$/.test(String(b.id || ''))) throw new WaError(400, 'Disparo inválido.')
    const out = await retryBroadcast(b.id, user)
    waitUntil(runBroadcast(out.id, { budgetMs: 90_000 }).catch((e) => console.warn('[whatsapp] disparo falhou:', e.message)))
    return out
  },
  'POST broadcast-cancel': async (req) => {
    const b = await readJson(req)
    if (!/^bc_[a-z0-9]+$/.test(String(b.id || ''))) throw new WaError(400, 'Disparo inválido.')
    return cancelBroadcast(b.id)
  },
  'POST sdr-analyze': async (req) => {
    const b = await readJson(req)
    if (!isWaId(b.waId)) throw new WaError(400, 'Conversa inválida.')
    return analyzeConversation(b.waId, publicOrigin(req))
  },
}

/** Motivo do erro em texto curto (erro da IA/Anthropic ou outro). */
function errorText(err) {
  const apiMsg = err?.error?.error?.message || err?.error?.message
  const st = err?.status ? ` (${err.status})` : ''
  return String(apiMsg || err?.message || 'desconhecido').slice(0, 300) + st
}

export default async function handler(req, res) {
  const acao = String(req.query.acao || '')
  const route = `${req.method} ${acao}`
  try {
    if (route === 'GET webhook') return await webhookVerify(req, res)
    if (route === 'POST webhook') return await webhookReceive(req, res)
    if (route === 'GET sweep') return await sweep(req, res)
    if (ADMIN[route]) {
      const user = await requireInternalUser(req)
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json(await ADMIN[route](req, user))
    }
    return res.status(404).json({ error: 'Ação desconhecida' })
  } catch (err) {
    const status = err instanceof WaError || err instanceof AuthError || err instanceof GcalError ? err.status : 500
    if (status === 500) console.error(`[whatsapp] ${route} falhou:`, err)
    // Firestore fora do ar (cota estourada / faturamento suspenso): devolve 503 pro Meta
    // reenviar depois (ele tenta por até 7 dias) e a mensagem não se perde.
    // As travas por id de mensagem evitam gravar ou responder em dobro.
    if (route === 'POST webhook' && /quota exceeded|RESOURCE_EXHAUSTED|\b429\b|\b503\b/i.test(errorText(err))) {
      console.error('[whatsapp] Firestore indisponível, Meta vai reenviar:', errorText(err))
      return res.status(503).json({ ok: false, retry: true })
    }
    // Outros erros devolvem 200: senão o Meta reenvia em loop.
    if (route === 'POST webhook') return res.status(200).json({ ok: false })
    // Telas internas (só equipe logada) mostram o motivo real pra dar pra corrigir.
    const internal = Boolean(ADMIN[route])
    const msg = status === 500 ? (internal ? `Erro interno: ${errorText(err)}` : 'Erro interno. Tente de novo em instantes.') : err.message
    return res.status(status).json({ error: msg })
  }
}

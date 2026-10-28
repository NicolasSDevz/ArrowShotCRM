// WhatsApp da Arrow Shot pela API oficial do Meta (WhatsApp Cloud API).
//
// O que mora aqui (a rota é api/whatsapp/index.js):
//   - credenciais (token, app secret...) cifradas em waSecrets/main, cadastradas no CRM
//   - webhook: mensagem que chega vira conversa em waConversations/{waId} e
//     mensagem em waConversations/{waId}/messages/{id}
//   - IA (Claude) respondendo sozinha, com a Base de Vendas; passa pra humano
//     quando precisa (aiMode 'off' + aviso pra equipe)
//   - follow-up automático de quem parou de responder
//   - WhatsApp do carrinho abandonado da Loja (mensagem de modelo + IA do produto)
//
// Regra do WhatsApp: texto livre só até 24h depois da última mensagem do
// contato. Fora disso, só mensagem de modelo (template) aprovada no Meta.

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { getDoc, setDoc, updateDoc, listDocs, queryDocs, queryRecent, createDocIfMissing, incrementField } from './firebaseAdmin.js'
import { encryptToken, decryptToken } from './tokenCrypto.js'
import { sendPushToUsers } from './webPush.js'
import { getBaseVendas, formatBaseVendasForPrompt } from './baseVendas.js'
import { leadContextBlock } from './leadContext.js'
import { transcribeWithGroq } from './groqWhisper.js'
import { rateLimit, getProduct, nowIso } from './store/core.js'
import { productBrief, situationOf, checkoutLink, archerConfig } from './store/archerCheckout.js'

const GRAPH = 'https://graph.facebook.com/v23.0'
const MODEL = 'claude-sonnet-5-5'
const WINDOW_MS = 24 * 3600_000
/** Margem pra não mandar texto livre no limite da janela de 24h. */
const WINDOW_SAFETY_MS = 10 * 60_000
const AI_DAILY_LIMIT = 800
const SECRETS_DOC = 'waSecrets/main'
const SETTINGS_DOC = 'waSettings/main'
const SP_TZ = 'America/Sao_Paulo'

export class WaError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/* ------------------------------ telefone ------------------------------ */

export const digits = (v) => String(v || '').replace(/\D/g, '')

/** Número no formato internacional só com dígitos (Brasil sem DDI ganha 55). */
export function toE164Digits(raw) {
  let d = digits(raw).replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) d = `55${d}`
  return d
}

/** Chave pra comparar números do Brasil com e sem o 9 (o Meta às vezes
 *  manda o wa_id sem o nono dígito): DDD + últimos 8 dígitos. */
export function phoneKey(raw) {
  const d = toE164Digits(raw)
  if (d.startsWith('55') && d.length >= 12) return `${d.slice(2, 4)}${d.slice(-8)}`
  return d
}

/** "+55 11 98765-4321" pra mostrar na tela. */
export function prettyPhone(raw) {
  const d = digits(raw)
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4)
    const rest = d.slice(4)
    return `+55 ${ddd} ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`
  }
  return d ? `+${d}` : ''
}

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || ''

/* ---------------------------- credenciais ---------------------------- */

let cfgCache = null // { value, exp }

/** Credenciais em claro (só no servidor). null = WhatsApp ainda não ligado. */
export async function getWaConfig() {
  if (cfgCache && cfgCache.exp > Date.now()) return cfgCache.value
  const snap = await getDoc(SECRETS_DOC)
  const d = snap.exists ? snap.data() : null
  let value = null
  if (d?.token && d?.phoneNumberId) {
    value = {
      token: decryptToken(d.token),
      appSecret: d.appSecret ? decryptToken(d.appSecret) : '',
      phoneNumberId: d.phoneNumberId,
      wabaId: d.wabaId || '',
      verifyToken: d.verifyToken || '',
      displayPhone: d.displayPhone || '',
      verifiedName: d.verifiedName || '',
    }
  }
  cfgCache = { value, exp: Date.now() + 60_000 }
  return value
}

/** Token de verificação do webhook (é criado sozinho, a pessoa só copia pro Meta). */
async function ensureVerifyToken() {
  const snap = await getDoc(SECRETS_DOC)
  const d = snap.exists ? snap.data() : {}
  if (d.verifyToken) return d.verifyToken
  const verifyToken = randomBytes(18).toString('base64url')
  if (snap.exists) await updateDoc(SECRETS_DOC, { verifyToken })
  else await setDoc(SECRETS_DOC, { verifyToken })
  cfgCache = null
  return verifyToken
}

export async function verifyTokenForWebhook() {
  const snap = await getDoc(SECRETS_DOC)
  return snap.exists ? snap.data().verifyToken || '' : ''
}

/** Status pra tela de Configurações (nunca devolve token nem app secret). */
export async function waStatus(origin) {
  const verifyToken = await ensureVerifyToken()
  const snap = await getDoc(SECRETS_DOC)
  const d = snap.exists ? snap.data() : {}
  return {
    connected: Boolean(d.token && d.phoneNumberId),
    hasAppSecret: Boolean(d.appSecret),
    phoneNumberId: d.phoneNumberId || '',
    wabaId: d.wabaId || '',
    displayPhone: d.displayPhone || '',
    verifiedName: d.verifiedName || '',
    qualityRating: d.qualityRating || '',
    updatedAt: d.updatedAt || null,
    lastWebhookAt: d.lastWebhookAt || null,
    webhookUrl: `${origin}/api/whatsapp/webhook`,
    verifyToken,
  }
}

/** Grava as credenciais. Testa o token no Meta antes (lendo o número). */
export async function saveWaCredentials({ token, appSecret, phoneNumberId, wabaId }, by) {
  const snap = await getDoc(SECRETS_DOC)
  const cur = snap.exists ? snap.data() : {}
  const plainToken = String(token || '').trim() || (cur.token ? decryptToken(cur.token) : '')
  const pnid = digits(phoneNumberId) || cur.phoneNumberId || ''
  if (!plainToken || !pnid) throw new WaError(400, 'Preencha o token e o ID do número de telefone.')

  const res = await fetch(`${GRAPH}/${pnid}?fields=display_phone_number,verified_name,quality_rating`, {
    headers: { Authorization: `Bearer ${plainToken}` },
    signal: AbortSignal.timeout(15_000),
  })
  const info = await res.json().catch(() => ({}))
  if (!res.ok) throw new WaError(400, `O Meta recusou: ${info?.error?.message || res.status}. Confira o token e o ID do número.`)

  const next = {
    ...cur,
    token: encryptToken(plainToken),
    phoneNumberId: pnid,
    wabaId: digits(wabaId) || cur.wabaId || '',
    displayPhone: info.display_phone_number || '',
    verifiedName: info.verified_name || '',
    qualityRating: info.quality_rating || '',
    verifyToken: cur.verifyToken || randomBytes(18).toString('base64url'),
    updatedAt: nowIso(),
    updatedBy: by,
  }
  if (String(appSecret || '').trim()) next.appSecret = encryptToken(String(appSecret).trim())
  await setDoc(SECRETS_DOC, next)
  cfgCache = null

  // Liga o app no WABA pra ele receber os webhooks (sem isso o Meta não manda nada).
  if (next.wabaId) {
    await fetch(`${GRAPH}/${next.wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${plainToken}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {})
  }
  return { displayPhone: next.displayPhone, verifiedName: next.verifiedName }
}

/* ---------------------------- configurações ---------------------------- */

export const DEFAULT_SETTINGS = {
  aiEnabled: true,
  aiInstructions: '',
  autoCreateLead: true,
  followUp: {
    enabled: true,
    businessHoursOnly: true,
    steps: [
      { afterHours: 4, text: '', templateName: '', templateLang: 'pt_BR' },
      { afterHours: 24, text: '', templateName: '', templateLang: 'pt_BR' },
      { afterHours: 72, text: '', templateName: '', templateLang: 'pt_BR' },
    ],
  },
  cart: {
    enabled: false,
    afterMinutes: 40,
    templateName: '',
    templateLang: 'pt_BR',
    params: ['nome', 'produto', 'link'],
  },
}

export async function getWaSettings() {
  const snap = await getDoc(SETTINGS_DOC).catch(() => ({ exists: false }))
  const d = snap.exists ? snap.data() : {}
  return {
    ...DEFAULT_SETTINGS,
    ...d,
    followUp: { ...DEFAULT_SETTINGS.followUp, ...(d.followUp || {}) },
    cart: { ...DEFAULT_SETTINGS.cart, ...(d.cart || {}) },
  }
}

/* ------------------------------ Graph API ------------------------------ */

async function graph(cfg, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = data?.error || {}
    throw new WaError(502, explainGraphError(e) || `Erro do WhatsApp (${res.status})`)
  }
  return data
}

/** Erros mais comuns do Meta em português. */
function explainGraphError(e) {
  const code = Number(e.code)
  if (code === 131047) return 'Passou de 24h desde a última mensagem do contato: só dá para mandar mensagem de modelo.'
  if (code === 131026) return 'Esse número não recebeu a mensagem (pode não ter WhatsApp).'
  if (code === 132001) return 'Esse modelo não existe ou ainda não foi aprovado nesse idioma.'
  if (code === 132000) return 'A quantidade de variáveis não bate com o modelo.'
  if (code === 190) return 'O token do WhatsApp venceu ou foi revogado. Cadastre um novo em Configurações.'
  if (code === 131056) return 'Muitas mensagens seguidas para esse número. Espere um pouco.'
  if (code === 133010) return 'O número da Arrow Shot ainda não está registrado na API.'
  return e.error_user_msg || e.message || ''
}

/* ----------------------------- modelos ----------------------------- */

let tplCache = null // { value, exp }

/** Modelos aprovados no WABA (cache de 10 min). */
export async function listTemplates({ fresh = false } = {}) {
  if (!fresh && tplCache && tplCache.exp > Date.now()) return tplCache.value
  const cfg = await getWaConfig()
  if (!cfg?.wabaId) return []
  const data = await graph(cfg, `${cfg.wabaId}/message_templates?fields=name,language,status,category,components&limit=200`)
  const value = (data.data || []).map((t) => {
    const body = (t.components || []).find((c) => c.type === 'BODY')?.text || ''
    const vars = (body.match(/\{\{\s*\d+\s*\}\}/g) || []).length
    return { name: t.name, language: t.language, status: t.status, category: t.category, body, vars }
  })
  tplCache = { value, exp: Date.now() + 10 * 60_000 }
  return value
}

function renderTemplate(body, params) {
  return String(body || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] ?? '')
}

/* ------------------------------ conversas ------------------------------ */

const convPath = (waId) => `waConversations/${waId}`
const msgPath = (waId, id) => `waConversations/${waId}/messages/${id}`

export function inWindow(conv, now = Date.now()) {
  if (!conv?.lastInboundAt) return false
  return now - new Date(conv.lastInboundAt).getTime() < WINDOW_MS - WINDOW_SAFETY_MS
}

/** Lead do CRM com esse número (compara sem o 9 e sem DDI). */
const PHONE_INDEX = 'waSettings/phoneIndex'
const msOf = (v) => (v ? new Date(v).getTime() || 0 : 0)
/** Mais de um lead com o mesmo número: fica com o mexido por último. */
const newest = (rows) => rows.sort((a, b) => msOf(b.updatedAt) - msOf(a.updatedAt))[0] || null

/** Lead que já está no CRM com esse número (com ou sem o 9).
 *  Rápido: cada lead guarda `phoneKey` (DDD + últimos 8 dígitos) e a busca
 *  vai direto nele, sem ler a lista inteira. Leads gravados sem a chave
 *  (formulário público, leads antigos) ganham a chave aqui: a primeira vez
 *  varre tudo; depois só os criados desde a última varredura. */
async function findLeadByPhone(waId) {
  const key = phoneKey(waId)
  if (!key || key.length < 10) return null
  const hits = await queryDocs('leads', [['phoneKey', key]])
  if (hits.length) return newest(hits)

  const idx = await getDoc(PHONE_INDEX).catch(() => null)
  const since = idx?.exists ? idx.data().scannedAt : null
  const startedAt = new Date()
  const rows = since ? await queryDocs('leads', [['createdAt', new Date(msOf(since) - 10 * 60_000), '>=']]) : await listDocs('leads')
  const matches = []
  const fixes = []
  for (const l of rows) {
    if (!l.whatsapp) continue
    const k = phoneKey(l.whatsapp)
    if (!k) continue
    if (l.phoneKey !== k) fixes.push([l.id, k])
    if (k === key) matches.push(l)
  }
  for (let i = 0; i < fixes.length; i += 25) {
    await Promise.allSettled(fixes.slice(i, i + 25).map(([id, k]) => updateDoc(`leads/${id}`, { phoneKey: k })))
  }
  await setDoc(PHONE_INDEX, { scannedAt: startedAt.toISOString(), lastFixed: fixes.length, full: !since }).catch(() => {})
  return newest(matches)
}

/** Cria o lead de quem chamou pela primeira vez (coluna Novo Lead). */
async function createLeadFromWhatsapp(waId, name) {
  const id = `wa_${waId}`
  const now = new Date()
  await createDocIfMissing(`leads/${id}`, {
    contactName: name || prettyPhone(waId),
    companyName: '',
    whatsapp: prettyPhone(waId),
    phoneKey: phoneKey(waId),
    services: {},
    source: 'whatsapp',
    status: 'new',
    pipelineId: null,
    order: -Date.now(),
    stageChangedAt: now,
    contactHistory: [],
    notes: 'Lead criado sozinho quando chamou no WhatsApp da Arrow Shot.',
    createdAt: now,
    updatedAt: now,
    createdBy: 'whatsapp',
    updatedBy: 'whatsapp',
  })
  return id
}

/** Garante a conversa e devolve os dados dela. */
async function ensureConversation(waId, { name = '', kind = 'lead', extra = {}, linkLead = true } = {}) {
  const snap = await getDoc(convPath(waId))
  if (snap.exists) return { id: waId, ...snap.data() }
  let leadId = null
  let leadName = ''
  // 'existing' = o número já estava no CRM (não cria outro); 'created' = lead novo.
  let leadMatch = null
  if (linkLead && kind === 'lead') {
    const lead = await findLeadByPhone(waId).catch((e) => {
      console.warn('[whatsapp] busca do lead pelo telefone falhou:', e.message)
      return undefined
    })
    if (lead) {
      leadId = lead.id
      leadName = lead.contactName || ''
      leadMatch = 'existing'
    } else if (lead === null && (await getWaSettings()).autoCreateLead) {
      // Só cria se a busca respondeu "não tem". Se a busca falhou, não arrisca duplicar.
      leadId = await createLeadFromWhatsapp(waId, name).catch((e) => {
        console.warn('[whatsapp] não criou o lead:', e.message)
        return null
      })
      if (leadId) leadMatch = 'created'
    }
  }
  const conv = {
    waId,
    phone: prettyPhone(waId),
    name: name || leadName || '',
    leadId,
    leadMatch,
    kind,
    aiMode: 'auto',
    followUpStep: 0,
    followUpStopped: false,
    unread: 0,
    lastMessageAt: nowIso(),
    lastMessageText: '',
    lastDirection: null,
    lastInboundAt: null,
    createdAt: nowIso(),
    ...extra,
  }
  await createDocIfMissing(convPath(waId), conv)
  const again = await getDoc(convPath(waId))
  return { id: waId, ...(again.exists ? again.data() : conv) }
}

/* ------------------------------- envio ------------------------------- */

/**
 * Manda e grava. `text` = mensagem livre (só dentro da janela de 24h);
 * `template` = { name, lang, params } (a qualquer hora).
 * by: 'ai' | 'followup' | 'cart' | uid de quem mandou pelo CRM.
 */
export async function sendMessage({ to, text, template, by, byName = '', convExtra = {}, kind = 'lead' }) {
  const cfg = await getWaConfig()
  if (!cfg) throw new WaError(400, 'O WhatsApp ainda não foi conectado em WhatsApp > Configurações.')
  const target = toE164Digits(to)
  if (target.length < 12) throw new WaError(400, 'Número inválido. Use DDD + número.')

  const existing = await getDoc(convPath(target)).catch(() => ({ exists: false }))
  const conv = existing.exists ? existing.data() : null
  if (text && !template && !inWindow(conv)) {
    throw new WaError(409, 'Passou de 24h desde a última mensagem do contato (ou ele nunca chamou). Use uma mensagem de modelo.')
  }

  let body
  let shown
  if (template) {
    const params = (template.params || []).map((p) => String(p ?? '').slice(0, 900))
    body = {
      messaging_product: 'whatsapp',
      to: target,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.lang || 'pt_BR' },
        ...(params.length ? { components: [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: t || '-' })) }] } : {}),
      },
    }
    const tpl = (await listTemplates().catch(() => [])).find((t) => t.name === template.name)
    shown = tpl ? renderTemplate(tpl.body, params) : `[Modelo ${template.name}] ${params.join(' | ')}`
  } else {
    const clean = String(text || '').trim().slice(0, 4000)
    if (!clean) throw new WaError(400, 'Mensagem vazia.')
    body = { messaging_product: 'whatsapp', to: target, type: 'text', text: { body: clean, preview_url: true } }
    shown = clean
  }

  const out = await graph(cfg, `${cfg.phoneNumberId}/messages`, { method: 'POST', body })
  const waId = out.contacts?.[0]?.wa_id || target
  const id = out.messages?.[0]?.id || `local_${Date.now()}`

  // O Meta pode devolver o número sem o 9: a conversa fica no wa_id oficial.
  await ensureConversation(waId, { name: convExtra.name || '', kind, extra: convExtra, linkLead: kind === 'lead' })
  const at = nowIso()
  await setDoc(msgPath(waId, id), {
    direction: 'out',
    type: template ? 'template' : 'text',
    text: shown,
    template: template ? { name: template.name, lang: template.lang || 'pt_BR' } : null,
    at,
    status: 'sent',
    by,
    byName,
  })
  const patch = { lastMessageAt: at, lastMessageText: shown.slice(0, 160), lastDirection: 'out', updatedAt: at }
  // Quem respondeu pelo CRM zera o "não lidas".
  if (by !== 'ai' && by !== 'followup' && by !== 'cart') patch.unread = 0
  await updateDoc(convPath(waId), patch)
  return { id, waId, text: shown }
}

/* ------------------------------ webhook ------------------------------ */

/** Confere a assinatura X-Hub-Signature-256 (HMAC do corpo com o app secret). */
export function signatureOk(raw, header, appSecret) {
  if (!appSecret) return true // sem app secret cadastrado ainda: não dá pra conferir
  const got = String(header || '').replace(/^sha256=/, '')
  if (!got || !raw) return false
  const want = createHmac('sha256', appSecret).update(raw).digest('hex')
  const a = Buffer.from(got, 'hex')
  const b = Buffer.from(want, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

function inboundText(m) {
  switch (m.type) {
    case 'text':
      return m.text?.body || ''
    case 'button':
      return m.button?.text || ''
    case 'interactive':
      return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || ''
    case 'image':
      return m.image?.caption ? `[imagem] ${m.image.caption}` : '[imagem]'
    case 'video':
      return m.video?.caption ? `[vídeo] ${m.video.caption}` : '[vídeo]'
    case 'document':
      return `[documento] ${m.document?.filename || ''}`.trim()
    case 'sticker':
      return '[figurinha]'
    case 'location':
      return `[localização] ${m.location?.name || ''} ${m.location?.address || ''}`.trim()
    case 'reaction':
      return m.reaction?.emoji ? `[reagiu com ${m.reaction.emoji}]` : '[reação]'
    case 'contacts':
      return '[contato compartilhado]'
    case 'audio':
      return '[áudio]'
    default:
      return `[${m.type || 'mensagem'}]`
  }
}

/** Baixa e transcreve um áudio (Groq). Sem chave do Groq, fica só "[áudio]". */
async function transcribeAudio(cfg, mediaId) {
  if (!process.env.GROQ_API_KEY || !mediaId) return ''
  try {
    const meta = await graph(cfg, mediaId)
    const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return ''
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 20 * 1024 * 1024) return ''
    const out = await transcribeWithGroq(buf, meta.mime_type || 'audio/ogg', 'audio.ogg')
    return String(out?.text || out || '').trim()
  } catch (e) {
    console.warn('[whatsapp] transcrição falhou:', e.message)
    return ''
  }
}

/** Processa o POST do Meta. Devolve as conversas que receberam mensagem nova. */
export async function handleWebhook(payload) {
  const cfg = await getWaConfig()
  if (!cfg) return { ignored: 'sem credenciais' }
  const touched = new Set()
  // Só conta como "recebendo" quando vem algo de verdade para o nosso número.
  const real = (payload?.entry || []).some((e) =>
    (e.changes || []).some((c) => {
      const v = c.value || {}
      return v.metadata?.phone_number_id === cfg.phoneNumberId && ((v.messages || []).length || (v.statuses || []).length)
    })
  )
  if (real) await updateDoc(SECRETS_DOC, { lastWebhookAt: nowIso() }).catch(() => {})

  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {}
      if (v.metadata?.phone_number_id && v.metadata.phone_number_id !== cfg.phoneNumberId) continue

      // Status das mensagens que mandamos (enviada, entregue, lida, falhou).
      for (const s of v.statuses || []) {
        const waId = s.recipient_id
        if (!waId || !s.id) continue
        const patch = { status: s.status, statusAt: new Date(Number(s.timestamp || 0) * 1000 || Date.now()).toISOString() }
        if (s.status === 'failed') patch.error = explainGraphError(s.errors?.[0] || {}) || s.errors?.[0]?.title || 'Falhou'
        // Só atualiza mensagem que saiu pelo CRM (o PATCH criaria uma vazia).
        const known = await getDoc(msgPath(waId, s.id)).catch(() => ({ exists: false }))
        if (known.exists) await updateDoc(msgPath(waId, s.id), patch).catch(() => {})
      }

      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || '']))
      for (const m of v.messages || []) {
        const waId = m.from
        if (!waId || !m.id) continue
        const at = new Date(Number(m.timestamp || 0) * 1000 || Date.now()).toISOString()
        let text = inboundText(m)
        if (m.type === 'audio') {
          const said = await transcribeAudio(cfg, m.audio?.id)
          if (said) text = `[áudio] ${said}`
        }
        // Trava contra o Meta mandar o mesmo webhook de novo.
        const fresh = await createDocIfMissing(msgPath(waId, m.id), { direction: 'in', type: m.type, text, at, by: 'contact', status: 'received' })
        if (!fresh) continue

        const conv = await ensureConversation(waId, { name: names[waId] || '' })
        const patch = {
          lastMessageAt: at,
          lastMessageText: text.slice(0, 160),
          lastDirection: 'in',
          lastInboundAt: at,
          followUpStep: 0,
          updatedAt: nowIso(),
        }
        if (names[waId] && !conv.name) patch.name = names[waId]
        await updateDoc(convPath(waId), patch)
        await incrementField(convPath(waId), 'unread', 1).catch(() => {})
        touched.add(waId)
      }
    }
  }
  return { touched: [...touched] }
}

/* --------------------------- avisos pra equipe --------------------------- */

async function staffIds(conv) {
  const users = await listDocs('users').catch(() => [])
  const ids = new Set(users.filter((u) => u.active !== false && (u.role === 'admin' || u.role === 'manager')).map((u) => u.id))
  if (conv?.leadId) {
    const lead = await getDoc(`leads/${conv.leadId}`).catch(() => null)
    const assigned = lead?.exists ? lead.data().assignedTo : null
    if (assigned) ids.add(assigned)
  }
  return [...ids]
}

/** Aviso no sino + no celular. Texto com o nome primeiro e sem emoji (leitor de tela). */
async function notifyTeam(conv, message, { bell = true } = {}) {
  const ids = await staffIds(conv)
  const who = conv.name || conv.phone || prettyPhone(conv.waId)
  if (bell) {
    for (const userId of ids) {
      await setDoc(`notifications/wa_${conv.waId}_${Date.now()}_${userId.slice(0, 6)}`, {
        userId,
        type: 'whatsapp_handoff',
        message,
        actorName: 'WhatsApp',
        entityId: conv.waId,
        read: false,
        createdAt: new Date(),
      }).catch(() => {})
    }
  }
  await sendPushToUsers(ids, { title: `WhatsApp: ${who}`, body: message, url: `/whatsapp?c=${conv.waId}`, tag: `wa-${conv.waId}` }).catch(() => {})
}

/* ------------------------------- IA ------------------------------- */

let anthropicClient = null
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 40_000, maxRetries: 1 })
  return anthropicClient
}

const WA_STYLE = `Estilo de WhatsApp:
- Português do Brasil, tom humano, simpático e direto, como uma pessoa da equipe digitando no celular.
- Mensagens curtas: 1 a 3 frases. Uma pergunta por vez.
- Sem markdown (sem títulos, listas longas ou tabelas). *Negrito* do WhatsApp só se ajudar muito. No máximo 1 emoji, e só se combinar.
- Nunca diga que é uma IA, robô ou assistente virtual, a não ser que perguntem diretamente; aí seja honesto e diga que é o assistente da equipe e que uma pessoa pode assumir.
- Nunca invente preço, prazo, garantia, resultado ou condição que não esteja nas informações abaixo.
- Áudios chegam transcritos como "[áudio] ...". Imagens e documentos você não vê: se for importante, peça para descrever em texto.`

const HANDOFF_RULES = `Passe para um humano (handoff = true) quando:
- a pessoa pedir para falar com alguém, com o Bruno ou com um atendente;
- for reclamação, cobrança, cancelamento ou problema com serviço já contratado;
- pedirem algo que você não sabe responder com as informações abaixo;
- a pessoa estiver pronta para fechar ou quiser negociar valores.
Ao passar, escreva uma resposta curta avisando que já vai chamar alguém da equipe.`

function leadSystemPrompt(baseVendasText, settings) {
  return `Você atende o WhatsApp da Arrow Shot, agência de marketing digital (tráfego pago no Meta e no Google, social media e landing pages) especializada em empresas de limpeza e facilities no Brasil.

Seu objetivo: responder rápido, entender o negócio da pessoa (tipo de limpeza, cidade, se já anuncia, quanto quer investir) e levar para uma reunião com o Bruno (sócio). Qualifique com naturalidade, sem parecer formulário.

${WA_STYLE}

${HANDOFF_RULES}

# Base de Vendas da Arrow Shot (use como fonte da verdade)
${baseVendasText}
${settings.aiInstructions ? `\n# Instruções extras da equipe\n${String(settings.aiInstructions).slice(0, 4000)}` : ''}

Responda APENAS com JSON: {"reply": "texto da mensagem", "handoff": false, "handoff_reason": ""}`
}

function cartSystemPrompt(product, cart, link) {
  return `Você é o Archer e fala pelo WhatsApp com quem começou a comprar um produto da Loja e não terminou. Ajude a pessoa a tirar dúvidas e concluir a compra com segurança, sem pressão.

${WA_STYLE}
- Nunca ofereça desconto ou cupom que não esteja abaixo. Nunca peça dados de cartão, senha ou CPF pelo WhatsApp.
- Quando fizer sentido, mande o link para concluir: ${link}

${HANDOFF_RULES}

# Produto
${productBrief(product)}

# Situação do carrinho
Nome: ${cart?.name || '(sem nome)'}
Situação: ${cart ? situationOf(cart) : 'desconhecida'}

Responda APENAS com JSON: {"reply": "texto da mensagem", "handoff": false, "handoff_reason": ""}`
}

/** Histórico em turnos alternados user/assistant pra IA. */
function toTurns(msgs) {
  const turns = []
  for (const m of msgs) {
    const role = m.direction === 'in' ? 'user' : 'assistant'
    const content = String(m.text || '').trim()
    if (!content) continue
    const last = turns[turns.length - 1]
    if (last && last.role === role) last.content += `\n${content}`
    else turns.push({ role, content })
  }
  while (turns.length && turns[0].role !== 'user') turns.shift()
  return turns
}

function parseAiJson(text) {
  try {
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    return { reply: String(j.reply || '').trim(), handoff: j.handoff === true, reason: String(j.handoff_reason || '').trim() }
  } catch {
    const clean = String(text || '').trim()
    return { reply: clean.startsWith('{') ? '' : clean, handoff: false, reason: '' }
  }
}

/** Contexto (prompt + extra) da conversa: lead da agência ou carrinho da Loja. */
async function conversationPrompt(conv, settings, origin) {
  if (conv.kind === 'cart' && conv.cartId) {
    const [cartSnap, product] = await Promise.all([getDoc(`storeAbandoned/${conv.cartId}`).catch(() => null), getProduct(conv.productId).catch(() => null)])
    const cart = cartSnap?.exists ? { id: conv.cartId, ...cartSnap.data() } : null
    if (product) {
      const link = cart ? checkoutLink(origin, product, cart, 0, 'whatsapp') : `${origin}/pay/${product.slug}`
      return cartSystemPrompt(product, cart, link)
    }
  }
  const base = formatBaseVendasForPrompt(await getBaseVendas())
  let prompt = leadSystemPrompt(base, settings)
  if (conv.leadId) {
    const lead = await getDoc(`leads/${conv.leadId}`).catch(() => null)
    if (lead?.exists) prompt += `\n\n# O que o CRM sabe desse contato\n${leadContextBlock(lead.data())}`
  }
  return prompt
}

/**
 * Responde com a IA se estiver ligada pra essa conversa. Espera uns segundos
 * antes: quem manda 3 mensagens seguidas recebe uma resposta só.
 */
export async function maybeAutoReply(waId, origin, { waitMs = 6000 } = {}) {
  const settings = await getWaSettings()
  if (settings.aiEnabled && waitMs) await new Promise((r) => setTimeout(r, waitMs))

  const snap = await getDoc(convPath(waId))
  if (!snap.exists) return { skipped: 'sem conversa' }
  const conv = { waId, ...snap.data() }
  if (!settings.aiEnabled || conv.aiMode === 'off') {
    await notifyTeam(conv, `${conv.name || conv.phone} mandou: ${conv.lastMessageText || 'mensagem nova'}`, { bell: false })
    return { skipped: 'humano atendendo' }
  }
  if (conv.lastDirection !== 'in') return { skipped: 'já respondida' }

  const recent = (await queryRecent(convPath(waId), 'messages', 'at', 24)).reverse()
  const lastIn = [...recent].reverse().find((m) => m.direction === 'in')
  if (!lastIn) return { skipped: 'sem mensagem' }
  // Outra chamada do webhook mais nova cuida da resposta.
  if (new Date(conv.lastInboundAt).getTime() > new Date(lastIn.at).getTime() + 1000) return { skipped: 'mais nova a caminho' }
  // Trava: uma resposta por mensagem recebida, mesmo com dois webhooks juntos.
  if (!(await createDocIfMissing(`waLocks/${waId}_${lastIn.id.slice(-40).replace(/[^\w-]/g, '')}`, { at: nowIso() }))) return { skipped: 'em andamento' }

  const ai = anthropic()
  if (!ai) return { skipped: 'sem chave da IA' }
  if (!(await rateLimit('wa-ai-day', AI_DAILY_LIMIT, 24 * 3600_000))) {
    await notifyTeam(conv, `${conv.name || conv.phone} está esperando resposta. A IA do WhatsApp chegou no limite do dia.`)
    return { skipped: 'limite diário' }
  }

  const turns = toTurns(recent)
  if (!turns.length) return { skipped: 'sem turnos' }
  const system = await conversationPrompt(conv, settings, origin)
  const res = await ai.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: turns,
  })
  const raw = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const { reply, handoff, reason } = parseAiJson(raw)

  // Antes de mandar, confere se ninguém da equipe assumiu enquanto a IA pensava.
  const now = await getDoc(convPath(waId))
  if (now.exists && (now.data().aiMode === 'off' || now.data().lastDirection === 'out')) return { skipped: 'humano assumiu' }

  if (reply) await sendMessage({ to: waId, text: reply, by: 'ai', byName: 'IA' })
  if (handoff) {
    await updateDoc(convPath(waId), { aiMode: 'off', handoffReason: reason || 'A IA pediu ajuda', handoffAt: nowIso() })
    await notifyTeam(conv, `${conv.name || conv.phone} precisa de atendimento humano no WhatsApp. Motivo: ${reason || 'a IA pediu ajuda'}.`)
  }
  return { replied: Boolean(reply), handoff }
}

/* ------------------------------ follow-up ------------------------------ */

function spHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: SP_TZ, hour: 'numeric', hour12: false }).format(date)) % 24
}
function spWeekday(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: SP_TZ, weekday: 'short' }).format(date)
}

/** Texto de follow-up escrito pela IA (dentro da janela de 24h). */
async function aiFollowUpText(conv, stepIndex, total, settings, origin) {
  const ai = anthropic()
  if (!ai) return ''
  const recent = (await queryRecent(convPath(conv.waId), 'messages', 'at', 16)).reverse()
  const turns = toTurns(recent)
  if (!turns.length) return ''
  turns.push({
    role: 'user',
    content: `[Instrução interna, não é o contato falando] O contato parou de responder. Escreva o follow-up ${stepIndex + 1} de ${total}: curto, retomando o ponto onde a conversa parou, com uma pergunta simples. ${stepIndex + 1 === total ? 'É o último: deixe a porta aberta, sem insistir.' : ''} Sem cobrar resposta e sem urgência falsa.`,
  })
  const system = await conversationPrompt(conv, settings, origin)
  const res = await ai.messages.create({ model: MODEL, max_tokens: 400, system, messages: turns })
  return parseAiJson(res.content.filter((b) => b.type === 'text').map((b) => b.text).join('')).reply
}

/** Manda o follow-up de quem parou de responder. Roda na varredura de 10 min. */
export async function runFollowUps(origin, { max = 12 } = {}) {
  const settings = await getWaSettings()
  const f = settings.followUp
  if (!f.enabled || !Array.isArray(f.steps) || !f.steps.length) return { skipped: 'desligado' }
  if (f.businessHoursOnly) {
    const h = spHour()
    if (h < 8 || h >= 20 || spWeekday() === 'Sun') return { skipped: 'fora do horário' }
  }
  const convs = await queryDocs('waConversations', [['lastDirection', 'out']])
  let sent = 0
  for (const conv of convs) {
    if (sent >= max) break
    if (conv.kind === 'cart' || conv.followUpStopped || conv.aiMode === 'off') continue
    const step = Number(conv.followUpStep || 0)
    const cfg = f.steps[step]
    if (!cfg) continue
    const since = Date.now() - new Date(conv.lastMessageAt).getTime()
    if (since < Number(cfg.afterHours || 24) * 3600_000) continue

    if (conv.leadId) {
      const lead = await getDoc(`leads/${conv.leadId}`).catch(() => null)
      const st = lead?.exists ? lead.data().status : null
      if (st === 'closed' || st === 'lost') {
        await updateDoc(convPath(conv.waId), { followUpStopped: true })
        continue
      }
    }

    // Trava antes de mandar: duas varreduras juntas não mandam duas vezes.
    await updateDoc(convPath(conv.waId), { followUpStep: step + 1 })
    const name = firstName(conv.name)
    try {
      if (inWindow(conv)) {
        const text = cfg.text ? cfg.text.replaceAll('{nome}', name).trim() : settings.aiEnabled ? await aiFollowUpText(conv, step, f.steps.length, settings, origin) : ''
        if (text) {
          await sendMessage({ to: conv.waId, text, by: 'followup', byName: `Follow-up ${step + 1}` })
          sent++
          continue
        }
      }
      if (cfg.templateName) {
        await sendMessage({ to: conv.waId, template: { name: cfg.templateName, lang: cfg.templateLang || 'pt_BR', params: name ? [name] : [] }, by: 'followup', byName: `Follow-up ${step + 1}` })
        sent++
      }
    } catch (e) {
      console.warn(`[whatsapp] follow-up ${conv.waId}:`, e.message)
      await updateDoc(convPath(conv.waId), { followUpError: e.message.slice(0, 200) }).catch(() => {})
    }
  }
  return { sent }
}

/* -------------------------- carrinho abandonado -------------------------- */

const CART_START_WITHIN_MS = 48 * 3600_000

function cartParam(key, { cart, product, link }) {
  if (key === 'nome') return firstName(cart.name) || 'tudo bem'
  if (key === 'produto') return product.name
  if (key === 'link') return link
  if (key === 'valor') return (Number(cart.amount || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return ''
}

/** Uma mensagem de modelo por carrinho abandonado com telefone. */
export async function runCartRecovery(origin, { max = 8 } = {}) {
  const settings = await getWaSettings()
  const c = settings.cart
  if (!c.enabled || !c.templateName) return { skipped: 'desligado' }
  if (!(await getWaConfig())) return { skipped: 'sem credenciais' }
  const rows = (await listDocs('storeAbandoned')).filter((a) => !a.recoveredAt && a.phone && !a.whatsSentAt && !a.recoveryStopped && !a.contactedAt && !a.privateTo)
  const products = new Map()
  let sent = 0
  for (const cart of rows) {
    if (sent >= max) break
    const idle = Date.now() - new Date(cart.updatedAt).getTime()
    if (idle < Number(c.afterMinutes || 40) * 60_000 || idle > CART_START_WITHIN_MS) continue
    if (!products.has(cart.productId)) products.set(cart.productId, await getProduct(cart.productId).catch(() => null))
    const product = products.get(cart.productId)
    if (!product || product.status !== 'active' || !archerConfig(product).emails) continue

    const to = toE164Digits(cart.phone)
    if (to.length < 12) continue
    // Já é conversa ativa de lead da agência: não mistura assunto.
    const existing = await getDoc(convPath(to)).catch(() => ({ exists: false }))
    if (existing.exists && existing.data().kind !== 'cart' && Date.now() - new Date(existing.data().lastMessageAt).getTime() < 7 * 86400_000) continue

    await updateDoc(`storeAbandoned/${cart.id}`, { whatsSentAt: nowIso() })
    const link = checkoutLink(origin, product, cart, 0, 'whatsapp')
    const params = (c.params || []).map((k) => cartParam(k, { cart, product, link }))
    try {
      const out = await sendMessage({
        to,
        template: { name: c.templateName, lang: c.templateLang || 'pt_BR', params },
        by: 'cart',
        byName: 'Carrinho abandonado',
        kind: 'cart',
        convExtra: { name: cart.name || '', kind: 'cart', cartId: cart.id, productId: product.id, productName: product.name },
      })
      await updateDoc(convPath(out.waId), { kind: 'cart', cartId: cart.id, productId: product.id, productName: product.name }).catch(() => {})
      await updateDoc(`storeAbandoned/${cart.id}`, { whatsOk: true, whatsWaId: out.waId }).catch(() => {})
      sent++
    } catch (e) {
      console.warn('[whatsapp] carrinho:', e.message)
      await updateDoc(`storeAbandoned/${cart.id}`, { whatsOk: false, whatsError: e.message.slice(0, 200) }).catch(() => {})
    }
  }
  return { sent }
}

/* ------------------------ ações da tela do CRM ------------------------ */

/** Atualiza opções da conversa (IA, follow-up, lida, lead). */
export async function updateConversation(waId, input) {
  const patch = {}
  if (input.aiMode === 'auto' || input.aiMode === 'off') {
    patch.aiMode = input.aiMode
    if (input.aiMode === 'auto') patch.handoffReason = null
  }
  if (typeof input.followUpStopped === 'boolean') patch.followUpStopped = input.followUpStopped
  if (input.read === true) patch.unread = 0
  if (typeof input.leadId === 'string' || input.leadId === null) patch.leadId = input.leadId || null
  if (typeof input.name === 'string') patch.name = input.name.trim().slice(0, 80)
  if (!Object.keys(patch).length) throw new WaError(400, 'Nada para atualizar.')
  const snap = await getDoc(convPath(waId))
  if (!snap.exists) throw new WaError(404, 'Conversa não encontrada.')
  await updateDoc(convPath(waId), { ...patch, updatedAt: nowIso() })
  return { ok: true }
}

/** Marca como lida no WhatsApp do contato (os dois risquinhos azuis). */
export async function markReadOnWhatsapp(waId) {
  const cfg = await getWaConfig()
  if (!cfg) return
  const recent = await queryRecent(convPath(waId), 'messages', 'at', 5).catch(() => [])
  const lastIn = recent.find((m) => m.direction === 'in' && m.id.startsWith('wamid'))
  if (!lastIn) return
  await graph(cfg, `${cfg.phoneNumberId}/messages`, { method: 'POST', body: { messaging_product: 'whatsapp', status: 'read', message_id: lastIn.id } }).catch(() => {})
}

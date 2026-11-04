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
import { getDoc, setDoc, updateDoc, updateDocPaths, deleteDoc, listDocs, queryDocs, queryRecent, createDocIfMissing, incrementField } from './firebaseAdmin.js'
import { classifyWaError, publicInfo } from './waErrors.js'
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
  /** Cliente ou lead que a equipe já atende: a IA não responde, só avisa a equipe. */
  skipKnownContacts: true,
  followUp: {
    enabled: true,
    businessHoursOnly: true,
    /** Só manda dentro das 24h da última mensagem do contato (texto grátis, nunca modelo pago). */
    freeOnly: true,
    steps: [
      { afterHours: 3, text: '', templateName: '', templateLang: 'pt_BR' },
      { afterHours: 6, text: '', templateName: '', templateLang: 'pt_BR' },
      { afterHours: 12, text: '', templateName: '', templateLang: 'pt_BR' },
    ],
  },
  /** Jeito do SDR (a IA que qualifica e agenda). */
  sdr: {
    name: '',
    meetingWith: 'Bruno',
    meetingLength: '30 minutos',
    meetingLink: '',
    meetingHours: 'segunda a sexta, das 9h às 18h',
  },
  /** Segundos que a IA espera depois da última mensagem do contato (ele pode estar digitando mais). */
  aiDelaySeconds: 25,
  /** Aviso no celular a cada mensagem nova em conversa sem IA (barulhento: desligado). */
  notifyEveryMessage: false,
  /** Lembrete automático pro contato antes da reunião marcada. */
  reminder: {
    enabled: true,
    minutesBefore: 30,
    text: '',
    templateName: '',
    templateLang: 'pt_BR',
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
    sdr: { ...DEFAULT_SETTINGS.sdr, ...(d.sdr || {}) },
    reminder: { ...DEFAULT_SETTINGS.reminder, ...(d.reminder || {}) },
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
    const err = new WaError(502, explainGraphError(e) || `Erro do WhatsApp (${res.status})`)
    err.metaCode = Number(e.code) || 0
    throw err
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

/** Nomes das variáveis na ordem em que aparecem ({{1}}, {{2}} ou {{nome}}), sem repetir. */
function varNamesOf(text) {
  const out = []
  for (const m of String(text || '').matchAll(/\{\{\s*([\w]+)\s*\}\}/g)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

/** Modelos do WABA (cache de 10 min), com cabeçalho, rodapé e botões pra prévia e envio. */
export async function listTemplates({ fresh = false } = {}) {
  if (!fresh && tplCache && tplCache.exp > Date.now()) return tplCache.value
  const cfg = await getWaConfig()
  if (!cfg?.wabaId) return []
  const rows = []
  let path = `${cfg.wabaId}/message_templates?fields=name,language,status,category,components,parameter_format&limit=200`
  for (let page = 0; path && page < 5; page++) {
    const data = await graph(cfg, path)
    rows.push(...(data.data || []))
    const next = data.paging?.next
    path = next ? next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, '') : ''
  }
  const value = rows.map((t) => {
    const comps = t.components || []
    const body = comps.find((c) => c.type === 'BODY')?.text || ''
    const h = comps.find((c) => c.type === 'HEADER')
    const footer = comps.find((c) => c.type === 'FOOTER')?.text || ''
    const btns = comps.find((c) => c.type === 'BUTTONS')?.buttons || []
    const varNames = varNamesOf(body)
    return {
      name: t.name,
      language: t.language,
      status: t.status,
      category: t.category,
      paramFormat: t.parameter_format === 'NAMED' ? 'NAMED' : 'POSITIONAL',
      body,
      vars: varNames.length,
      varNames,
      header: h
        ? {
            format: h.format || 'TEXT',
            text: h.text || '',
            vars: varNamesOf(h.text).length,
            varName: varNamesOf(h.text)[0] || '',
            example: h.example?.header_handle?.[0] || h.example?.header_url?.[0] || '',
          }
        : null,
      footer,
      buttons: btns.map((b) => ({ type: b.type, text: b.text || '', url: b.url || '', phone: b.phone_number || '', urlVar: /\{\{\s*\w+\s*\}\}/.test(b.url || '') })),
    }
  })
  tplCache = { value, exp: Date.now() + 10 * 60_000 }
  return value
}

function renderTemplate(body, params, names) {
  return String(body || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, n) => {
    const i = /^\d+$/.test(n) ? Number(n) - 1 : (names || []).indexOf(n)
    return params[i] ?? ''
  })
}

/**
 * Corpo do envio de um modelo. template = { name, lang, params, headerText?, headerMedia?, buttonParams? }
 * tpl = o modelo da lista (pode faltar: aí manda só o corpo).
 */
function templatePayload(template, tpl) {
  const named = tpl?.paramFormat === 'NAMED'
  const params = (template.params || []).map((p) => String(p ?? '').slice(0, 900))
  const components = []
  const h = tpl?.header
  if (h && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(h.format)) {
    const link = String(template.headerMedia || h.example || '').trim()
    if (!link) throw new WaError(400, `O modelo ${tpl.name} tem ${h.format === 'IMAGE' ? 'imagem' : h.format === 'VIDEO' ? 'vídeo' : 'documento'} no topo: informe o link.`)
    const kind = h.format.toLowerCase()
    components.push({ type: 'header', parameters: [{ type: kind, [kind]: { link } }] })
  } else if (h && h.format === 'TEXT' && h.vars) {
    const text = String(template.headerText || '').trim() || '-'
    components.push({ type: 'header', parameters: [{ type: 'text', text, ...(named ? { parameter_name: h.varName } : {}) }] })
  }
  if (params.length) {
    components.push({ type: 'body', parameters: params.map((t, i) => ({ type: 'text', text: t.trim() || '-', ...(named ? { parameter_name: tpl.varNames[i] } : {}) })) })
  }
  ;(tpl?.buttons || []).forEach((b, i) => {
    if (b.type !== 'URL' || !b.urlVar) return
    const text = String(template.buttonParams?.[i] ?? template.buttonParams?.[String(i)] ?? '').trim()
    if (!text) throw new WaError(400, `O botão "${b.text}" do modelo precisa do final do link.`)
    components.push({ type: 'button', sub_type: 'url', index: String(i), parameters: [{ type: 'text', text }] })
  })
  const shown = tpl
    ? [h?.format === 'TEXT' ? renderTemplate(h.text, [template.headerText || '']) : '', renderTemplate(tpl.body, params, tpl.varNames), tpl.footer]
        .filter((x) => String(x || '').trim())
        .join('\n\n')
    : `[Modelo ${template.name}] ${params.join(' | ')}`
  return { components, shown }
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

const STATUS_LABEL = {
  new: 'Novo Lead',
  contacted: 'Contato Feito',
  meeting_scheduled: 'Reunião Agendada',
  proposal_sent: 'Proposta Enviada',
  negotiation: 'Negociação',
  closed: 'Fechado (virou cliente)',
  lost: 'Perdido',
}

/** Nome da etapa do lead e se ela já é "a equipe está cuidando" (passou da primeira etapa). */
async function leadStage(lead) {
  const st = lead?.status
  if (!st) return { label: '', moved: false }
  if (STATUS_LABEL[st]) return { label: STATUS_LABEL[st], moved: st !== 'new' && st !== 'lost' }
  // Etapa de pipeline criado pelo time (id aleatório).
  const pipes = await listDocs('leadPipelines').catch(() => [])
  for (const p of pipes) {
    const i = (p.stages || []).findIndex((s) => s.id === st)
    if (i >= 0) {
      const s = p.stages[i]
      return { label: `${p.name || 'Pipeline'}: ${s.label}`, moved: i > 0 && s.kind !== 'lost' }
    }
  }
  return { label: '', moved: true }
}

const fmtDate = (v) => {
  const ms = v?._seconds ? v._seconds * 1000 : v?.seconds ? v.seconds * 1000 : msOf(v)
  return ms ? new Intl.DateTimeFormat('pt-BR', { timeZone: SP_TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ms)) : ''
}

/** Cliente da Arrow Shot (coleção clients) com esse número. */
async function findClientByPhone(waId) {
  const key = phoneKey(waId)
  if (!key || key.length < 10) return null
  const rows = await listDocs('clients').catch(() => [])
  return rows.find((c) => c.whatsapp && phoneKey(c.whatsapp) === key) || null
}

/**
 * O contato já tem história com a equipe? Devolve o motivo em texto ('' = não).
 * Cliente (ativo ou antigo), lead que a equipe já mexeu no funil ou com contato registrado.
 */
async function teamRelation(conv) {
  if (conv.kind !== 'lead') return ''
  const client = await findClientByPhone(conv.waId)
  if (client) return client.status === 'churned' ? `ex-cliente da Arrow Shot (${client.companyName || 'sem nome'})` : `cliente da Arrow Shot (${client.companyName || 'sem nome'})`
  if (!conv.leadId) return ''
  const snap = await getDoc(`leads/${conv.leadId}`).catch(() => null)
  if (!snap?.exists) return ''
  const lead = snap.data()
  if (lead.convertedClientId) return 'lead que já virou cliente'
  const stage = await leadStage(lead)
  if (stage.moved) return `lead que a equipe já está atendendo (etapa ${stage.label})`
  if ((lead.contactHistory || []).length) return 'lead com contato da equipe registrado no CRM'
  // Lead que já estava no CRM há dias: a equipe chama todo lead pelo celular, então
  // quase sempre já houve conversa que a IA não vê.
  const created = lead.createdAt?._seconds ? lead.createdAt._seconds * 1000 : msOf(lead.createdAt)
  if (lead.createdBy !== 'whatsapp' && created && Date.now() - created > 3 * 86400_000) return `lead antigo do CRM (desde ${fmtDate(lead.createdAt)}), a equipe provavelmente já falou com ele`
  return ''
}

/** O que o CRM sabe do lead, com etapa e histórico, pro prompt da IA. */
async function crmContextBlock(lead) {
  const lines = [leadContextBlock(lead)]
  const stage = await leadStage(lead)
  if (stage.label) lines.push(`Etapa no funil: ${stage.label}`)
  const since = fmtDate(lead.createdAt)
  if (since) lines.push(`No CRM desde: ${since}${lead.source ? ` (origem: ${lead.source})` : ''}`)
  if (lead.nextAction) lines.push(`Próxima ação anotada: ${lead.nextAction}`)
  const hist = (lead.contactHistory || []).slice(-4)
  if (hist.length) lines.push(`Contatos que a equipe registrou:\n${hist.map((h) => `- ${fmtDate(h.date) || '?'}: ${clip(h.summary, 200)}`).join('\n')}`)
  return lines.join('\n')
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

/**
 * Quem respondeu uma conversa sem card: liga ao lead que já existe com esse número ou
 * cria um Novo Lead. Cliente da agência não vira lead (fica marcado pra não checar de novo).
 */
export async function linkLeadOnReply(waId, name) {
  const lead = await findLeadByPhone(waId)
  if (lead === undefined) return null
  if (lead) {
    await updateDoc(convPath(waId), { leadId: lead.id, leadMatch: 'existing' })
    return lead.id
  }
  if (await findClientByPhone(waId)) {
    await updateDoc(convPath(waId), { leadMatch: 'client' })
    return null
  }
  if (!(await getWaSettings()).autoCreateLead) return null
  const id = await createLeadFromWhatsapp(waId, name)
  await updateDoc(convPath(waId), { leadId: id, leadMatch: 'created' })
  return id
}

/** Garante a conversa e devolve os dados dela. */
export async function ensureConversation(waId, { name = '', kind = 'lead', extra = {}, linkLead = true } = {}) {
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
export async function sendMessage({ to, text, template, by, byName = '', convExtra = {}, kind = 'lead', msgExtra = {} }) {
  const cfg = await getWaConfig()
  if (!cfg) throw new WaError(400, 'O WhatsApp ainda não foi conectado em WhatsApp > Configurações.')
  const target = toE164Digits(to)
  if (target.length < 12) throw new WaError(400, 'Número inválido. Use DDD + número.')

  const existing = await getDoc(convPath(target)).catch(() => ({ exists: false }))
  const conv = existing.exists ? existing.data() : null
  if (conv?.optOut && template && (by === 'broadcast' || by === 'stage')) throw new WaError(400, 'Essa pessoa pediu para não receber mais mensagens (botão Bloquear ou Não quero).')
  if (text && !template && !inWindow(conv)) {
    throw new WaError(409, 'Passou de 24h desde a última mensagem do contato (ou ele nunca chamou). Use uma mensagem de modelo.')
  }

  let body
  let shown
  if (template) {
    const lang = template.lang || 'pt_BR'
    const all = await listTemplates().catch(() => [])
    const tpl = all.find((t) => t.name === template.name && t.language === lang) || all.find((t) => t.name === template.name)
    const built = templatePayload(template, tpl)
    body = {
      messaging_product: 'whatsapp',
      to: target,
      type: 'template',
      template: { name: template.name, language: { code: lang }, ...(built.components.length ? { components: built.components } : {}) },
    }
    shown = built.shown
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
    ...msgExtra,
  })
  const patch = { lastMessageAt: at, lastMessageText: shown.slice(0, 160), lastDirection: 'out', updatedAt: at }
  // Quem respondeu pelo CRM zera o "não lidas".
  if (by !== 'ai' && by !== 'followup' && by !== 'cart' && by !== 'broadcast' && by !== 'stage') patch.unread = 0
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

/** Tipos que não são resposta do contato (não reabrem a conversa nem param o follow-up). */
const NOISE_TYPES = new Set(['reaction', 'revoke', 'edit', 'unsupported', 'system', 'ephemeral'])
/** Mesmo teste pelo texto gravado (conversas antigas). */
const NOISE_TEXT = /^\[(reagiu|reação|revoke|edit|unsupported|system|ephemeral)/

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
      return v.metadata?.phone_number_id === cfg.phoneNumberId && ((v.messages || []).length || (v.statuses || []).length || (v.message_echoes || []).length)
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
        if (s.status === 'failed') {
          patch.error = explainGraphError(s.errors?.[0] || {}) || s.errors?.[0]?.title || 'Falhou'
          patch.errorCode = Number(s.errors?.[0]?.code) || 0
        }
        // Só atualiza mensagem que saiu pelo CRM (o PATCH criaria uma vazia).
        const known = await getDoc(msgPath(waId, s.id)).catch(() => ({ exists: false }))
        if (known.exists) {
          const before = known.data()
          await updateDoc(msgPath(waId, s.id), patch).catch(() => {})
          if (s.status === 'failed' && before.status !== 'failed') {
            await onDeliveryFailed(waId, before, patch.errorCode, s.errors?.[0]?.title || patch.error).catch((e) => console.warn('[whatsapp] aviso de falha:', e.message))
          }
        }
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

        // Reação (👍), mensagem apagada/editada ou tipo que não lemos: fica na conversa,
        // mas não conta como resposta. Senão o follow-up acha que o contato respondeu
        // e nunca sai (caso do 👍 no fim da conversa).
        if (NOISE_TYPES.has(m.type)) {
          const known = await getDoc(convPath(waId)).catch(() => ({ exists: false }))
          if (known.exists) continue
        }

        const conv = await ensureConversation(waId, { name: names[waId] || '' })
        // Conversa que a equipe começou pelo celular e a pessoa respondeu: vira card no funil.
        if (conv.kind === 'lead' && !conv.leadId && !conv.leadMatch) await linkLeadOnReply(waId, names[waId] || conv.name || '').catch((e) => console.warn('[whatsapp] lead na resposta:', e.message))
        const patch = {
          lastMessageAt: at,
          lastMessageText: text.slice(0, 160),
          lastDirection: 'in',
          lastInboundAt: at,
          followUpStep: 0,
          updatedAt: nowIso(),
        }
        if (names[waId] && !conv.name) patch.name = names[waId]
        // Botão "Bloquear" / "Não quero" do modelo: não manda mais disparo nem follow-up, e a IA não responde.
        const optOut = (m.type === 'button' || m.type === 'interactive') && OPT_OUT_TEXT.test(String(text || '').trim())
        if (optOut) Object.assign(patch, { optOut: true, optOutAt: at, followUpStopped: true, aiMode: 'off', handoffReason: 'Pediu para não receber mensagens' })
        await updateDoc(convPath(waId), patch)
        await incrementField(convPath(waId), 'unread', 1).catch(() => {})
        if (conv.lastBroadcastId) await onBroadcastReply(waId).catch((e) => console.warn('[whatsapp] funil do disparo:', e.message))
        if (!optOut) touched.add(waId)
      }

      // Mensagens que a equipe mandou pelo app do WhatsApp no celular (mesmo número,
      // modo coexistência; campo smb_message_echoes no webhook). Entram na conversa
      // e tiram a IA e o follow-up dela: quem respondeu pelo celular assumiu.
      for (const m of v.message_echoes || []) {
        const waId = String(m.to || '').replace(/\D/g, '')
        if (!waId || !m.id) continue
        const at = new Date(Number(m.timestamp || 0) * 1000 || Date.now()).toISOString()
        const text = inboundText(m)
        const fresh = await createDocIfMissing(msgPath(waId, m.id), { direction: 'out', type: m.type, text, at, by: 'phone', byName: 'Celular da Arrow Shot', status: 'sent' })
        if (!fresh) continue
        // Apagar, reagir ou editar pelo celular não é responder: a IA continua.
        if (NOISE_TYPES.has(m.type)) continue
        // Conversa que a equipe começou pelo celular não vira lead novo.
        await ensureConversation(waId, { linkLead: false })
        await updateDoc(convPath(waId), {
          lastMessageAt: at,
          lastMessageText: text.slice(0, 160),
          lastDirection: 'out',
          aiMode: 'off',
          handoffReason: 'A equipe respondeu pelo celular',
          followUpStopped: true,
          unread: 0,
          updatedAt: nowIso(),
        })
        touched.delete(waId)
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

/** Aviso da agenda do Google (reunião marcada, remarcada ou cancelada). */
export async function notifyCalendar(conv, waId, message) {
  await notifyTeam({ ...conv, waId }, message).catch(() => {})
}

/** Aviso no sino + no celular. Texto com o nome primeiro e sem emoji (leitor de tela). */
async function notifyTeam(conv, message, { bell = true, type = 'whatsapp_handoff', actions } = {}) {
  const ids = await staffIds(conv)
  const who = conv.name || conv.phone || prettyPhone(conv.waId)
  if (bell) {
    for (const userId of ids) {
      await setDoc(`notifications/wa_${conv.waId}_${Date.now()}_${userId.slice(0, 6)}`, {
        userId,
        type,
        message,
        actorName: 'WhatsApp',
        entityId: conv.waId,
        read: false,
        createdAt: new Date(),
      }).catch(() => {})
    }
  }
  await sendPushToUsers(ids, { title: `WhatsApp: ${who}`, body: message, url: `/leads?aba=conversas&c=${conv.waId}`, tag: `wa-${conv.waId}`, actions }).catch(() => {})
}

/* ------------------------------- IA ------------------------------- */

let anthropicClient = null
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 40_000, maxRetries: 1 })
  return anthropicClient
}

const WA_STYLE = `Estilo de WhatsApp:
- Português do Brasil, tom humano, simpático e direto, como uma pessoa da equipe digitando no celular. Trate por "você".
- Mensagens curtas. Pode quebrar a resposta em até 3 balões (como gente faz no WhatsApp), cada um com 1 ou 2 frases. Uma pergunta por vez, sempre no último balão.
- Sem markdown (sem títulos, listas longas ou tabelas). *Negrito* do WhatsApp só se ajudar muito. No máximo 1 emoji na conversa toda, e só se combinar.
- Use o primeiro nome da pessoa de vez em quando, não em toda mensagem.
- Nunca diga que é uma IA, robô ou assistente virtual, a não ser que perguntem diretamente; aí seja honesto, diga que é o assistente da equipe e que uma pessoa pode assumir.
- Nunca invente preço, prazo, garantia, resultado ou condição que não esteja nas informações abaixo.
- Áudios chegam transcritos como "[áudio] ...". Imagens e documentos você não vê: se for importante, peça para descrever em texto.`

const HANDOFF_RULES = `Passe para um humano (handoff = true) quando:
- a pessoa pedir para falar com alguém, com o Bruno ou com um atendente;
- for reclamação, cobrança, cancelamento ou problema com serviço já contratado (cliente atual, não lead);
- a pessoa parecer cliente ou alguém que já conversou com a equipe antes (veja "Conversa antiga");
- pedirem algo que você não sabe responder com as informações abaixo;
- a pessoa quiser negociar valores ou fechar agora;
- você tiver qualquer dúvida sobre o que responder ou como seguir (não chute: passe).
Reunião NÃO é motivo para passar: você mesmo propõe e fecha o dia e o horário (pelo link da agenda ou com 2 opções concretas) e continua atendendo depois.
Ao passar, escreva uma resposta curta avisando que já vai chamar alguém da equipe.`

/** Primeira resposta pra um número que o CRM não conhece: pergunta se já é cliente antes de vender. */
const FIRST_TOUCH = `# Primeira resposta desta conversa (importante)
Você ainda não falou com esta pessoa e o CRM não sabe quem ela é. Este número é o mesmo que o BRUNO usa no celular, então pode ser cliente ou alguém que já conversou com ele.
- Se a mensagem dela já deixa claro que é um contato novo (veio do anúncio, "vi o anúncio", "quero saber mais", "quero orçamento", "quanto custa", texto pronto de anúncio): NÃO pergunte se é cliente. Siga a abertura normal.
- Em qualquer outro caso (um "oi", "boa tarde", um nome, algo vago, ou que pareça continuação): cumprimente, se apresente em 1 frase e pergunte de forma leve: "Você já é cliente da Arrow Shot ou já conversou com o Bruno antes?". Não faça outra pergunta junto e não fale do serviço ainda. Use stage "abertura".
- Se pela mensagem já der pra ver que é cliente ou conversa antiga, siga a regra "Conversa antiga" (handoff).`

/** Textos prontos dos nossos links: quem chega com eles é lead novo (não pergunta se é cliente). */
const NEW_LEAD_TEXTS = [
  { re: /quero fazer o diagn[óo]stico da empresa/i, from: 'a landing page (botão "Quero fazer o diagnóstico da empresa")' },
  { re: /quero agendar meu bate.?papo com (o )?consultor/i, from: 'o link do Beacons na bio (botão "Quero agendar meu bate-papo com consultor")' },
]

/** Logo depois de perguntar: a resposta decide se segue como SDR ou passa pro Bruno. */
const CLIENT_ANSWER = `# A pergunta "já é cliente?" foi feita
Na última mensagem você perguntou se a pessoa já é cliente ou já conversou com o Bruno. Leia a resposta:
- SIM (já é cliente, já falou com o Bruno, já tem reunião, já contratou, "sou eu de novo"): responda 1 balão curto ("Perfeito! Já chamo o Bruno pra falar com você.") e passe para a equipe: handoff = true, handoff_reason = "Disse que já é cliente ou já falou com o Bruno".
- NÃO (ou contou do negócio, ou perguntou do serviço): siga como SDR normal, a partir da abertura/descoberta, sem repetir a apresentação.
- Resposta vaga: trate como NÃO e siga, com gentileza.`

/** A equipe começou a conversa (ou passou pra IA): a IA continua de onde o Bruno parou. */
function teamOpenedBlock(meetWith, name) {
  return `# A equipe começou esta conversa e passou para você (vale mais que a regra "Conversa antiga")
Quem puxou o assunto foi o ${meetWith} ou alguém da equipe (mensagens marcadas "[... escreveu:]"). O contato está respondendo a ELES, então é normal ele falar com o ${meetWith}, citar a feira, a reunião ou responder só "sim", "bom dia" ou "pode ser".
- Leia tudo o que a equipe escreveu e continue exatamente de onde parou. Ex.: se o ${meetWith} ofereceu um diagnóstico e a pessoa disse "sim", siga para marcar a reunião.
- Na sua primeira fala, apresente-se rapidinho como ${name ? `${name}, ` : ''}da equipe do ${meetWith} (ex.: "Aqui é ${name ? `o ${name}` : 'da equipe'}, trabalho com o ${meetWith} e vou seguir com você por aqui"). Não repita a apresentação da Arrow Shot que a equipe já fez.
- NÃO pergunte se já é cliente e NÃO passe para a equipe só porque a equipe escreveu antes, porque a pessoa citou o ${meetWith} ou porque a conversa parece continuação. Isso aqui é continuação de propósito.
- Só passe para a equipe nos casos das regras de passar para humano (pedir para falar com uma pessoa, reclamação, negociar valor, fechar agora, dúvida que você não sabe responder).`
}

const SDR_STAGES = ['abertura', 'descoberta', 'qualificacao', 'agendamento', 'agendado', 'nutricao', 'desqualificado']
const SDR_FIELDS = ['nome', 'empresa', 'cidade', 'servico', 'tamanho', 'anuncia', 'investimento', 'objetivo', 'decisor', 'prazo']

function spNowText() {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: SP_TZ, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date())
}

/** O que o SDR já sabe dessa conversa (pra não perguntar de novo). */
/** Reunião já marcada, no texto que a IA lê (a da agenda do Google vale como confirmada). */
function meetingLine(m) {
  if (!m?.agreed) return ''
  const when = m.at ? meetingWhenText(m.at).quando : m.when || 'dia e horário ainda não informados'
  const meet = m.url ? ` Link da reunião: ${m.url}` : ''
  return m.source === 'agenda'
    ? `Reunião JÁ MARCADA pela agenda do Google (confirmada, vale como verdade): ${when} (${m.when || m.at}).${meet} Se a pessoa perguntar, confirme esse dia e horário e o link. Não mande o link da agenda de novo, a não ser que ela queira remarcar.`
    : `Reunião combinada na conversa: ${when}.${meet}`
}

function sdrStateBlock(sdr) {
  if (!sdr) return 'Nada ainda. É o começo da conversa.'
  const p = sdr.profile || {}
  const known = SDR_FIELDS.filter((k) => p[k]).map((k) => `- ${k}: ${p[k]}`)
  return [
    `Etapa atual: ${sdr.stage || 'abertura'}`,
    `Temperatura: ${sdr.temperature || '?'} (nota ${sdr.score ?? '?'})`,
    known.length ? `Já sabemos:\n${known.join('\n')}` : 'Ainda não sabemos nada do negócio.',
    sdr.nextStep ? `Próximo passo combinado: ${sdr.nextStep}` : '',
    meetingLine(sdr.meeting),
  ]
    .filter(Boolean)
    .join('\n')
}

const SDR_JSON = `Responda APENAS com JSON válido, neste formato:
{
  "messages": ["balão 1", "balão 2"],
  "handoff": false,
  "handoff_reason": "",
  "stage": "abertura | descoberta | qualificacao | agendamento | agendado | nutricao | desqualificado",
  "temperature": "quente | morno | frio",
  "score": 0,
  "profile": {"nome": "", "empresa": "", "cidade": "", "servico": "", "tamanho": "", "anuncia": "", "investimento": "", "objetivo": "", "decisor": "", "prazo": ""},
  "summary": "1 ou 2 frases sobre quem é o lead e o que ele quer",
  "next_step": "o que acontece agora (ex.: esperar ele mandar a cidade; reunião quinta 15h)",
  "meeting": {"agreed": false, "when": "", "at": ""}
}
- "messages": 1 a 3 balões curtos. Vazio só se não houver nada a dizer.
- "profile": preencha só o que a pessoa disse (ou o que já sabíamos). Não invente. Deixe "" o que não sabe.
- "score": 0 a 100 = chance de virar cliente bom (perfil + dor + verba + decisor + urgência).
- "meeting.agreed": true só quando a pessoa topou um dia e horário (ou disse que já marcou pelo link). "when" = o dia e horário em texto. "at" = data e hora exatas no formato AAAA-MM-DDTHH:MM (horário de Brasília), só quando dia E hora estão definidos; senão "". Se remarcar, atualize "at".`

/** Mesmo formato do SDR_JSON, cobrado pela API: a IA não consegue devolver nada fora dele. */
const SDR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['messages', 'handoff', 'handoff_reason', 'stage', 'temperature', 'score', 'profile', 'summary', 'next_step', 'meeting'],
  properties: {
    messages: { type: 'array', items: { type: 'string' } },
    handoff: { type: 'boolean' },
    handoff_reason: { type: 'string' },
    stage: { type: 'string', enum: SDR_STAGES },
    temperature: { type: 'string', enum: ['quente', 'morno', 'frio'] },
    score: { type: 'integer' },
    profile: {
      type: 'object',
      additionalProperties: false,
      required: SDR_FIELDS,
      properties: Object.fromEntries(SDR_FIELDS.map((k) => [k, { type: 'string' }])),
    },
    summary: { type: 'string' },
    next_step: { type: 'string' },
    meeting: {
      type: 'object',
      additionalProperties: false,
      required: ['agreed', 'when', 'at'],
      properties: { agreed: { type: 'boolean' }, when: { type: 'string' }, at: { type: 'string' } },
    },
  },
}

/** Chama a IA com a resposta travada no formato do SDR. Se a API recusar o formato, chama sem ele. */
async function askAiJson(params) {
  const ai = anthropic()
  try {
    return await ai.messages.create({ ...params, output_config: { format: { type: 'json_schema', schema: SDR_SCHEMA } } })
  } catch (e) {
    if (!(e instanceof Anthropic.BadRequestError)) throw e
    console.warn('[whatsapp] formato travado recusado pela API, seguindo sem ele:', e.message)
    return ai.messages.create(params)
  }
}

const textOf = (res) => res.content.filter((b) => b.type === 'text').map((b) => b.text).join('')

function leadSystemPrompt(baseVendasText, settings, conv) {
  const sdr = settings.sdr || {}
  const who = sdr.name ? `Você se chama ${sdr.name} e é` : 'Você é'
  const meetWith = sdr.meetingWith || 'Bruno'
  const meeting = sdr.meetingLink
    ? `Para agendar, mande o link da agenda: ${sdr.meetingLink} (a pessoa escolhe um horário livre lá). Você NÃO vê a agenda do ${sdr.meetingWith || 'Bruno'}: nunca ofereça nem confirme dia e horário por aqui, nem quando a pessoa pedir um horário específico. Nesse caso diga que pelo link ela vê na hora se está livre. Só marque meeting.agreed = true quando ela disser que agendou pelo link (e, se ela contar o horário, grave em meeting.at).`
    : `Não há link de agenda: ofereça 2 opções de horário concretas (dentro de ${sdr.meetingHours || 'horário comercial'}), a partir de amanhã, e deixe a pessoa escolher. Quando ela topar, marque meeting.agreed = true.`
  const today = new Intl.DateTimeFormat('pt-BR', { timeZone: SP_TZ, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date())
  return `Agora é ${today} (horário de Brasília). Use isso para propor e confirmar dias e horários.

${who} SDR (pré-vendas) da Arrow Shot no WhatsApp. A Arrow Shot é uma agência de marketing digital (tráfego pago no Meta e no Google, social media e landing pages) especializada em empresas de limpeza e facilities no Brasil, e que também atende empresas de outros ramos.

# Sua missão
Transformar quem chama em uma reunião de diagnóstico (${sdr.meetingLength || '30 minutos'}, online) com o ${meetWith}. Você nunca descarta um contato: empresa de qualquer ramo é cliente em potencial, e na dúvida você passa para a equipe. Você não vende o serviço no WhatsApp: você desperta interesse, qualifica e agenda. Rápido, sem parecer formulário e sem empurrar.

# Como você conduz (etapas)
1. abertura: cumprimente, agradeça o contato e faça UMA pergunta aberta sobre o negócio da pessoa ("me conta um pouco da sua empresa: vocês fazem limpeza de quê?"). Se veio de anúncio ou formulário, use o que o CRM já sabe.
2. descoberta: entenda a dor. Perguntas boas, uma por vez: que tipo de limpeza (residencial, pós-obra, empresarial, condomínio, estofados...), cidade/região que atende, como chegam os clientes hoje, se já anuncia (onde e se funcionou), quantos clientes novos quer por mês. Reaja ao que a pessoa conta (mostre que entendeu) antes da próxima pergunta.
3. qualificacao: confirme o que falta do perfil, sem interrogatório: tamanho (equipe ou faturamento aproximado), verba para anúncios por mês (pergunte com faixa: "vocês pensam em investir mais perto de 1 mil, 3 mil ou acima de 5 mil por mês em anúncio?"), quem decide e para quando quer começar.
4. agendamento: você fecha o horário, nunca diga que "a equipe vai te chamar com o horário". ${sdr.meetingLink ? 'Com link de agenda, NUNCA invente horário: os horários livres estão só no link. Se a pessoa disser só o período ("amanhã de manhã"), mande o link pra ela escolher um horário livre nesse período. ' : 'Se a pessoa disser só o período ("amanhã de manhã"), ofereça 2 horários concretos dentro dele. '}Quando já tem dor + perfil razoável (não precisa de tudo), proponha a reunião mostrando o ganho para a pessoa ("na reunião o ${meetWith} olha a sua região e mostra quanto custa trazer cliente aí"). ${meeting}
5. agendado: confirme dia e horário e diga que ela recebe o lembrete. Depois disso continue atendendo: tire dúvidas sobre a reunião e sobre a Arrow Shot, remarque se ela pedir. Não faça mais perguntas de qualificação.
- nutricao: tem perfil mas não é o momento (sem verba agora, "só pesquisando", "depois do fim do ano"). Seja gentil, deixe a porta aberta, ofereça falar mais pra frente.
- desqualificado: use só para quem claramente não é cliente (quer emprego, quer vender algo para a Arrow Shot). Mesmo assim NUNCA encerre nem dispense: responda com educação, diga que vai repassar para a equipe e passe para um humano (handoff = true).
- Empresa de qualquer ramo é cliente em potencial, mesmo fora de limpeza (fábrica, indústria, distribuidor, comércio, outro serviço). NUNCA diga que a Arrow Shot só atende limpeza, que não atende o ramo dela, nem deseje sorte na busca. Conduza igual a qualquer lead: entenda o que ela precisa (redes sociais, anúncios, materiais, site), adapte as perguntas ao negócio dela e convide para a reunião com o ${meetWith}.

# Regras de SDR
- Pule etapas quando a pessoa já deu a informação. Nunca pergunte algo que já está em "O que já sabemos".
- Se a pessoa chegar pedindo preço: diga que depende da região e do objetivo, dê faixa SÓ se estiver na Base de Vendas, e puxe para a reunião ("pra te passar um número certo, o ${meetWith} precisa ver sua região; posso marcar ${sdr.meetingLength || '30 minutos'}?").
- Objeções comuns:
  * "tá caro" / "não tenho verba": pergunte quanto vale um cliente novo para a empresa; lembre que a reunião é gratuita e sem compromisso.
  * "já tenho agência" / "já faço sozinho": pergunte como está o resultado e quanto paga por cliente; ofereça um diagnóstico para comparar.
  * "manda uma proposta por aqui": explique que a proposta é montada para a região dela e que na reunião o ${meetWith} mostra tudo; ${sdr.meetingLink ? 'mande o link da agenda.' : 'ofereça horário.'}
  * "vou pensar": pergunte o que falta para decidir; se for momento, vá para nutricao.
- Se a pessoa sumir e voltar, retome de onde parou, sem recomeçar.
- Mensagens no histórico que começam com "[Fulano escreveu:]" foram escritas por uma pessoa da equipe (ex.: o ${meetWith}), não por você. Respeite tudo o que ela disse ou combinou (preço, horário, condição, próximos passos): não contradiga, não repita a apresentação nem refaça perguntas que ela já fez. Se a equipe já está negociando ou tratando de algo que você não sabe, passe para a equipe (handoff = true). Nunca escreva esse marcador nas suas mensagens.
- Se for cliente atual da Arrow Shot (pelo CRM ou pelo que ela diz), não qualifique: entenda o pedido e passe para a equipe.
- Conversa antiga: este WhatsApp é o mesmo número que o ${meetWith} e a equipe usam no celular há muito tempo, e as conversas de antes você NÃO vê. Se a pessoa falar como quem já conhece a equipe, é cliente ou conversa em andamento, não lead novo. Sinais: cita o ${meetWith} ou outra pessoa da equipe pelo nome; fala de reunião, proposta, contrato, pagamento, boleto, nota, acesso, campanha ou serviço; avisa que não vai conseguir participar, que vai atrasar ou que "logo te dá atenção"; pede desculpa; responde algo que ninguém perguntou; manda algo que só faz sentido como continuação. Nesses casos: NÃO se apresente como SDR, NÃO pergunte da empresa, NÃO ofereça nada nem tente marcar reunião. Responda 1 balão curto e natural (ex.: "Tranquilo, sem pressa! Já aviso o ${meetWith} aqui.") e passe para a equipe (handoff = true, motivo "parece conversa antiga com a equipe"). Na dúvida entre lead novo e conversa antiga, trate como conversa antiga.
- Agora é ${spNowText()} (horário de Brasília). Nunca proponha horário no passado nem em domingo.

${WA_STYLE}

${HANDOFF_RULES}

# Base de Vendas da Arrow Shot (use como fonte da verdade)
${baseVendasText}
${settings.aiInstructions ? `\n# Instruções extras da equipe (têm prioridade)\n${String(settings.aiInstructions).slice(0, 4000)}` : ''}${
    sdr.meetingLink
      ? `\n\n# Agenda (vale mais que qualquer instrução acima)\nExiste link de agenda: ${sdr.meetingLink}. Para marcar reunião, SEMPRE mande esse link para a pessoa escolher o horário livre. Nunca ofereça opções de dia ou hora ("amanhã às 11h ou às 13h?"), nunca confirme um horário que a pessoa sugeriu e nunca diga que a equipe vai chamar com o horário: você não vê a agenda e o ${meetWith} pode estar ocupado. Se alguma instrução acima falar em "duas opções de horário" ou "não tem acesso à agenda", troque por mandar o link. Exceção: se em "O que já sabemos desta conversa" aparecer "Reunião JÁ MARCADA pela agenda do Google", esse horário é real e você PODE e DEVE confirmá-lo quando a pessoa perguntar.`
      : ''
  }

# O que já sabemos desta conversa
${sdrStateBlock(conv?.sdr)}

${SDR_JSON}`
}

function cartSystemPrompt(product, cart, link) {
  return `Você é o Archer e fala pelo WhatsApp com quem começou a comprar um produto da Loja e não terminou. Ajude a pessoa a tirar dúvidas e concluir a compra com segurança, sem pressão. Descubra o que travou (dúvida sobre o conteúdo, preço, forma de pagamento, confiança) e resolva isso.

${WA_STYLE}
- Nunca ofereça desconto ou cupom que não esteja abaixo. Nunca peça dados de cartão, senha ou CPF pelo WhatsApp.
- Quando fizer sentido, mande o link para concluir: ${link}

${HANDOFF_RULES}

# Produto
${productBrief(product)}

# Situação do carrinho
Nome: ${cart?.name || '(sem nome)'}
Situação: ${cart ? situationOf(cart) : 'desconhecida'}

Responda APENAS com JSON: {"messages": ["balão 1"], "handoff": false, "handoff_reason": "", "stage": "agendamento", "temperature": "quente | morno | frio", "score": 0, "profile": {"nome": ""}, "summary": "o que travou a compra", "next_step": "", "meeting": {"agreed": false, "when": "", "at": ""}}`
}

/** Histórico em turnos alternados user/assistant pra IA. */
const AUTO_SENDERS = new Set(['ai', 'followup', 'reminder', 'cart'])

/** Quem da equipe escreveu (mensagem que não saiu da IA nem de automação). */
function staffAuthor(m) {
  if (m.direction !== 'out' || AUTO_SENDERS.has(m.by)) return ''
  if (m.by === 'phone') return 'Bruno, pelo celular'
  if (m.by === 'broadcast') return 'Disparo em massa da equipe (mensagem de modelo)'
  if (m.by === 'stage') return 'Mensagem automática da etapa do funil (modelo da equipe)'
  return m.byName ? `${m.byName}, da equipe` : 'equipe'
}

function toTurns(msgs) {
  const turns = []
  for (const m of msgs) {
    const role = m.direction === 'in' ? 'user' : 'assistant'
    const who = staffAuthor(m)
    // Mensagem de pessoa da equipe vai marcada: a IA sabe que não foi ela e respeita o combinado.
    const content = (who ? `[${who} escreveu:] ` : '') + String(m.text || '').trim()
    if (!content) continue
    const last = turns[turns.length - 1]
    if (last && last.role === role) last.content += `\n${content}`
    else turns.push({ role, content })
  }
  // A conversa começou com mensagem da equipe (ex.: o Bruno chamou primeiro pelo celular).
  // A API pede que o 1º turno seja do contato, então entra um aviso antes, em vez de
  // jogar fora a abertura (sem ela a IA não entendia a que o contato estava respondendo).
  if (turns.length && turns[0].role !== 'user') turns.unshift({ role: 'user', content: '[Começo da conversa: quem mandou a primeira mensagem foi a equipe, logo abaixo. O contato está respondendo a ela.]' })
  return turns
}

const clip = (v, n = 160) => String(v ?? '').trim().slice(0, n)

/** Lê o JSON da IA. Aceita o formato antigo ({reply}) e o do SDR ({messages, ...}). */
function parseAiJson(text) {
  try {
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    const asked = Array.isArray(j.messages) ? j.messages : j.reply ? [j.reply] : []
    const messages = asked.map((m) => String(m || '').trim().replace(/^\[[^\]]{0,60}escreveu:\]\s*/, '')).filter((m) => m && !/^[{[<]|"messages"\s*:/.test(m)).slice(0, 3)
    // A IA escreveu balões, mas todos eram código: resposta quebrada, não silêncio de propósito.
    const broken = asked.some((m) => String(m || '').trim()) && !messages.length
    let sdr = null
    if (j.stage || j.profile || j.summary) {
      const profile = {}
      for (const k of SDR_FIELDS) if (j.profile?.[k]) profile[k] = clip(j.profile[k])
      sdr = {
        stage: SDR_STAGES.includes(j.stage) ? j.stage : null,
        temperature: ['quente', 'morno', 'frio'].includes(j.temperature) ? j.temperature : null,
        score: j.score != null && Number.isFinite(Number(j.score)) ? Math.max(0, Math.min(100, Math.round(Number(j.score)))) : null,
        profile,
        summary: clip(j.summary, 400),
        nextStep: clip(j.next_step, 200),
        meeting: { agreed: j.meeting?.agreed === true, when: clip(j.meeting?.when, 120), at: validMeetingAt(j.meeting?.at) },
      }
    }
    return { messages, reply: messages.join('\n\n'), handoff: j.handoff === true, reason: clip(j.handoff_reason, 200), sdr, broken }
  } catch {
    const raw = String(text || '')
    console.warn('[whatsapp] resposta da IA fora do formato:', raw.slice(0, 300))
    // JSON cortado ou com lixo antes: salva só os balões, se der pra ler.
    const m = raw.match(/"messages"\s*:\s*(\[[\s\S]*?\])/)
    if (m) {
      try {
        const messages = JSON.parse(m[1]).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 3)
        const handoff = /"handoff"\s*:\s*true/.test(raw)
        const reason = clip((raw.match(/"handoff_reason"\s*:\s*"([^"]*)"/) || [])[1] || '', 200)
        return { messages, reply: messages.join('\n\n'), handoff, reason, sdr: null, broken: !messages.length && !handoff }
      } catch {
        /* segue */
      }
    }
    // Texto puro vira balão; qualquer coisa com cara de código nunca vai pro cliente.
    const clean = raw.replace(/<[^>]*>/g, '').trim()
    const reply = /[{}<>]|"messages"/.test(clean) ? '' : clean
    // Nada aproveitável (ex.: "<invoke ...>" repetido): conta como resposta quebrada.
    return { messages: reply ? [reply] : [], reply, handoff: false, reason: '', sdr: null, broken: !reply }
  }
}

/** "2026-10-30T09:00" válido ou "". */
function validMeetingAt(v) {
  const s = String(v || '').trim().slice(0, 16)
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) && !Number.isNaN(meetingTime(s)) ? s : ''
}
/** Horário de Brasília (sem horário de verão) em milissegundos. */
const meetingTime = (at) => new Date(`${at}:00-03:00`).getTime()

/** Junta a análise nova com a que já tinha (campo vazio não apaga o que já sabíamos). */
function mergeSdr(prev, next) {
  if (!next) return null
  const p = prev || {}
  return {
    stage: next.stage || p.stage || 'abertura',
    temperature: next.temperature || p.temperature || 'morno',
    score: next.score ?? p.score ?? 0,
    profile: { ...(p.profile || {}), ...next.profile },
    summary: next.summary || p.summary || '',
    nextStep: next.nextStep || p.nextStep || '',
    // Reunião vinda da agenda do Google manda: a IA não sobrescreve (só a agenda muda ou cancela).
    meeting:
      p.meeting?.source === 'agenda' && p.meeting?.agreed
        ? p.meeting
        : next.meeting?.agreed
          ? { ...(p.meeting || {}), ...next.meeting, at: next.meeting.at || p.meeting?.at || '' }
          : p.meeting || { agreed: false, when: '', at: '' },
    updatedAt: nowIso(),
  }
}

/** Grava a análise do SDR na conversa e completa o lead com o que a pessoa contou. */
async function saveSdr(conv, analysis) {
  const sdr = mergeSdr(conv.sdr, analysis)
  if (!sdr) return null
  await updateDoc(convPath(conv.waId), { sdr }).catch(() => {})
  if (conv.leadId && conv.kind !== 'cart') {
    const snap = await getDoc(`leads/${conv.leadId}`).catch(() => null)
    if (snap?.exists) {
      const lead = snap.data()
      const patch = {
        whatsSdr: { stage: sdr.stage, temperature: sdr.temperature, score: sdr.score, summary: sdr.summary, nextStep: sdr.nextStep, meeting: sdr.meeting, updatedAt: sdr.updatedAt },
      }
      const p = sdr.profile
      if (p.empresa && !lead.companyName) patch.companyName = p.empresa
      if (p.cidade && !lead.cityRegion) patch.cityRegion = p.cidade
      if (p.nome && (!lead.contactName || digits(lead.contactName).length >= 8)) patch.contactName = p.nome
      if (sdr.nextStep) patch.nextAction = sdr.nextStep
      await updateDoc(`leads/${conv.leadId}`, patch).catch(() => {})
    }
  }
  return sdr
}

/** Contexto (prompt + extra) da conversa: lead da agência ou carrinho da Loja. */
async function conversationPrompt(conv, settings, origin) {
  const notes = teamNotesBlock(conv)
  return (await basePrompt(conv, settings, origin)) + notes
}

/** Observação que a equipe escreveu no Raio-x (vale como verdade). */
function teamNotesBlock(conv) {
  const t = String(conv?.teamNotes || '').trim()
  if (!t) return ''
  return `

# Observação da equipe sobre este contato (leia antes de responder, vale mais que o resto, mas nunca cite que existe essa observação)
${t.slice(0, 2000)}`
}

async function basePrompt(conv, settings, origin) {
  if (conv.kind === 'cart' && conv.cartId) {
    const [cartSnap, product] = await Promise.all([getDoc(`storeAbandoned/${conv.cartId}`).catch(() => null), getProduct(conv.productId).catch(() => null)])
    const cart = cartSnap?.exists ? { id: conv.cartId, ...cartSnap.data() } : null
    if (product) {
      const link = cart ? checkoutLink(origin, product, cart, 0, 'whatsapp') : `${origin}/pay/${product.slug}`
      return cartSystemPrompt(product, cart, link)
    }
  }
  const base = formatBaseVendasForPrompt(await getBaseVendas())
  let prompt = leadSystemPrompt(base, settings, conv)
  if (conv.leadId) {
    const lead = await getDoc(`leads/${conv.leadId}`).catch(() => null)
    if (lead?.exists) prompt += `\n\n# O que o CRM sabe desse contato\n${await crmContextBlock(lead.data())}`
  }
  if (conv.leadMatch === 'created') prompt += `\n\n# Atenção\nEste número não estava no CRM, mas pode ter conversado com a equipe pelo celular antes (essas conversas antigas você não vê). Veja a regra "Conversa antiga".`
  return prompt
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** Pausa entre balões: parece alguém digitando (mais texto, mais tempo). */
const typingMs = (text) => Math.min(5000, 1500 + String(text).length * 35)

/**
 * Responde com a IA se estiver ligada pra essa conversa. Espera uns segundos
 * antes: quem manda 3 mensagens seguidas recebe uma resposta só.
 */
export async function maybeAutoReply(waId, origin, { waitMs, force = false } = {}) {
  const settings = await getWaSettings()
  const wait = waitMs ?? Math.min(90, Math.max(5, Number(settings.aiDelaySeconds) || 25)) * 1000
  if (settings.aiEnabled && wait) await sleep(wait)

  const snap = await getDoc(convPath(waId))
  if (!snap.exists) return { skipped: 'sem conversa' }
  const conv = { waId, ...snap.data() }
  if (!settings.aiEnabled || conv.aiMode === 'off') {
    if (settings.notifyEveryMessage) await notifyTeam(conv, `${conv.name || conv.phone} mandou: ${conv.lastMessageText || 'mensagem nova'}`, { bell: false })
    return { skipped: 'humano atendendo' }
  }
  if (conv.lastDirection !== 'in' && !force) return { skipped: 'já respondida' }

  const recent = (await queryRecent(convPath(waId), 'messages', 'at', 30)).reverse()
  const lastIn = [...recent].reverse().find((m) => m.direction === 'in' && !NOISE_TYPES.has(m.type))
  if (!lastIn) return { skipped: 'sem mensagem' }
  // Passada pra IA, mas quem falou por último foi a equipe: não atropela, o follow-up retoma depois.
  if (force) {
    const lastReal = [...recent].reverse().find((m) => !NOISE_TYPES.has(m.type))
    if (lastReal?.direction === 'out' && staffAuthor(lastReal)) return { skipped: 'a equipe falou por último' }
  }

  // Quem já é cliente ou já está com a equipe não recebe o SDR: a IA não responde
  // e avisa a equipe. Só vale antes da IA falar nessa conversa.
  if (settings.skipKnownContacts !== false && conv.kind === 'lead' && !conv.knownContactOverride && !recent.some((m) => m.by === 'ai')) {
    const rel = await teamRelation(conv).catch(() => '')
    if (rel) {
      await updateDoc(convPath(waId), { aiMode: 'off', handoffReason: `A IA não respondeu: é ${rel}`, handoffAt: nowIso(), knownContact: rel })
      await notifyTeam(conv, `${conv.name || conv.phone} mandou mensagem no WhatsApp. É ${rel}, então a IA não respondeu. Responda você.`)
      return { skipped: 'contato da equipe', relation: rel }
    }
  }

  // Outra chamada do webhook mais nova cuida da resposta.
  if (!force && new Date(conv.lastInboundAt).getTime() > new Date(lastIn.at).getTime() + 1000) return { skipped: 'mais nova a caminho' }
  // Trava: uma resposta por mensagem recebida, mesmo com dois webhooks juntos.
  // A forçada (equipe passou a conversa) usa a mesma trava: senão a varredura de 5 min
  // e o "Passar pro Jonas" respondem juntos e saem mensagens em dobro.
  const lockPath = `waLocks/${waId}_${lastIn.id.slice(-40).replace(/[^\w-]/g, '')}`
  if (!(await takeLock(lockPath))) return { skipped: 'em andamento' }
  try {
    const out = await autoReplyLocked(waId, origin, settings, conv, recent, { force })
    // Fica travada se a IA respondeu ou escolheu ficar quieta; senão a próxima tentativa
    // (a varredura de 5 min) pode responder.
    if (out.replied || out.quiet) await updateDoc(lockPath, { done: true }).catch(() => {})
    else await deleteDoc(lockPath).catch(() => {})
    if (out.failed) await registerAiFailure(conv, out.failed)
    return out
  } catch (e) {
    await deleteDoc(lockPath).catch(() => {})
    await registerAiFailure(conv, errorText(e))
    throw e
  }
}

const AI_MAX_FAILS = 3
/** Conta as falhas da IA na mesma mensagem do contato; na 2ª avisa a equipe. */
async function registerAiFailure(conv, reason) {
  const same = conv.aiFail?.inboundAt === conv.lastInboundAt
  const count = (same ? Number(conv.aiFail.count) || 0 : 0) + 1
  await updateDoc(convPath(conv.waId), { aiFail: { inboundAt: conv.lastInboundAt || '', count, reason: clip(reason, 200), at: nowIso() } }).catch(() => {})
  console.warn(`[whatsapp] IA não respondeu ${conv.waId} (falha ${count}): ${reason}`)
  if (count === 2) {
    await notifyTeam(conv, `${conv.name || conv.phone} está esperando resposta no WhatsApp. A IA não conseguiu responder (${clip(reason, 120)}). Responda pelo CRM.`)
  }
}

function errorText(err) {
  const apiMsg = err?.error?.error?.message || err?.error?.message
  const st = err?.status ? ` (${err.status})` : ''
  return String(apiMsg || err?.message || 'erro desconhecido').slice(0, 200) + st
}

/**
 * Rede de segurança da varredura: contato que falou por último há mais de 2 min (e menos de 1 h),
 * com a IA ligada e sem resposta, recebe a resposta agora. Desiste depois de 3 falhas
 * na mesma mensagem (a equipe já foi avisada na 2ª).
 */
export async function runPendingReplies(origin, { max = 4, budgetMs = 60_000 } = {}) {
  const settings = await getWaSettings()
  if (!settings.aiEnabled || !anthropic()) return { skipped: 'IA desligada' }
  const started = Date.now()
  const minAge = Math.max(2 * 60_000, ((Number(settings.aiDelaySeconds) || 25) + 60) * 1000)
  const convs = await queryDocs('waConversations', [['lastDirection', 'in']])
  const due = convs
    .filter((c) => c.aiMode !== 'off' && c.lastInboundAt)
    .filter((c) => {
      const age = started - new Date(c.lastInboundAt).getTime()
      return age > minAge && age < 60 * 60_000
    })
    .filter((c) => !NOISE_TEXT.test(String(c.lastMessageText || '')))
    .filter((c) => !(c.aiFail?.inboundAt === c.lastInboundAt && Number(c.aiFail.count) >= AI_MAX_FAILS))
    .sort((a, b) => String(a.lastInboundAt).localeCompare(String(b.lastInboundAt)))
  const results = []
  for (const c of due.slice(0, max)) {
    if (Date.now() - started > budgetMs) break
    const waId = c.waId || c.id
    const out = await maybeAutoReply(waId, origin, { waitMs: 0 }).catch((e) => ({ error: e.message }))
    results.push({ waId, ...out })
  }
  return { pending: due.length, results }
}

const LOCK_STALE_MS = 2 * 60_000
/** Pega a trava. Trava antiga sem resposta (a tentativa caiu no meio) é reaproveitada. */
async function takeLock(path) {
  if (await createDocIfMissing(path, { at: nowIso() })) return true
  const cur = await getDoc(path).catch(() => null)
  const d = cur?.exists ? cur.data() : null
  if (d && (d.done || Date.now() - new Date(d.at).getTime() < LOCK_STALE_MS)) return false
  await setDoc(path, { at: nowIso() })
  return true
}

async function autoReplyLocked(waId, origin, settings, conv, recent, { force = false } = {}) {
  const ai = anthropic()
  if (!ai) return { skipped: 'sem chave da IA' }
  if (!(await rateLimit('wa-ai-day', AI_DAILY_LIMIT, 24 * 3600_000))) {
    await notifyTeam(conv, `${conv.name || conv.phone} está esperando resposta. A IA do WhatsApp chegou no limite do dia.`)
    return { skipped: 'limite diário' }
  }

  const turns = toTurns(recent)
  if (!turns.length) return { skipped: 'sem turnos' }
  // Equipe passou a conversa e a última fala é nossa (ex.: a IA tinha chamado o Bruno): retoma.
  if (force && turns[turns.length - 1].role === 'assistant') {
    turns.push({ role: 'user', content: '[Instrução interna, não é o contato falando] A equipe passou esta conversa para você agora. Se a última mensagem nossa dizia que ia chamar alguém da equipe, ignore isso e continue a conversa de onde o contato parou, respondendo ao que ele disse. Não peça desculpa nem explique a troca.' })
  }
  let system = await conversationPrompt(conv, settings, origin)
  // Respondeu a um disparo em massa: a IA precisa saber o que foi mandado
  // (o histórico dela começa na 1ª fala do contato e cortaria essa mensagem).
  const lastBc = [...recent].reverse().find((m) => m.direction === 'out' && m.by === 'broadcast')
  if (lastBc) system += `\n\n# Disparo da equipe\nA equipe mandou esta mensagem para a pessoa (disparo em massa, ${fmtDate(lastBc.at) || 'recente'}):\n"""${clip(lastBc.text, 1200)}"""\nEla respondeu a isso. Continue a conversa a partir do que a mensagem dizia, sem repetir a mensagem e sem perguntar se já é cliente.`
  // A equipe abriu a conversa (Bruno chamou primeiro) ou passou a conversa pra IA.
  const firstReal = recent.find((m) => !NOISE_TYPES.has(m.type))
  const teamOpened = conv.kind === 'lead' && (Boolean(conv.aiTakeover) || (recent.length < 30 && firstReal?.direction === 'out' && Boolean(staffAuthor(firstReal))))
  if (teamOpened) system += `

${teamOpenedBlock(settings.sdr?.meetingWith || 'Bruno', settings.sdr?.name || '')}`
  // Número que o CRM não conhecia: antes de vender, pergunta se já é cliente.
  if (conv.kind === 'lead' && conv.leadMatch !== 'existing' && !teamOpened) {
    const ours = recent.filter((m) => m.direction === 'out')
    const lastOurs = ours[ours.length - 1]
    const firstIn = recent.find((m) => m.direction === 'in' && !NOISE_TYPES.has(m.type))
    const fromLink = NEW_LEAD_TEXTS.find((t) => t.re.test(firstIn?.text || ''))
    if (fromLink) {
      if (!ours.length) system += `\n\n# Origem do contato\nEsta pessoa chegou por ${fromLink.from}. É lead novo: NÃO pergunte se já é cliente. Siga a abertura normal do SDR, mostrando que entendeu o que ela pediu (o diagnóstico ou o bate-papo com o Bruno).`
    } else if (!ours.length) system += `\n\n${FIRST_TOUCH}`
    else if (lastOurs?.by === 'ai' && ours.filter((m) => m.by === 'ai').length <= 3 && /j[áa] (é|e) client|j[áa] conversou com o|j[áa] falou com o/i.test(lastOurs.text || '')) system += `\n\n${CLIENT_ANSWER}`
  }
  // Até 2 tentativas: resposta quebrada ou erro passageiro da API não deixa o contato sem resposta.
  let parsed = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await askAiJson({
        model: MODEL,
        max_tokens: 2500,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: turns,
      })
      parsed = parseAiJson(textOf(res))
      if (!parsed.broken) break
      console.warn(`[whatsapp] resposta da IA quebrada (tentativa ${attempt}, ${res.stop_reason})`)
    } catch (e) {
      if (attempt === 2) throw e
      console.warn('[whatsapp] IA falhou, tentando de novo:', e.message)
    }
  }
  if (!parsed || parsed.broken) return { failed: 'a resposta da IA veio quebrada duas vezes' }
  const { messages, handoff, reason, sdr: analysis } = parsed

  // Equipe assumiu, ou o contato mandou mensagem nova (aí a próxima chamada responde tudo junto).
  const stillMine = async () => {
    const now = await getDoc(convPath(waId))
    if (!now.exists) return false
    const d = now.data()
    return d.aiMode !== 'off' && d.lastInboundAt === conv.lastInboundAt
  }
  if (!(await stillMine())) return { skipped: 'humano assumiu' }

  const byName = settings.sdr?.name ? `${settings.sdr.name} (IA)` : 'IA'
  let sent = 0
  for (let i = 0; i < messages.length; i++) {
    if (i > 0) {
      await sleep(typingMs(messages[i]))
      if (!(await stillMine())) break
    }
    await sendMessage({ to: waId, text: messages[i], by: 'ai', byName })
    sent++
  }

  const prev = conv.sdr || null
  const sdr = await saveSdr(conv, analysis)
  const who = conv.name || conv.phone
  const handed = handoff
  const why = reason
  // Reunião combinada: a IA continua na conversa, só avisa a equipe.
  const newMeeting = sdr?.meeting?.agreed && !prev?.meeting?.agreed
  if (handed) {
    await updateDoc(convPath(waId), { aiMode: 'off', handoffReason: why || 'A IA pediu ajuda', handoffAt: nowIso() })
    // Resposta automática de outra empresa não precisa de ninguém agora: fica na conversa, sem aviso.
    if (!/autom[áa]tic|mensagem padr|bot d[ae]|fora do hor[áa]rio/i.test(why || '')) {
      await notifyTeam(conv, `${who} precisa de atendimento humano no WhatsApp. Motivo: ${why || 'a IA pediu ajuda'}.`)
    }
  } else if (newMeeting && !settings.sdr?.meetingLink) {
    // Com link de agenda, o aviso certo (com dia e hora) vem da própria agenda do Google.
    await notifyTeam(conv, `${who} marcou reunião pelo WhatsApp: ${sdr.meeting.when || 'ver conversa'}. Confirmar na agenda.`)
  } else if (sdr?.temperature === 'quente' && prev?.temperature !== 'quente') {
    await notifyTeam(conv, `${who} está quente no WhatsApp, nota ${sdr.score}. ${sdr.summary}`)
  }
  // Sem balões de propósito (ex.: o contato só disse "ok"): a IA decidiu ficar quieta.
  // Marca pra o follow-up saber que a bola está com o contato.
  if (!messages.length && !handed) await updateDoc(convPath(waId), { aiQuietFor: conv.lastInboundAt || '' }).catch(() => {})
  return { replied: sent > 0, quiet: !messages.length, handoff: handed, stage: sdr?.stage || null }
}

/** Refaz a análise do SDR lendo a conversa inteira, sem mandar nada (botão "Atualizar análise"). */
export async function analyzeConversation(waId, origin) {
  const ai = anthropic()
  if (!ai) throw new WaError(400, 'A chave da IA não está configurada.')
  const snap = await getDoc(convPath(waId))
  if (!snap.exists) throw new WaError(404, 'Conversa não encontrada.')
  const conv = { waId, ...snap.data() }
  if (!(await rateLimit('wa-ai-day', AI_DAILY_LIMIT, 24 * 3600_000))) throw new WaError(429, 'A IA chegou no limite do dia.')
  const settings = await getWaSettings()
  const recent = (await queryRecent(convPath(waId), 'messages', 'at', 60)).reverse()
  const turns = toTurns(recent)
  if (!turns.length) throw new WaError(400, 'A conversa ainda não tem mensagem do contato.')
  if (turns[turns.length - 1].role === 'user') turns.push({ role: 'assistant', content: '(continua)' })
  turns.push({ role: 'user', content: '[Instrução interna, não é o contato falando] Não escreva mensagem nenhuma agora. Só analise a conversa inteira e devolva o JSON com "messages": [] e o restante preenchido.' })
  const system = await conversationPrompt({ ...conv, sdr: null }, settings, origin)
  const res = await askAiJson({ model: MODEL, max_tokens: 2000, system, messages: turns })
  const { sdr: analysis } = parseAiJson(res.content.filter((b) => b.type === 'text').map((b) => b.text).join(''))
  if (!analysis) throw new WaError(502, 'A IA não devolveu a análise. Tente de novo.')
  // Análise do zero: o perfil novo substitui o antigo (só a reunião combinada fica).
  return { sdr: await saveSdr({ ...conv, sdr: { meeting: conv.sdr?.meeting } }, analysis) }
}

/* ------------------------------ follow-up ------------------------------ */

function spHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: SP_TZ, hour: 'numeric', hour12: false }).format(date)) % 24
}
/** Dentro do horário do follow-up (seg a sáb, 8h às 20h, horário de Brasília)? */
function isBusinessTime(ms) {
  const d = new Date(ms)
  const h = spHour(d)
  return h >= 8 && h < 20 && spWeekday(d) !== 'Sun'
}
function spWeekday(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: SP_TZ, weekday: 'short' }).format(date)
}

/** Texto de follow-up escrito pela IA (dentro da janela de 24h). */
async function aiFollowUpText(conv, stepIndex, total, settings, origin) {
  const ai = anthropic()
  if (!ai) return ''
  const recent = (await queryRecent(convPath(conv.waId), 'messages', 'at', 16)).reverse()
  const turns = toTurns(recent.filter((m) => !NOISE_TYPES.has(m.type)))
  if (!turns.length) return ''
  // A última fala foi do contato (ex.: "blz") e a IA ficou quieta: fecha o turno antes da instrução.
  if (turns[turns.length - 1].role === 'user') turns.push({ role: 'assistant', content: '(sem resposta)' })
  turns.push({
    role: 'user',
    content: `[Instrução interna, não é o contato falando] O contato parou de responder. Escreva o follow-up ${stepIndex + 1} de ${total}: curto, retomando o ponto onde a conversa parou, com uma pergunta simples. ${stepIndex + 1 === total ? 'É o último: deixe a porta aberta, sem insistir.' : ''} Sem cobrar resposta e sem urgência falsa.`,
  })
  const system = await conversationPrompt(conv, settings, origin)
  const res = await askAiJson({ model: MODEL, max_tokens: 1500, system, messages: turns })
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
  // Bola com o contato: nós falamos por último, ou ele só reagiu (👍) / disse "ok"
  // e a IA ficou quieta de propósito.
  const freeOnly = f.freeOnly !== false
  const waiting = (c) => (c.aiQuietFor && c.aiQuietFor === c.lastInboundAt) || NOISE_TEXT.test(String(c.lastMessageText || ''))
  const convs = [...(await queryDocs('waConversations', [['lastDirection', 'out']])), ...(await queryDocs('waConversations', [['lastDirection', 'in']])).filter(waiting)]
  let sent = 0
  for (const conv of convs) {
    if (sent >= max) break
    if (conv.kind === 'cart' || conv.followUpStopped || conv.aiMode === 'off') continue
    // Reunião marcada (e ainda não passou) ou sem perfil: não fica cutucando.
    const m = conv.sdr?.meeting
    if (m?.agreed && (!m.at || meetingTime(m.at) > Date.now() - 2 * 3600_000)) continue
    if (conv.sdr?.stage === 'desqualificado') continue
    const step = Number(conv.followUpStep || 0)
    const cfg = f.steps[step]
    if (!cfg) continue
    const now = Date.now()
    const since = now - new Date(conv.lastMessageAt).getTime()
    let ready = since >= Number(cfg.afterHours || 24) * 3600_000
    if (freeOnly) {
      // Só texto grátis, dentro das 24h da última mensagem do contato.
      const windowEnd = conv.lastInboundAt ? new Date(conv.lastInboundAt).getTime() + WINDOW_MS - WINDOW_SAFETY_MS : 0
      const left = windowEnd - now
      if (left <= 0) continue
      // Janela fechando antes do próximo passo: manda agora (é a última chance grátis).
      // Com horário comercial, a última chance é a última hora útil antes de fechar.
      if (!ready && since >= 60 * 60_000) {
        const closesOffHours = f.businessHoursOnly && !isBusinessTime(windowEnd - 60 * 60_000)
        if (left < 75 * 60_000 || (closesOffHours && spHour() >= 19 && left < 14 * 3600_000)) ready = true
      }
    }
    if (!ready) continue

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
      if (cfg.templateName && !freeOnly) {
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

/* --------------------------- lembrete da reunião --------------------------- */

/** "hoje às 9h", "amanhã às 14h30" ou "dia 30/10 às 9h". */
function meetingWhenText(at, now = Date.now()) {
  const day = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: SP_TZ }).format(new Date(ms))
  const [hh, mm] = at.slice(11, 16).split(':')
  const hora = `${Number(hh)}h${mm === '00' ? '' : mm}`
  const d = at.slice(0, 10)
  if (d === day(now)) return { quando: `hoje às ${hora}`, hora }
  if (d === day(now + 86400_000)) return { quando: `amanhã às ${hora}`, hora }
  return { quando: `dia ${d.slice(8, 10)}/${d.slice(5, 7)} às ${hora}`, hora }
}

/** Manda o lembrete X minutos antes da reunião marcada pela IA (roda na varredura). */
export async function runMeetingReminders() {
  const settings = await getWaSettings()
  const r = settings.reminder
  if (!r.enabled) return { skipped: 'desligado' }
  const steps = Array.isArray(r.steps) ? r.steps.filter((s) => s && s.enabled !== false) : []
  if (steps.length) return runMeetingReminderSteps(settings, steps)
  const before = Math.max(5, Number(r.minutesBefore) || 30) * 60_000
  const now = Date.now()
  const convs = await queryDocs('waConversations', [['sdr.meeting.agreed', true]])
  let sent = 0
  for (const conv of convs) {
    const at = conv.sdr?.meeting?.at
    if (!at || conv.kind === 'cart' || conv.meetingReminderFor === at) continue
    const left = meetingTime(at) - now
    // Dentro da janela do lembrete e a reunião ainda não passou (a varredura pode atrasar uns minutos).
    if (left > before || left < -5 * 60_000) continue

    // Trava antes de mandar: duas varreduras juntas não mandam duas vezes.
    await updateDoc(convPath(conv.waId), { meetingReminderFor: at, meetingReminderError: null })
    const name = firstName(conv.name)
    const { quando, hora } = meetingWhenText(at, now)
    const com = settings.sdr?.meetingWith || 'Bruno'
    // Link do Meet que veio da agenda do Google (ou o link fixo do lembrete, se tiver).
    const link = conv.sdr?.meeting?.url || r.meetingUrl || ''
    let base = r.text || (link ? 'Oi {nome}, passando pra lembrar da nossa reunião {quando} com o {com}. Link pra entrar: {link}' : 'Oi {nome}, passando pra lembrar da nossa reunião {quando} com o {com}. Até já!')
    if (link && r.text && !r.text.includes('{link}')) base = `${r.text}
Link pra entrar: {link}`
    if (!link) base = base.replace(/\s*(Link pra entrar:|Link:|Entra pelo link:)\s*\{link\}/g, '').replace('{link}', '')
    const text = base
      .replaceAll('{nome}', name || '')
      .replaceAll('{quando}', quando)
      .replaceAll('{hora}', hora)
      .replaceAll('{com}', com)
      .replaceAll('{link}', link)
      .replace(/^Oi ,/, 'Oi,')
      .trim()
    try {
      if (inWindow(conv)) {
        await sendMessage({ to: conv.waId, text, by: 'reminder', byName: 'Lembrete da reunião' })
      } else if (r.templateName) {
        await sendMessage({ to: conv.waId, template: { name: r.templateName, lang: r.templateLang || 'pt_BR', params: [name || 'tudo bem', link || quando] }, by: 'reminder', byName: 'Lembrete da reunião' })
      } else {
        throw new Error('Passou de 24h desde a última mensagem do contato e não há modelo de lembrete escolhido.')
      }
      sent++
    } catch (e) {
      console.warn(`[whatsapp] lembrete ${conv.waId}:`, e.message)
      await updateDoc(convPath(conv.waId), { meetingReminderError: e.message.slice(0, 200) }).catch(() => {})
      await notifyTeam(conv, `${conv.name || conv.phone}: o lembrete da reunião ${quando} não foi enviado. ${e.message}`).catch(() => {})
    }
  }
  return { sent }
}

const REMINDER_DEFAULT_TEXT = {
  1440: 'Oi {nome}! Passando pra lembrar da nossa reunião {quando} com o {com}. Link: {link}',
  60: 'Oi {nome}, nossa reunião com o {com} é daqui a 1 hora, às {hora}. Link: {link}',
  15: 'Oi {nome}, faltam 15 minutos pra nossa reunião! Link: {link}',
  0: 'Oi {nome}, estamos começando! Entra pelo link: {link}',
}

function reminderParam(key, ctx) {
  if (key === 'nome') return ctx.name || 'tudo bem'
  if (key === 'quando') return ctx.quando
  if (key === 'hora') return ctx.hora
  if (key === 'link') return ctx.link
  if (key === 'com') return ctx.com
  return ''
}

/** Lembretes em vários tempos (ex.: 24h, 1h, 15 min e na hora), um de cada por reunião. */
async function runMeetingReminderSteps(settings, steps) {
  const r = settings.reminder
  const now = Date.now()
  const convs = await queryDocs('waConversations', [['sdr.meeting.agreed', true]])
  let sent = 0
  for (const conv of convs) {
    const at = conv.sdr?.meeting?.at
    if (!at || conv.kind === 'cart') continue
    const left = meetingTime(at) - now
    if (left < -10 * 60_000) continue
    const done = conv.meetingReminders?.at === at ? conv.meetingReminders.done || [] : []
    const due = steps.filter((s) => left <= Number(s.minutesBefore || 0) * 60_000 && !done.includes(Number(s.minutesBefore || 0)))
    if (!due.length) continue
    // Só o mais próximo da hora: quem marcou em cima da hora não recebe o de 24h atrasado.
    const pick = due.reduce((a, b) => (Number(b.minutesBefore) < Number(a.minutesBefore) ? b : a))
    await updateDoc(convPath(conv.waId), { meetingReminders: { at, done: [...done, ...due.map((s) => Number(s.minutesBefore || 0))] }, meetingReminderError: null })
    const name = firstName(conv.name)
    const { quando, hora } = meetingWhenText(at, now)
    const ctx = { name, quando, hora, com: settings.sdr?.meetingWith || 'Bruno', link: conv.sdr?.meeting?.url || r.meetingUrl || '' }
    const mins = Number(pick.minutesBefore || 0)
    let text = String(pick.text || REMINDER_DEFAULT_TEXT[mins] || REMINDER_DEFAULT_TEXT[60])
    if (!ctx.link) text = text.replace(/\s*(Link:|Entra pelo link:)\s*\{link\}/g, '').replace('{link}', '')
    text = text
      .replaceAll('{nome}', name || '')
      .replaceAll('{quando}', quando)
      .replaceAll('{hora}', hora)
      .replaceAll('{com}', ctx.com)
      .replaceAll('{link}', ctx.link)
      .replace(/^Oi ,/, 'Oi,')
      .replace(/^Oi ([,!])/, 'Oi$1')
      .trim()
    const label = mins >= 60 ? `${Math.round(mins / 60)}h antes` : mins > 0 ? `${mins} min antes` : 'na hora'
    try {
      if (inWindow(conv)) {
        await sendMessage({ to: conv.waId, text, by: 'reminder', byName: `Lembrete da reunião (${label})` })
      } else if (pick.templateName) {
        const keys = Array.isArray(pick.params) ? pick.params : []
        const params = keys.map((k) => reminderParam(k, ctx))
        if (keys.includes('link') && !ctx.link) throw new Error('O modelo do lembrete pede o link da reunião, mas não tem link cadastrado (Configurar > Lembrete).')
        await sendMessage({ to: conv.waId, template: { name: pick.templateName, lang: pick.templateLang || 'pt_BR', params }, by: 'reminder', byName: `Lembrete da reunião (${label})` })
      } else {
        throw new Error(`Passou de 24h desde a última mensagem do contato e o lembrete de ${label} não tem modelo escolhido.`)
      }
      sent++
    } catch (e) {
      console.warn(`[whatsapp] lembrete ${conv.waId}:`, e.message)
      await updateDoc(convPath(conv.waId), { meetingReminderError: e.message.slice(0, 200) }).catch(() => {})
      await notifyTeam(conv, `${conv.name || conv.phone}: o lembrete da reunião (${label}) não foi enviado. ${e.message}`).catch(() => {})
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
export async function updateConversation(waId, input, by = null) {
  const patch = {}
  if (input.aiMode === 'auto' || input.aiMode === 'off') {
    patch.aiMode = input.aiMode
    // Equipe devolveu pra IA: vale mesmo se for cliente/lead já atendido.
    if (input.aiMode === 'auto') Object.assign(patch, { handoffReason: null, knownContactOverride: true, aiTakeover: { at: nowIso() }, aiFail: null })
  }
  // "Passar pro Jonas": IA + follow-up ligados de uma vez, continuando o que a equipe começou.
  if (input.handover === true) {
    Object.assign(patch, { aiMode: 'auto', handoffReason: null, knownContactOverride: true, aiTakeover: { at: nowIso() }, aiFail: null, followUpStopped: false, followUpStep: 0, followUpError: null })
  }
  if (typeof input.followUpStopped === 'boolean') patch.followUpStopped = input.followUpStopped
  if (input.read === true) patch.unread = 0
  if (typeof input.leadId === 'string' || input.leadId === null) patch.leadId = input.leadId || null
  if (typeof input.name === 'string') patch.name = input.name.trim().slice(0, 80)
  // Observação da equipe no Raio-x: a IA lê em toda resposta e follow-up.
  if (typeof input.teamNotes === 'string') {
    patch.teamNotes = input.teamNotes.trim().slice(0, 2000)
    patch.teamNotesBy = by?.name ? String(by.name).slice(0, 80) : null
    patch.teamNotesAt = nowIso()
  }
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

/* ------------------------- disparo em massa ------------------------- */
// waBroadcasts/{id}: um modelo pra uma lista de pessoas (leads do funil ou números
// colados). A tela manda as variáveis já preenchidas por pessoa. O envio sai em
// lotes: começa na hora (waitUntil) e o sweep continua se não deu tempo.

const BROADCAST_MAX = 1000

/* Funil do disparo (como os funis de disparo do Kommo): cada passo leva o lead para uma etapa.
   flow = { pipelineId, stepStages: [etapa do passo 1, 2...], repliedPipelineId, repliedStage,
            noReplyStage, noReplyAfterHours, errorStage } — tudo opcional. */
const sid = (v) => (typeof v === 'string' && /^[\w-]{1,80}$/.test(v) ? v : '')
function cleanFlow(f) {
  if (!f || typeof f !== 'object') return null
  const flow = {
    pipelineId: sid(f.pipelineId),
    stepStages: (Array.isArray(f.stepStages) ? f.stepStages : []).slice(0, 12).map(sid),
    repliedPipelineId: sid(f.repliedPipelineId),
    repliedStage: sid(f.repliedStage),
    noReplyStage: sid(f.noReplyStage),
    noReplyAfterHours: Math.min(Math.max(Number(f.noReplyAfterHours) || 48, 1), 24 * 30),
    errorStage: sid(f.errorStage),
  }
  return flow.pipelineId || flow.repliedStage ? flow : null
}

const pipelineCache = new Map()
async function wonStages(pipelineId) {
  const key = pipelineId || 'default'
  if (pipelineCache.has(key)) return pipelineCache.get(key)
  const snap = pipelineId && pipelineId !== 'default' ? await getDoc(`leadPipelines/${pipelineId}`).catch(() => null) : null
  const ids = new Set(['closed'])
  for (const st of snap?.exists ? snap.data().stages || [] : []) if (st.kind === 'won') ids.add(st.id)
  pipelineCache.set(key, ids)
  return ids
}

/** Move o lead para a etapa do funil. Lead já ganho (cliente) não sai do lugar. */
async function moveLeadTo(leadId, pipelineId, stageId, why) {
  if (!leadId || !stageId) return
  const snap = await getDoc(`leads/${leadId}`).catch(() => null)
  if (!snap?.exists) return
  const lead = snap.data()
  if ((await wonStages(lead.pipelineId)).has(lead.status)) return
  const pid = pipelineId && pipelineId !== 'default' ? pipelineId : null
  if ((lead.pipelineId || null) === pid && lead.status === stageId) return
  await updateDoc(`leads/${leadId}`, { pipelineId: pid, status: stageId, order: -Date.now(), stageChangedAt: new Date(), updatedAt: new Date(), movedBy: why || 'disparo' }).catch((e) => console.warn('[whatsapp] mover lead:', e.message))
}
const SEQUENCE_MAX = 11 // passos depois do primeiro (Reativ 1 a 12)
const bcPath = (id) => `waBroadcasts/${id}`

export async function createBroadcast(input, user) {
  const name = String(input.name || '').trim().slice(0, 80) || 'Disparo'
  const lang = String(input.template?.lang || 'pt_BR')
  const tplName = String(input.template?.name || '')
  const tpl = (await listTemplates()).find((t) => t.name === tplName && t.language === lang)
  if (!tpl) throw new WaError(400, 'Modelo não encontrado. Clique em "Atualizar modelos" e tente de novo.')
  if (tpl.status !== 'APPROVED') throw new WaError(400, 'Esse modelo ainda não está aprovado no Meta.')
  const seen = new Set()
  const recipients = []
  for (const r of Array.isArray(input.recipients) ? input.recipients : []) {
    const to = toE164Digits(r?.to)
    if (to.length < 12 || to.length > 15) continue
    const key = phoneKey(to)
    if (seen.has(key)) continue
    seen.add(key)
    const params = (Array.isArray(r.params) ? r.params : []).slice(0, 20).map((p) => String(p ?? '').slice(0, 900))
    if (params.length !== tpl.vars || params.some((p) => !p.trim())) throw new WaError(400, `Falta preencher variável para ${r.name || to}.`)
    recipients.push({
      to,
      name: String(r.name || '').slice(0, 80),
      leadId: typeof r.leadId === 'string' ? r.leadId.slice(0, 80) : '',
      params,
      headerText: String(r.headerText || '').slice(0, 60),
      buttonParams: r.buttonParams && typeof r.buttonParams === 'object' ? Object.fromEntries(Object.entries(r.buttonParams).slice(0, 3).map(([k, v]) => [k, String(v ?? '').slice(0, 200)])) : {},
      status: 'pending',
      error: '',
    })
  }
  if (!recipients.length) throw new WaError(400, 'Nenhum número válido na lista.')
  if (recipients.length > BROADCAST_MAX) throw new WaError(400, `Máximo de ${BROADCAST_MAX} pessoas por disparo.`)
  // Confere o modelo com a 1ª pessoa antes de gravar (link do topo, botão...).
  templatePayload({ name: tplName, lang, params: recipients[0].params, headerText: recipients[0].headerText, headerMedia: input.headerMedia, buttonParams: recipients[0].buttonParams }, tpl)

  // Sequência: próximos modelos para quem não responder (como o Disparo 1 a 5 do Kommo).
  const all = await listTemplates()
  const sequence = []
  for (const [i, st] of (Array.isArray(input.sequence) ? input.sequence : []).slice(0, SEQUENCE_MAX).entries()) {
    const sName = String(st?.template?.name || '')
    const sLang = String(st?.template?.lang || 'pt_BR')
    const sTpl = all.find((t) => t.name === sName && t.language === sLang)
    if (!sTpl || sTpl.status !== 'APPROVED') throw new WaError(400, `Passo ${i + 2} da sequência: modelo não encontrado ou não aprovado.`)
    if (sTpl.vars && sTpl.vars !== tpl.vars) throw new WaError(400, `Passo ${i + 2} da sequência: o modelo "${sName}" tem partes para preencher diferentes do primeiro. Use um modelo sem partes ou com as mesmas.`)
    try {
      templatePayload({ name: sName, lang: sLang, params: sTpl.vars ? recipients[0].params : [], headerText: '', headerMedia: '', buttonParams: {} }, sTpl)
    } catch {
      throw new WaError(400, `Passo ${i + 2} da sequência: o modelo "${sName}" precisa de imagem, título ou link de botão, e a sequência não preenche isso.`)
    }
    const afterHours = Math.min(Math.max(Number(st.afterHours) || 48, 1), 24 * 30)
    sequence.push({ name: sName, lang: sLang, category: sTpl.category || '', vars: sTpl.vars || 0, afterHours })
  }

  const id = `bc_${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
  const at = nowIso()
  const flow = cleanFlow(input.flow)
  await setDoc(bcPath(id), {
    name,
    sequence,
    flow,
    template: { name: tplName, lang, category: tpl.category || '' },
    headerMedia: String(input.headerMedia || '').trim().slice(0, 1000),
    aiMode: input.aiMode === 'off' ? 'off' : 'auto',
    status: 'sending',
    total: recipients.length,
    sent: 0,
    failed: 0,
    next: 0,
    recipients,
    createdAt: at,
    updatedAt: at,
    createdBy: user.uid,
    createdByName: user.name || '',
  })
  return { id, total: recipients.length }
}

/** Manda o próximo lote de um disparo. Para quando acaba, quando cancelam ou quando o tempo acaba. */
export async function runBroadcast(id, { budgetMs = 50_000 } = {}) {
  const lock = `waLocks/${id}`
  if (!(await takeLock(lock))) return { skipped: 'rodando em outra chamada' }
  const start = Date.now()
  try {
    let snap = await getDoc(bcPath(id))
    if (!snap.exists) return { skipped: 'não existe' }
    let bc = snap.data()
    const recipients = bc.recipients || []
    let next = Number(bc.next) || 0
    let sent = Number(bc.sent) || 0
    let failed = Number(bc.failed) || 0
    let accountHit = null
    while (bc.status === 'sending' && next < recipients.length && Date.now() - start < budgetMs) {
      const group = recipients.slice(next, next + 5)
      await Promise.all(
        group.map(async (r) => {
          try {
            const out = await sendMessage({
              to: r.to,
              template: { name: bc.template.name, lang: bc.template.lang, params: r.params, headerText: r.headerText, headerMedia: bc.headerMedia, buttonParams: r.buttonParams },
              by: 'broadcast',
              byName: `Disparo: ${bc.name}`,
              convExtra: r.name ? { name: r.name } : {},
              msgExtra: { broadcastId: id },
            })
            const patch = { lastBroadcastId: id, lastBroadcastAt: nowIso() }
            if (bc.aiMode === 'auto') Object.assign(patch, { aiMode: 'auto', knownContactOverride: true, handoffReason: null })
            else patch.aiMode = 'off'
            if (r.leadId) {
              const c = await getDoc(convPath(out.waId)).catch(() => null)
              if (c?.exists && !c.data().leadId) patch.leadId = r.leadId
            }
            await updateDoc(convPath(out.waId), patch).catch(() => {})
            r.status = 'sent'
            r.waId = out.waId
            if (bc.sequence?.length) {
              r.step = 0
              r.nextAt = new Date(Date.now() + bc.sequence[0].afterHours * 3600_000).toISOString()
            } else if (bc.flow?.noReplyStage) {
              r.step = 0
              r.nextAt = new Date(Date.now() + bc.flow.noReplyAfterHours * 3600_000).toISOString()
            }
            if (bc.flow) await moveLeadTo(r.leadId, bc.flow.pipelineId, bc.flow.stepStages?.[0], `disparo ${id}`)
            sent++
          } catch (e) {
            r.status = 'failed'
            r.error = String(e.message || 'erro').slice(0, 200)
            r.errorCode = Number(e.metaCode) || 0
            failed++
            const info = classifyWaError(e.metaCode, e.message)
            if (info.level === 'account') accountHit = info
            else if (bc.flow?.errorStage) await moveLeadTo(r.leadId, bc.flow.pipelineId, bc.flow.errorStage, `disparo ${id}`)
          }
        })
      )
      next += group.length
      // Relê o status: alguém pode ter cancelado no meio.
      const cur = await getDoc(bcPath(id)).catch(() => null)
      const status = cur?.exists ? cur.data().status : bc.status
      const done = next >= recipients.length
      const finish = bc.sequence?.length || bc.flow?.noReplyStage ? { status: 'sequence' } : { status: 'done', finishedAt: nowIso() }
      const patch = { recipients, next, sent, failed, updatedAt: nowIso(), ...(done && status === 'sending' ? finish : {}) }
      await updateDoc(bcPath(id), patch)
      bc = { ...bc, ...patch, status: patch.status || status }
      // Problema da conta (pagamento, token...): para tudo e avisa, senão o resto falha igual.
      if (accountHit) {
        await notifyAccountIssue(accountHit, { broadcastId: id })
        if (accountHit.block && bc.status === 'sending') {
          await pauseBroadcasts(accountHit)
          bc.status = 'paused'
        }
        accountHit = null
      }
    }
    return { id, next, sent, failed, status: bc.status }
  } finally {
    await deleteDoc(lock).catch(() => {})
  }
}

/** Sweep: continua os disparos que ficaram no meio. */
export async function runBroadcasts({ budgetMs = 45_000 } = {}) {
  const open = await queryDocs('waBroadcasts', [['status', 'sending']])
  const results = []
  const start = Date.now()
  for (const bc of open) {
    const left = budgetMs - (Date.now() - start)
    if (left < 8_000) break
    results.push(await runBroadcast(bc.id, { budgetMs: left }).catch((e) => ({ id: bc.id, error: e.message })))
  }
  const seqs = await queryDocs('waBroadcasts', [['status', 'sequence']]).catch(() => [])
  for (const bc of seqs) {
    const left = budgetMs - (Date.now() - start)
    if (left < 8_000) break
    results.push(await runSequence(bc.id, { budgetMs: left }).catch((e) => ({ id: bc.id, error: e.message })))
  }
  return results
}

/** Próximo passo da sequência para quem não respondeu. Só de seg a sáb, 8h às 20h. */
export async function runSequence(id, { budgetMs = 40_000, max = 40 } = {}) {
  if (!isBusinessTime(Date.now())) return { id, skipped: 'fora do horário' }
  const lock = `waLocks/${id}_seq`
  if (!(await takeLock(lock))) return { id, skipped: 'rodando em outra chamada' }
  const start = Date.now()
  try {
    const snap = await getDoc(bcPath(id))
    if (!snap.exists) return { id, skipped: 'não existe' }
    const bc = snap.data()
    if (bc.status !== 'sequence') return { id, skipped: bc.status }
    const seq = bc.sequence || []
    const recipients = bc.recipients || []
    const now = Date.now()
    let sentNow = 0
    let accountHit = null
    for (const r of recipients) {
      if (sentNow >= max || Date.now() - start > budgetMs || accountHit) break
      if (r.status !== 'sent' || r.seqDone || !r.nextAt || new Date(r.nextAt).getTime() > now || !r.waId) continue
      const c = await getDoc(convPath(r.waId)).catch(() => null)
      const conv = c?.exists ? c.data() : {}
      // Respondeu, recebeu outro disparo ou o lead fechou/perdeu: sai da sequência.
      if (conv.lastInboundAt && conv.lastInboundAt > bc.createdAt) {
        r.seqDone = 'respondeu'
        continue
      }
      if (conv.lastBroadcastId && conv.lastBroadcastId !== id) {
        r.seqDone = 'outro disparo'
        continue
      }
      if (r.leadId) {
        const lead = await getDoc(`leads/${r.leadId}`).catch(() => null)
        const st = lead?.exists ? lead.data().status : null
        if (st === 'closed' || st === 'lost') {
          r.seqDone = 'lead fechado ou perdido'
          continue
        }
      }
      const stepIdx = Number(r.step || 0) + 1
      const st = seq[stepIdx - 1]
      if (!st) {
        // Passou o último prazo sem resposta.
        r.seqDone = 'não respondeu'
        r.nextAt = null
        if (bc.flow?.noReplyStage) await moveLeadTo(r.leadId, bc.flow.pipelineId, bc.flow.noReplyStage, `disparo ${id}`)
        continue
      }
      try {
        await sendMessage({
          to: r.waId,
          template: { name: st.name, lang: st.lang, params: st.vars ? r.params : [] },
          by: 'broadcast',
          byName: `Disparo: ${bc.name} (passo ${stepIdx + 1})`,
          msgExtra: { broadcastId: id, seqStep: stepIdx },
        })
        await updateDoc(convPath(r.waId), { lastBroadcastId: id, lastBroadcastAt: nowIso() }).catch(() => {})
        r.step = stepIdx
        const nextSt = seq[stepIdx]
        const wait = nextSt ? nextSt.afterHours : bc.flow?.noReplyStage ? bc.flow.noReplyAfterHours : 0
        r.nextAt = wait ? new Date(Date.now() + wait * 3600_000).toISOString() : null
        if (!wait) r.seqDone = 'terminou'
        if (bc.flow) await moveLeadTo(r.leadId, bc.flow.pipelineId, bc.flow.stepStages?.[stepIdx], `disparo ${id}`)
        sentNow++
      } catch (e) {
        const info = classifyWaError(e.metaCode, e.message)
        if (info.level === 'account') {
          accountHit = info
          break
        }
        r.seqDone = 'erro'
        r.seqError = String(e.message || 'erro').slice(0, 200)
        if (bc.flow?.errorStage) await moveLeadTo(r.leadId, bc.flow.pipelineId, bc.flow.errorStage, `disparo ${id}`)
      }
    }
    const open = recipients.some((r) => r.status === 'sent' && !r.seqDone && r.nextAt)
    const patch = { recipients, updatedAt: nowIso(), seqSent: Number(bc.seqSent || 0) + sentNow, ...(open ? {} : { status: 'done', finishedAt: nowIso() }) }
    await updateDoc(bcPath(id), patch)
    if (accountHit) {
      await notifyAccountIssue(accountHit, { broadcastId: id })
      if (accountHit.block) await pauseBroadcasts(accountHit)
    }
    return { id, sent: sentNow, open }
  } finally {
    await deleteDoc(lock).catch(() => {})
  }
}

export async function cancelBroadcast(id) {
  const snap = await getDoc(bcPath(id))
  if (!snap.exists) throw new WaError(404, 'Disparo não encontrado.')
  if (!['sending', 'paused', 'sequence'].includes(snap.data().status)) return { ok: true }
  await updateDoc(bcPath(id), { status: 'canceled', updatedAt: nowIso(), finishedAt: nowIso() })
  return { ok: true }
}

/* ---------------------- problemas de entrega ---------------------- */

/** Avisa admins e gerentes (sino + celular) de problema da conta, no máx. 1x a cada 6h por motivo. */
async function notifyAccountIssue(info, { broadcastId = '' } = {}) {
  if (!(await rateLimit(`wa-account-${info.key}`, 1, 6 * 3600_000).catch(() => false))) return
  const ids = await staffIds(null)
  const message = `${info.title}. ${info.why} O que fazer: ${info.fix}${info.block ? ' Os disparos em andamento foram pausados.' : ''}`
  for (const userId of ids) {
    await setDoc(`notifications/wa_account_${info.key}_${Date.now()}_${userId.slice(0, 6)}`, {
      userId,
      type: 'whatsapp_account',
      message,
      actorName: 'WhatsApp',
      entityId: broadcastId,
      read: false,
      createdAt: new Date(),
    }).catch(() => {})
  }
  await sendPushToUsers(ids, { title: `WhatsApp: ${info.title}`, body: message, url: '/leads?aba=conversas&wa=disparo', tag: `wa-account-${info.key}` }).catch(() => {})
}

const OPT_OUT_TEXT = /^(bloquear|n[aã]o quero|parar|sair)$/i

/** A pessoa respondeu um disparo com funil: leva o lead para a etapa de "respondeu" (uma vez por disparo). */
export async function onBroadcastReply(waId) {
  const snap = await getDoc(convPath(waId)).catch(() => null)
  const conv = snap?.exists ? snap.data() : null
  if (!conv?.lastBroadcastId || conv.bcRepliedFor === conv.lastBroadcastId || !conv.leadId) return
  const bc = await getDoc(bcPath(conv.lastBroadcastId)).catch(() => null)
  const flow = bc?.exists ? bc.data().flow : null
  await updateDoc(convPath(waId), { bcRepliedFor: conv.lastBroadcastId }).catch(() => {})
  if (!flow?.repliedStage) return
  await moveLeadTo(conv.leadId, flow.repliedPipelineId || flow.pipelineId, flow.repliedStage, `respondeu disparo ${conv.lastBroadcastId}`)
}

/** Pausa os disparos em andamento (dá para retomar depois). */
async function pauseBroadcasts(info) {
  for (const st of ['sending', 'sequence']) {
    const open = await queryDocs('waBroadcasts', [['status', st]]).catch(() => [])
    for (const bc of open) {
      await updateDoc(bcPath(bc.id), { status: 'paused', pausedFrom: st, pausedAt: nowIso(), pausedReason: info.title, updatedAt: nowIso() }).catch(() => {})
    }
  }
}

/** Status "failed" que o Meta mandou depois do envio: conta no disparo e avisa se for da conta. */
async function onDeliveryFailed(waId, msg, code, text) {
  const info = classifyWaError(code, text)
  let bcId = msg.broadcastId || ''
  if (!bcId && msg.by === 'broadcast') {
    const conv = await getDoc(convPath(waId)).catch(() => null)
    bcId = conv?.exists ? conv.data().lastBroadcastId || '' : ''
  }
  if (bcId && info.level === 'person') {
    const bc = await getDoc(bcPath(bcId)).catch(() => null)
    const flow = bc?.exists ? bc.data().flow : null
    if (flow?.errorStage) {
      const conv = await getDoc(convPath(waId)).catch(() => null)
      await moveLeadTo(conv?.exists ? conv.data().leadId : '', flow.pipelineId, flow.errorStage, `disparo ${bcId}`)
    }
  }
  if (bcId) {
    const base = `delivery.reasons.${info.key}`
    await updateDocPaths(bcPath(bcId), { delivery: { reasons: { [info.key]: publicInfo(info) } } }, ['title', 'why', 'fix', 'level', 'retry', 'code'].map((f) => `${base}.${f}`))
    await incrementField(bcPath(bcId), `${base}.count`, 1)
    await incrementField(bcPath(bcId), 'delivery.failed', 1)
  }
  if (info.level === 'account') {
    await notifyAccountIssue(info, { broadcastId: bcId })
    if (info.block) await pauseBroadcasts(info)
  }
}

export async function resumeBroadcast(id) {
  const snap = await getDoc(bcPath(id))
  if (!snap.exists) throw new WaError(404, 'Disparo não encontrado.')
  const bc = snap.data()
  if (bc.status !== 'paused') return { ok: true }
  const mainDone = Number(bc.next || 0) >= (bc.recipients || []).length
  const status = mainDone ? (bc.sequence?.length ? 'sequence' : 'done') : 'sending'
  await updateDoc(bcPath(id), { status, pausedReason: null, pausedFrom: null, updatedAt: nowIso() })
  return { ok: true, status }
}

/** Confere a entrega de cada pessoa do disparo e agrupa os erros por motivo. */
export async function checkBroadcast(id) {
  const snap = await getDoc(bcPath(id))
  if (!snap.exists) throw new WaError(404, 'Disparo não encontrado.')
  const bc = snap.data()
  const reasons = {}
  const add = (info, r, text) => {
    const k = info.key
    if (!reasons[k]) reasons[k] = { ...publicInfo(info), count: 0, people: [] }
    reasons[k].count++
    reasons[k].people.push({ to: r.to, name: r.name || '', error: String(text || '').slice(0, 160) })
  }
  let delivered = 0
  let read = 0
  let waiting = 0
  const recipients = bc.recipients || []
  for (const r of recipients) if (r.status === 'failed') add(classifyWaError(r.errorCode, r.error), r, r.error)
  const sent = recipients.filter((r) => r.status === 'sent' && r.waId)
  for (let i = 0; i < sent.length; i += 25) {
    await Promise.all(
      sent.slice(i, i + 25).map(async (r) => {
        const msgs = await queryRecent(`waConversations/${r.waId}`, 'messages', 'at', 15).catch(() => [])
        const m = msgs.find((x) => x.broadcastId === id) || msgs.find((x) => x.by === 'broadcast' && x.template?.name === bc.template?.name && String(x.at) >= String(bc.createdAt))
        if (!m) waiting++
        else if (m.status === 'failed') add(classifyWaError(m.errorCode, m.error), r, m.error)
        else if (m.status === 'read') read++
        else if (m.status === 'delivered') delivered++
        else waiting++
      })
    )
  }
  const failed = Object.values(reasons).reduce((a, b) => a + b.count, 0)
  const delivery = { checkedAt: nowIso(), delivered, read, waiting, failed, reasons }
  await updateDoc(bcPath(id), { delivery })
  return delivery
}

/** Novo disparo só com quem não recebeu por um motivo que já dá para resolver (pagamento, token...). */
export async function retryBroadcast(id, user) {
  const delivery = await checkBroadcast(id)
  const snap = await getDoc(bcPath(id))
  const bc = snap.data()
  if (bc.status === 'sending' || bc.status === 'sequence') throw new WaError(409, 'Esse disparo ainda está enviando. Espere terminar ou cancele.')
  const again = new Set()
  for (const r of Object.values(delivery.reasons)) if (r.retry) for (const p of r.people) again.add(p.to)
  const recipients = (bc.recipients || []).filter((r) => again.has(r.to))
  if (!recipients.length) throw new WaError(400, 'Ninguém para reenviar: os erros que sobraram são de pessoas que não podem receber.')
  return createBroadcast(
    {
      name: `${bc.name} (reenvio)`.slice(0, 80),
      template: { name: bc.template.name, lang: bc.template.lang },
      headerMedia: bc.headerMedia,
      aiMode: bc.aiMode,
      recipients: recipients.map((r) => ({ to: r.to, name: r.name, leadId: r.leadId, params: r.params, headerText: r.headerText, buttonParams: r.buttonParams })),
    },
    user
  )
}

/* ----------------------- mensagem da etapa do funil ----------------------- */
// Cada etapa do pipeline pode ter um modelo aprovado (stage.waMessage). Quando a equipe
// move o lead para essa etapa na tela, a tela chama isto e o modelo sai pro WhatsApp do lead.

const STAGE_RESEND_MS = 7 * 86400_000

function stageVar(m, lead) {
  const name = String(lead.contactName || '').trim()
  if (m?.source === 'fixed') return String(m.text || '').trim()
  const v = m?.source === 'first' ? name.split(/\s+/)[0] || '' : m?.source === 'full' ? name : m?.source === 'company' ? lead.companyName : m?.source === 'city' ? lead.cityRegion : ''
  return String(v || '').trim() || String(m?.text || '').trim()
}

export async function sendStageMessage({ leadId, pipelineId, stageId }) {
  if (!leadId || !stageId) throw new WaError(400, 'Faltou o lead ou a etapa.')
  const pid = pipelineId || 'default'
  const pipe = await getDoc(`leadPipelines/${pid}`).catch(() => null)
  const stage = (pipe?.exists ? pipe.data().stages || [] : []).find((s) => s.id === stageId)
  const cfg = stage?.waMessage
  if (!cfg?.templateName) return { skipped: 'etapa sem mensagem' }
  const snap = await getDoc(`leads/${leadId}`)
  if (!snap.exists) throw new WaError(404, 'Lead não encontrado.')
  const lead = snap.data()
  // Só se o lead ainda está nessa etapa (a pessoa pode ter arrastado e voltado).
  if ((lead.pipelineId || 'default') !== pid || lead.status !== stageId) return { skipped: 'lead saiu da etapa' }
  const phone = digits(lead.whatsapp || lead.phone || '')
  if (phone.length < 10) return { skipped: 'lead sem WhatsApp' }
  const last = lead.stageMessages?.[stageId]
  if (last && Date.now() - new Date(last).getTime() < STAGE_RESEND_MS) return { skipped: 'já recebeu essa mensagem nos últimos 7 dias' }

  const params = (cfg.vars || []).map((m) => stageVar(m, lead))
  if (params.some((v) => !v)) throw new WaError(400, `Falta dado do lead para preencher o modelo da etapa "${stage.label}" (nome, empresa ou cidade). Coloque um texto de reserva na configuração da etapa.`)
  const ex = cfg.extras || {}
  const out = await sendMessage({
    to: phone,
    template: { name: cfg.templateName, lang: cfg.templateLang || 'pt_BR', params, headerText: ex.headerText, headerMedia: ex.headerMedia, buttonParams: ex.buttonParams },
    by: 'stage',
    byName: `Etapa: ${stage.label}`,
    convExtra: lead.contactName ? { name: lead.contactName } : {},
  })
  const patch = { leadId }
  if (cfg.aiMode === 'off') patch.aiMode = 'off'
  else Object.assign(patch, { aiMode: 'auto', knownContactOverride: true, handoffReason: null, aiTakeover: { at: nowIso() }, followUpStopped: false, followUpStep: 0 })
  await updateDoc(convPath(out.waId), patch).catch(() => {})
  await updateDoc(`leads/${leadId}`, { stageMessages: { ...(lead.stageMessages || {}), [stageId]: nowIso() } }).catch(() => {})
  return { sent: true, waId: out.waId, stage: stage.label }
}

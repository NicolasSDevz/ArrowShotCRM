// Agenda do Google do Bruno → reuniões no WhatsApp do CRM.
//
// A IA manda o link da agenda (página de agendamento do Google). Quando a pessoa marca,
// o evento aparece aqui: o CRM acha a conversa pelo telefone (ou e-mail) que ela preencheu,
// grava dia, hora e link do Meet em conv.sdr.meeting e os lembretes saem sozinhos.
//
// Login: o mesmo app OAuth do Google Ads (GOOGLE_ADS_CLIENT_ID/SECRET, tipo "computador").
// Como esse tipo só aceita voltar para http://localhost, o admin cola no CRM o endereço
// da página que não abriu (tem o ?code=...) e o servidor troca pelo token.
// Token fica cifrado em waSecrets/main.gcal; o resumo da última leitura em waSettings/gcal.

import { getDoc, updateDoc, updateDocPaths, setDoc, queryDocs } from './firebaseAdmin.js'
import { encryptToken, decryptToken } from './tokenCrypto.js'

const SECRETS = 'waSecrets/main'
const STATUS = 'waSettings/gcal'
const REDIRECT = 'http://localhost'
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly', 'openid', 'email']
const SP_TZ = 'America/Sao_Paulo'

export class GcalError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function client() {
  const id = process.env.GOOGLE_ADS_CLIENT_ID
  const secret = process.env.GOOGLE_ADS_CLIENT_SECRET
  if (!id || !secret) throw new GcalError(500, 'Falta o login do Google no servidor (GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET na Vercel).')
  return { id, secret }
}

export function gcalAuthUrl() {
  const { id } = client()
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', id)
  u.searchParams.set('redirect_uri', REDIRECT)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', SCOPES.join(' '))
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  return u.toString()
}

/** Recebe o endereço colado (http://localhost/?code=...) ou só o código. */
export async function gcalConnect(pasted) {
  const raw = String(pasted || '').trim()
  let code = raw
  try {
    const u = new URL(raw)
    if (u.searchParams.get('error')) throw new GcalError(400, 'O Google não autorizou. Tente de novo e clique em Permitir.')
    code = u.searchParams.get('code') || ''
  } catch (e) {
    if (e instanceof GcalError) throw e
  }
  if (!code || code.length < 20) throw new GcalError(400, 'Não achei o código. Cole o endereço inteiro da página que abriu depois de autorizar (começa com http://localhost).')
  const { id, secret } = client()
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: REDIRECT, grant_type: 'authorization_code' }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.refresh_token) {
    const why = data.error === 'invalid_grant' ? 'O código venceu ou já foi usado. Clique em "Abrir o Google" de novo.' : data.error_description || data.error || `erro ${res.status}`
    throw new GcalError(400, `Não deu para conectar: ${why}`)
  }
  let email = ''
  try {
    email = JSON.parse(Buffer.from(String(data.id_token || '').split('.')[1] || '', 'base64url').toString('utf8')).email || ''
  } catch {
    /* sem e-mail: tudo bem */
  }
  // Testa a leitura da agenda já (API desligada no projeto dá erro aqui, com o motivo).
  await calendarGet(data.access_token, 'calendars/primary')
  await updateDoc(SECRETS, { gcal: { refreshToken: encryptToken(data.refresh_token), email, connectedAt: new Date().toISOString() } })
  await setDoc(STATUS, { connected: true, email, connectedAt: new Date().toISOString(), lastSyncAt: null, error: null, upcoming: [] })
  return { connected: true, email }
}

export async function gcalDisconnect() {
  await updateDoc(SECRETS, { gcal: null })
  await setDoc(STATUS, { connected: false, email: '', lastSyncAt: null, error: null, upcoming: [] })
  return { connected: false }
}

async function accessToken() {
  const snap = await getDoc(SECRETS)
  const g = snap.exists ? snap.data().gcal : null
  if (!g?.refreshToken) return null
  const { id, secret } = client()
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: decryptToken(g.refreshToken), client_id: id, client_secret: secret, grant_type: 'refresh_token' }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new GcalError(401, data.error === 'invalid_grant' ? 'A autorização da agenda foi revogada ou venceu. Conecte de novo.' : `Login da agenda falhou: ${data.error || res.status}`)
  return data.access_token
}

async function calendarGet(token, path, params = {}) {
  const u = new URL(`https://www.googleapis.com/calendar/v3/${path}`)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
  const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || `erro ${res.status}`
    if (/has not been used|is disabled/i.test(msg)) throw new GcalError(400, 'A API do Google Agenda está desligada no projeto do Google (arrowshot-ads-api). Ative em console.cloud.google.com > APIs > Google Calendar API.')
    throw new GcalError(res.status, `Agenda do Google: ${msg}`)
  }
  return data
}

/* ------------------------------ leitura ------------------------------ */

const digits = (v) => String(v || '').replace(/\D/g, '')

/** "2026-11-05T14:00:00-03:00" -> "2026-11-05T14:00" no horário de Brasília. */
function spLocal(iso) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: SP_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
}

function whenText(iso) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: SP_TZ, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/** Telefones que aparecem no evento (formulário da página de agendamento cai na descrição). */
function phonesOf(ev) {
  const text = [ev.description, ev.location, ev.summary].filter(Boolean).join(' \n ')
  const out = new Set()
  for (const m of text.matchAll(/(\+?\d[\d\s().-]{8,}\d)/g)) {
    let d = digits(m[1]).replace(/^0+/, '')
    if (d.length === 10 || d.length === 11) d = `55${d}`
    if (d.length >= 12 && d.length <= 13) out.add(d)
  }
  return [...out]
}

/** Número com e sem o 9 (o WhatsApp às vezes guarda sem). */
function variants(d) {
  const out = new Set([d])
  if (d.startsWith('55') && d.length === 13 && d[4] === '9') out.add(d.slice(0, 4) + d.slice(5))
  if (d.startsWith('55') && d.length === 12) out.add(`${d.slice(0, 4)}9${d.slice(4)}`)
  return [...out]
}

const keyOf = (d) => (d.startsWith('55') && d.length >= 12 ? `${d.slice(2, 4)}${d.slice(-8)}` : d)

async function findConversation(ev, selfEmail) {
  for (const p of phonesOf(ev)) {
    for (const v of variants(p)) {
      const c = await getDoc(`waConversations/${v}`).catch(() => null)
      if (c?.exists) return { waId: v, conv: c.data(), how: 'telefone' }
    }
    const leads = await queryDocs('leads', [['phoneKey', keyOf(p)]]).catch(() => [])
    for (const l of leads) {
      const cs = await queryDocs('waConversations', [['leadId', l.id]]).catch(() => [])
      if (cs[0]) return { waId: cs[0].id, conv: cs[0], how: 'telefone do lead' }
    }
  }
  const emails = (ev.attendees || []).map((a) => String(a.email || '').toLowerCase()).filter((e) => e && e !== selfEmail && !a?.self)
  for (const email of emails) {
    const leads = await queryDocs('leads', [['email', email]]).catch(() => [])
    for (const l of leads) {
      const cs = await queryDocs('waConversations', [['leadId', l.id]]).catch(() => [])
      if (cs[0]) return { waId: cs[0].id, conv: cs[0], how: 'e-mail do lead' }
    }
  }
  return null
}

const meetUrl = (ev) => ev.hangoutLink || (ev.conferenceData?.entryPoints || []).find((e) => e.entryPointType === 'video')?.uri || ''

/**
 * Lê a agenda (de 1 hora atrás até 30 dias) e liga cada reunião marcada à conversa.
 * notify(conv, waId, texto) avisa a equipe (vem do whatsapp.js).
 */
export async function runCalendarSync({ notify } = {}) {
  let token
  try {
    token = await accessToken()
  } catch (e) {
    await updateDocPaths(STATUS, { error: e.message, lastSyncAt: new Date().toISOString() }, ['error', 'lastSyncAt']).catch(() => {})
    return { error: e.message }
  }
  if (!token) return { skipped: 'agenda não conectada' }
  const status = await getDoc(STATUS).catch(() => null)
  const selfEmail = String(status?.exists ? status.data().email || '' : '').toLowerCase()
  const now = Date.now()
  let data
  try {
    data = await calendarGet(token, 'calendars/primary/events', {
      timeMin: new Date(now - 3600_000).toISOString(),
      timeMax: new Date(now + 30 * 86400_000).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      showDeleted: true,
      maxResults: 250,
    })
  } catch (e) {
    await updateDocPaths(STATUS, { error: e.message, lastSyncAt: new Date().toISOString() }, ['error', 'lastSyncAt']).catch(() => {})
    return { error: e.message }
  }

  const upcoming = []
  let linked = 0
  // Eventos já vistos e não mudaram desde a última leitura: não procura a conversa de novo.
  const prevLinks = (status?.exists ? status.data().links : null) || {}
  const links = {}
  for (const ev of data.items || []) {
    if (!ev.start?.dateTime) continue // dia inteiro: não é reunião
    const others = (ev.attendees || []).filter((a) => !a.self && String(a.email || '').toLowerCase() !== selfEmail)
    const looksBooked = others.length > 0 || phonesOf(ev).length > 0
    if (!looksBooked) continue
    const at = spLocal(ev.start.dateTime)
    const cancelled = ev.status === 'cancelled' || others.every((a) => a.responseStatus === 'declined')
    const prev = prevLinks[ev.id]
    // Sem conversa achada: tenta de novo a cada 30 min (a pessoa pode chamar no WhatsApp depois).
    if (prev && prev.updated === ev.updated && (prev.row?.waId || now - Number(prev.checkedAt || 0) < 30 * 60_000)) {
      links[ev.id] = prev
      if (!cancelled) upcoming.push(prev.row)
      continue
    }
    const hit = await findConversation(ev, selfEmail)
    const row = { eventId: ev.id, title: String(ev.summary || '').slice(0, 120), at, when: whenText(ev.start.dateTime), cancelled, waId: hit?.waId || '', name: hit?.conv?.name || others[0]?.displayName || others[0]?.email || '', how: hit?.how || '' }
    if (!cancelled) upcoming.push(row)
    links[ev.id] = { updated: ev.updated || '', row, checkedAt: now }
    if (!hit) continue

    const m = hit.conv.sdr?.meeting || {}
    if (cancelled) {
      if (m.eventId === ev.id && m.agreed) {
        await updateDocPaths(`waConversations/${hit.waId}`, { sdr: { meeting: { agreed: false, when: '', at: '', url: '', eventId: ev.id } } }, ['sdr.meeting']).catch(() => {})
        await notify?.(hit.conv, hit.waId, `${hit.conv.name || hit.waId} cancelou a reunião de ${row.when} na agenda.`)
      }
      continue
    }
    const url = meetUrl(ev)
    if (m.eventId === ev.id && m.at === at && m.agreed && (m.url || '') === url) continue
    const meeting = { agreed: true, when: row.when, at, url, eventId: ev.id, source: 'agenda' }
    await updateDocPaths(`waConversations/${hit.waId}`, { sdr: { meeting, stage: 'agendado' } }, ['sdr.meeting', 'sdr.stage']).catch(() => {})
    linked++
    const changed = m.eventId === ev.id ? 'remarcou a reunião para' : 'marcou reunião pela agenda:'
    await notify?.(hit.conv, hit.waId, `${hit.conv.name || hit.waId} ${changed} ${row.when}.`)
  }
  await setDoc(STATUS, {
    connected: true,
    email: selfEmail,
    connectedAt: status?.exists ? status.data().connectedAt || null : null,
    lastSyncAt: new Date().toISOString(),
    error: null,
    upcoming: upcoming.slice(0, 40),
    links,
  })
  return { linked, upcoming: upcoming.length }
}

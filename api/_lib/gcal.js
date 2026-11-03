// Agenda do Google do Bruno → reuniões no WhatsApp do CRM.
//
// A IA manda o link da agenda (página de agendamento do Google). Quando a pessoa marca,
// o evento aparece aqui: o CRM acha a conversa pelo telefone (ou e-mail) que ela preencheu,
// grava dia, hora e link do Meet em conv.sdr.meeting e os lembretes saem sozinhos.
//
// Sem login do Google: o Bruno cola o "Endereço secreto no formato iCal" da agenda dele
// (Configurações da agenda > Integrar agenda). Fica cifrado em waSecrets/main.gcal;
// o resumo da última leitura fica em waSettings/gcal.

import { getDoc, updateDoc, updateDocPaths, setDoc, queryDocs } from './firebaseAdmin.js'
import { encryptToken, decryptToken } from './tokenCrypto.js'

const SECRETS = 'waSecrets/main'
const STATUS = 'waSettings/gcal'
const SP_TZ = 'America/Sao_Paulo'

export class GcalError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function checkIcalUrl(raw) {
  const url = String(raw || '').trim()
  let u
  try {
    u = new URL(url)
  } catch {
    throw new GcalError(400, 'Isso não parece um endereço. Cole o "Endereço secreto no formato iCal" inteiro.')
  }
  if (u.protocol !== 'https:' || u.hostname !== 'calendar.google.com' || !/\/calendar\/ical\/.+\.ics$/.test(u.pathname)) {
    throw new GcalError(400, 'Esse não é o endereço secreto iCal. Ele começa com https://calendar.google.com/calendar/ical/ e termina com .ics.')
  }
  if (/\/public\/basic\.ics$/.test(u.pathname)) throw new GcalError(400, 'Esse é o endereço público. Use o "Endereço secreto no formato iCal" (fica logo abaixo).')
  return url
}

async function fetchIcal(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (res.status === 404) throw new GcalError(400, 'O Google não achou essa agenda. O endereço secreto pode ter sido trocado: copie de novo e cole aqui.')
  if (!res.ok) throw new GcalError(502, `A agenda do Google respondeu erro ${res.status}.`)
  const text = await res.text()
  if (!text.includes('BEGIN:VCALENDAR')) throw new GcalError(400, 'O endereço não devolveu uma agenda.')
  return text
}

/** Recebe o endereço secreto iCal, testa e guarda cifrado. */
export async function gcalConnect(pasted) {
  const url = checkIcalUrl(pasted)
  const text = await fetchIcal(url)
  const email = decodeURIComponent((/\/calendar\/ical\/([^/]+)\//.exec(new URL(url).pathname) || [])[1] || '')
  const name = (/^X-WR-CALNAME:(.*)$/m.exec(text) || [])[1]?.trim() || ''
  await updateDoc(SECRETS, { gcal: { icalUrl: encryptToken(url), email, connectedAt: new Date().toISOString() } })
  await setDoc(STATUS, { connected: true, email: email || name, connectedAt: new Date().toISOString(), lastSyncAt: null, error: null, upcoming: [], links: {} })
  return { connected: true, email: email || name }
}

export async function gcalDisconnect() {
  await updateDoc(SECRETS, { gcal: null })
  await setDoc(STATUS, { connected: false, email: '', lastSyncAt: null, error: null, upcoming: [], links: {} })
  return { connected: false }
}

/** Mantido para a rota antiga: agora não tem login, só o endereço. */
export function gcalAuthUrl() {
  return 'https://calendar.google.com/calendar/r/settings'
}

async function icalUrl() {
  const snap = await getDoc(SECRETS)
  const g = snap.exists ? snap.data().gcal : null
  return g?.icalUrl ? decryptToken(g.icalUrl) : null
}

/* ------------------------------ iCal ------------------------------ */

const unescape = (v) => String(v || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')

/** Hora do iCal ("20261105T170000Z" ou TZID=America/Sao_Paulo:20261105T140000) em ISO com fuso. */
function icalTime(params, value) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim())
  if (!m || !m[4]) return null // dia inteiro
  const [, y, mo, d, h, mi, sec = '00', z] = m
  if (z) return `${y}-${mo}-${d}T${h}:${mi}:${sec}Z`
  const tz = (/TZID=([^;:]+)/.exec(params) || [])[1] || SP_TZ
  // Converte hora local do fuso para UTC (acha o deslocamento do fuso nesse dia).
  // Deslocamento do fuso nesse instante: hora "de parede" no fuso lida como se fosse UTC, menos o instante.
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec)
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(guess))
      .map((x) => [x.type, x.value])
  )
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return new Date(guess - (wall - guess)).toISOString()
}

export function parseIcal(text) {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/)
  const events = []
  let ev = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      ev = { attendees: [] }
      continue
    }
    if (line === 'END:VEVENT') {
      if (ev) events.push(ev)
      ev = null
      continue
    }
    if (!ev) continue
    const i = line.indexOf(':')
    if (i < 0) continue
    const left = line.slice(0, i)
    const value = line.slice(i + 1)
    const [name, ...rest] = left.split(';')
    const params = rest.join(';')
    if (name === 'UID') ev.id = value
    else if (name === 'DTSTART') ev.start = icalTime(params, value)
    else if (name === 'SUMMARY') ev.summary = unescape(value)
    else if (name === 'DESCRIPTION') ev.description = unescape(value)
    else if (name === 'LOCATION') ev.location = unescape(value)
    else if (name === 'STATUS') ev.status = value.toLowerCase()
    else if (name === 'LAST-MODIFIED') ev.updated = value
    else if (name === 'RRULE') ev.recurring = true
    else if (name === 'RECURRENCE-ID') ev.recurrenceId = value
    else if (name === 'X-GOOGLE-CONFERENCE') ev.hangoutLink = value
    else if (name === 'ORGANIZER') ev.organizer = value.replace(/^mailto:/i, '').toLowerCase()
    else if (name === 'ATTENDEE') {
      const email = value.replace(/^mailto:/i, '').toLowerCase()
      const cn = (/CN=("?)([^";]*)\1/.exec(params) || [])[2] || ''
      const partstat = (/PARTSTAT=([^;]+)/.exec(params) || [])[1] || ''
      ev.attendees.push({ email, displayName: cn, responseStatus: partstat === 'DECLINED' ? 'declined' : 'accepted' })
    }
  }
  // Meet que só aparece na descrição.
  for (const e of events) {
    if (!e.hangoutLink) e.hangoutLink = (/(https:\/\/meet\.google\.com\/[a-z-]+)/i.exec(e.description || '') || [])[1] || ''
    if (!e.updated) e.updated = ''
  }
  return events
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
  let url
  try {
    url = await icalUrl()
  } catch (e) {
    return { error: e.message }
  }
  if (!url) return { skipped: 'agenda não conectada' }
  const status = await getDoc(STATUS).catch(() => null)
  const selfEmail = String(status?.exists ? status.data().email || '' : '').toLowerCase()
  const now = Date.now()
  let items
  try {
    const all = parseIcal(await fetchIcal(url))
    items = all
      .filter((e) => e.start && !e.recurring && new Date(e.start).getTime() > now - 3600_000 && new Date(e.start).getTime() < now + 30 * 86400_000)
      .map((e) => ({ ...e, start: { dateTime: e.start } }))
      .sort((a, b) => a.start.dateTime.localeCompare(b.start.dateTime))
  } catch (e) {
    await updateDocPaths(STATUS, { error: e.message, lastSyncAt: new Date().toISOString() }, ['error', 'lastSyncAt']).catch(() => {})
    return { error: e.message }
  }
  const data = { items }
  const upcoming = []
  let linked = 0
  // Eventos já vistos e não mudaram desde a última leitura: não procura a conversa de novo.
  const prevLinks = (status?.exists ? status.data().links : null) || {}
  const links = {}
  for (const ev of data.items || []) {
    if (!ev.start?.dateTime) continue // dia inteiro: não é reunião
    const others = (ev.attendees || []).filter((a) => !a.self && String(a.email || '').toLowerCase() !== selfEmail && a.email !== ev.organizer)
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
  // Evento que estava ligado a uma conversa e sumiu da agenda (ainda no futuro) = cancelado.
  for (const [evId, prev] of Object.entries(prevLinks)) {
    if (links[evId] || !prev?.row?.waId) continue
    const t = prev.row.at ? new Date(`${prev.row.at}:00-03:00`).getTime() : 0
    if (!t || t < now) continue
    const c = await getDoc(`waConversations/${prev.row.waId}`).catch(() => null)
    const conv = c?.exists ? c.data() : null
    if (conv?.sdr?.meeting?.eventId === evId && conv.sdr.meeting.agreed) {
      await updateDocPaths(`waConversations/${prev.row.waId}`, { sdr: { meeting: { agreed: false, when: '', at: '', url: '', eventId: evId } } }, ['sdr.meeting']).catch(() => {})
      await notify?.(conv, prev.row.waId, `${conv.name || prev.row.waId} cancelou a reunião de ${prev.row.when} (sumiu da agenda).`)
    }
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

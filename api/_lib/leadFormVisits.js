// Visitas dos formulários de captura (/captura/:formId) — mesma ideia do funil do
// checkout da Loja. Cada aba que abre o link vira leadFormVisits/{sid} com:
//   origem (UTMs, anúncio), aparelho, até onde chegou, última pergunta, o contato
//   que a pessoa digitou (mesmo sem enviar) e o tempo na página.
// Etapas: 1 abriu · 2 começou · 3 deixou o contato · 4 enviou.
//
// Quando a pessoa envia, o servidor manda o Lead pela API de Conversões do Meta
// com o mesmo event_id do Pixel (lead-{sid}): o Meta junta os dois e conta 1 só,
// e o lead não se perde com bloqueador de anúncio ou iPhone.
//
// Fica dentro do grupo /api/meta (POST /api/meta/form-visit) por causa do limite
// de funções do plano Hobby. Só o servidor grava; a equipe lê direto do Firestore.

import crypto from 'node:crypto'
import { getDoc, setDoc, updateDoc } from './firebaseAdmin.js'
import { tokenFor } from './store/metaCapi.js'

const GRAPH_VERSION = 'v24.0'
const TEST_CODE_TTL_MS = 3 * 3600_000
const validSid = (sid) => /^f_[A-Za-z0-9]{10,40}$/.test(String(sid || ''))
const validFormId = (id) => /^[a-z0-9-]{1,60}$/.test(String(id || ''))
const cut = (v, n) => (v == null ? '' : String(v)).trim().slice(0, n)
const sha = (v) => (v ? crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex') : undefined)
const nowIso = () => new Date().toISOString()

// Barreira simples por instância contra quem tenta encher a coleção.
const hits = new Map()
function tooMany(ip) {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || now - h.at > 15 * 60_000) {
    hits.set(ip, { at: now, n: 1 })
    if (hits.size > 5000) hits.clear()
    return false
  }
  h.n++
  return h.n > 40
}

function parseBody(req) {
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = {}
    }
  }
  return body || {}
}

function cleanUtm(raw = {}) {
  const out = {}
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'fbclid', 'gclid']) {
    if (raw?.[k]) out[k] = cut(raw[k], 200)
  }
  return out
}

function cleanContact(raw = {}) {
  const out = {}
  const name = cut(raw?.name, 120)
  const whatsapp = cut(raw?.whatsapp, 40)
  const email = cut(raw?.email, 160).toLowerCase()
  if (name) out.name = name
  if (whatsapp) out.whatsapp = whatsapp
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.email = email
  return out
}

function cleanAnswers(raw) {
  if (!Array.isArray(raw)) return null
  return raw
    .slice(0, 40)
    .map((a) => ({ label: cut(a?.label, 160), value: cut(a?.value, 400) }))
    .filter((a) => a.value)
}

/** Origem legível: utm_source, senão fbclid/gclid, senão o site que mandou. */
function sourceOf(utm, referrer) {
  if (utm.utm_source) return utm.utm_source.toLowerCase()
  if (utm.fbclid) return 'facebook'
  if (utm.gclid) return 'google'
  try {
    if (referrer) return new URL(referrer).hostname.replace(/^www\./, '').slice(0, 80)
  } catch {}
  return 'direto'
}

function activeTestCode(form) {
  const code = cut(form.capiTestCode, 60)
  if (!code) return null
  const at = form.capiTestCodeAt ? new Date(form.capiTestCodeAt).getTime() : 0
  return at && Date.now() - at < TEST_CODE_TTL_MS ? code : null
}

/** Lead pela API de Conversões. Nunca lança erro. */
async function sendLeadCapi(form, visit, sid) {
  const pixelId = String(form.metaPixelId || '').replace(/\D/g, '')
  if (!pixelId) return { ok: false, skipped: 'sem-pixel' }
  const token = await tokenFor(pixelId).catch(() => null)
  if (!token) return { ok: false, skipped: 'sem-token', pixelId }

  const c = visit.contact || {}
  const t = visit.tracking || {}
  const parts = String(c.name || '').trim().split(/\s+/).filter(Boolean)
  let phone = String(c.whatsapp || '').replace(/\D/g, '')
  if (phone && phone.length <= 11) phone = `55${phone}`
  const ud = {
    em: c.email ? [sha(c.email)] : undefined,
    ph: phone ? [sha(phone)] : undefined,
    fn: parts[0] ? [sha(parts[0])] : undefined,
    ln: parts.length > 1 ? [sha(parts[parts.length - 1])] : undefined,
    country: [sha('br')],
    external_id: [sha(c.email || phone || sid)],
    client_ip_address: t.ip || undefined,
    client_user_agent: t.userAgent || undefined,
    fbp: t.fbp || undefined,
    fbc: t.fbc || undefined,
  }
  const body = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: `lead-${sid}`,
        action_source: 'website',
        event_source_url: t.url || undefined,
        user_data: Object.fromEntries(Object.entries(ud).filter(([, v]) => v !== undefined)),
        custom_data: { content_name: form.name || visit.formName || 'Formulário', lead_source: visit.source || 'direto' },
      },
    ],
  }
  const testCode = activeTestCode(form)
  if (testCode) body.test_event_code = testCode
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, pixelId, error: cut(json?.error?.error_user_msg || json?.error?.message || `HTTP ${res.status}`, 200) }
    return { ok: true, pixelId, test: !!testCode }
  } catch (err) {
    return { ok: false, pixelId, error: cut(err?.message || 'falha de rede', 200) }
  }
}

export async function formVisitHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
  try {
    const body = parseBody(req)
    const sid = String(body.sid || '')
    const formId = String(body.formId || '')
    if (!validSid(sid) || !validFormId(formId)) return res.status(200).json({ ok: true })

    const path = `leadFormVisits/${sid}`
    const snap = await getDoc(path)
    let visit = snap.exists ? snap.data() : null
    if (visit && visit.formId !== formId) return res.status(200).json({ ok: true })
    // Aba esquecida aberta há mais de 1 dia não muda mais a visita antiga.
    if (visit && Date.now() - new Date(visit.createdAt).getTime() > 24 * 3600_000) return res.status(200).json({ ok: true })

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'sem-ip'
    const now = nowIso()
    const step = Math.max(1, Math.min(4, Number(body.step) || 1))
    const submitted = body.submitted === true

    const formSnap = visit && !submitted ? null : await getDoc(`leadForms/${formId}`)
    const form = formSnap?.exists ? formSnap.data() : null

    if (!visit) {
      if (!form || form.active !== true) return res.status(200).json({ ok: true })
      if (tooMany(ip)) return res.status(200).json({ ok: true })
      const utm = cleanUtm(body.utm)
      const referrer = cut(body.referrer, 300) || null
      const tr = body.tracking || {}
      let fbc = cut(tr.fbc, 300) || null
      if (!fbc && utm.fbclid) {
        const at = Number(tr.fbclidAt)
        fbc = `fb.1.${at > 1e12 && at <= Date.now() ? Math.floor(at) : Date.now()}.${utm.fbclid}`
      }
      visit = {
        formId,
        formName: cut(form.name, 120),
        totalQuestions: Math.max(0, Math.min(200, Number(body.totalQuestions) || (Array.isArray(form.questions) ? form.questions.length : 0))),
        device: body.device === 'mobile' ? 'mobile' : 'desktop',
        source: sourceOf(utm, referrer),
        medium: utm.utm_medium || null,
        campaign: utm.utm_campaign || null,
        adset: utm.utm_term || null,
        ad: utm.utm_content || null,
        utm,
        referrer,
        team: body.team === true,
        tracking: {
          fbp: cut(tr.fbp, 200) || null,
          fbc,
          ip: ip === 'sem-ip' ? null : ip,
          userAgent: cut(req.headers['user-agent'], 400) || null,
          url: cut(tr.url, 300) || null,
        },
        step: 1,
        lastQuestionId: null,
        lastQuestionLabel: null,
        lastQuestionIndex: -1,
        contact: {},
        answers: [],
        seconds: 0,
        submittedAt: null,
        capi: null,
        createdAt: now,
        updatedAt: now,
      }
      await setDoc(path, visit)
    }

    const patch = { updatedAt: now }
    const newStep = Math.max(visit.step || 1, submitted ? 4 : step)
    if (newStep !== visit.step) patch.step = newStep

    if (body.question && typeof body.question === 'object') {
      const qi = Number(body.question.index)
      if (Number.isFinite(qi) && qi >= 0 && qi < 500) {
        patch.lastQuestionIndex = qi
        patch.lastQuestionId = cut(body.question.id, 80) || null
        patch.lastQuestionLabel = cut(body.question.label, 200) || null
      }
    }
    if (body.contact) {
      const c = { ...(visit.contact || {}), ...cleanContact(body.contact) }
      if (JSON.stringify(c) !== JSON.stringify(visit.contact || {})) patch.contact = c
      if (Object.keys(c).length && newStep < 3) patch.step = 3
    }
    const answers = cleanAnswers(body.answers)
    if (answers) patch.answers = answers
    const secs = Math.round(Number(body.seconds) || 0)
    if (secs > (visit.seconds || 0)) patch.seconds = Math.min(secs, 6 * 3600)
    if (body.leadOrigin === true) patch.leadSaved = true

    let capi = null
    if (submitted && !visit.submittedAt) {
      patch.submittedAt = now
      const merged = { ...visit, ...patch }
      if (form) {
        capi = await sendLeadCapi(form, merged, sid)
        patch.capi = { ...capi, at: now }
        if (!capi.ok && !capi.skipped) console.warn(`[form-visit] CAPI Lead falhou (${formId}/${sid}):`, capi.error)
      }
    }

    if (Object.keys(patch).length > 1) await updateDoc(path, patch)
    return res.status(200).json({ ok: true, ...(capi ? { capi: { ok: capi.ok, skipped: capi.skipped || null } } : {}) })
  } catch (err) {
    console.error('[form-visit] erro:', err)
    // Nunca atrapalha quem está respondendo o formulário.
    return res.status(200).json({ ok: false })
  }
}

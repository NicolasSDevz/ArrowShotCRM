// API de Conversões do Meta (CAPI) da Loja — o servidor avisa o Meta da venda,
// mesmo quando o comprador fecha a página antes do Pixel disparar (Pix confirmado
// depois, bloqueador de anúncio, iOS). O navegador manda o mesmo event_id, então
// o Meta junta os dois e conta a venda uma vez só.
//
// Token: um por pixel, gravado cifrado em storeSecrets/metaCapi (nunca vai pro navegador).

import crypto from 'node:crypto'
import { getDoc, setDoc, updateDocPaths } from '../firebaseAdmin.js'
import { encryptToken, decryptToken } from '../tokenCrypto.js'

const GRAPH_VERSION = 'v19.0'
const SECRET_DOC = 'storeSecrets/metaCapi'

const sha = (v) => (v ? crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex') : undefined)

export function cleanPixelId(raw) {
  const id = String(raw || '').replace(/\D/g, '')
  return id.length >= 10 && id.length <= 20 ? id : null
}

async function readSecrets() {
  const snap = await getDoc(SECRET_DOC)
  return snap.exists ? snap.data()?.pixels || {} : {}
}

async function tokenFor(pixelId) {
  const entry = (await readSecrets())[pixelId]
  if (!entry) return null
  try {
    return decryptToken(entry)
  } catch {
    return null
  }
}

export async function saveCapiToken(pixelId, token, by) {
  const pixels = await readSecrets()
  pixels[pixelId] = { ...encryptToken(String(token).trim()), updatedAt: new Date().toISOString(), updatedBy: by }
  await setDoc(SECRET_DOC, { pixels })
}

export async function removeCapiToken(pixelId) {
  const pixels = await readSecrets()
  delete pixels[pixelId]
  await setDoc(SECRET_DOC, { pixels })
}

/** Quais pixels têm token salvo (sem devolver o token). */
export async function capiStatus() {
  const pixels = await readSecrets()
  return { pixels: Object.fromEntries(Object.entries(pixels).map(([id, v]) => [id, { updatedAt: v.updatedAt || null, updatedBy: v.updatedBy || null }])) }
}

/** Dados de rastreio do comprador guardados no pedido (cookies do Pixel, IP, navegador). */
export function trackingFromRequest(req, raw = {}) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null
  const fbclid = raw.fbclid ? String(raw.fbclid).slice(0, 500) : null
  let fbc = raw.fbc ? String(raw.fbc).slice(0, 500) : null
  if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`
  return {
    fbp: raw.fbp ? String(raw.fbp).slice(0, 200) : null,
    fbc,
    ip,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 400) || null,
    url: raw.url ? String(raw.url).slice(0, 500) : null,
  }
}

function userData(order) {
  const b = order.buyer || {}
  const t = order.tracking || {}
  const parts = String(b.name || '').trim().split(/\s+/)
  let phone = String(b.phone || '').replace(/\D/g, '')
  if (phone && phone.length <= 11) phone = `55${phone}`
  const ud = {
    em: [sha(b.email)],
    ph: phone ? [sha(phone)] : undefined,
    fn: parts[0] ? [sha(parts[0])] : undefined,
    ln: parts.length > 1 ? [sha(parts[parts.length - 1])] : undefined,
    country: [sha('br')],
    external_id: [sha(b.email)],
    client_ip_address: t.ip || undefined,
    client_user_agent: t.userAgent || undefined,
    fbp: t.fbp || undefined,
    fbc: t.fbc || undefined,
  }
  return Object.fromEntries(Object.entries(ud).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v[0])))
}

/** Manda um evento. Nunca lança erro (venda não pode travar por causa do Meta). */
export async function sendCapiEvent({ pixelId, token, eventName, eventId, order, testCode }) {
  const body = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'website',
        event_source_url: order.tracking?.url || undefined,
        user_data: userData(order),
        custom_data: {
          currency: 'BRL',
          value: Number(order.amount || 0) / 100,
          content_type: 'product',
          content_ids: order.productIds || [order.productId],
          content_name: (order.items || []).map((i) => i.name).join(' + '),
          num_items: (order.items || []).length || 1,
          order_id: order.id,
        },
      },
    ],
  }
  if (testCode) body.test_event_code = testCode
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.error?.error_user_msg || json?.error?.message || `HTTP ${res.status}` }
    return { ok: true, received: json.events_received ?? null }
  } catch (err) {
    return { ok: false, error: err?.message || 'falha de rede' }
  }
}

/** Purchase de um pedido aprovado. O event_id bate com o que o navegador manda (dedup). Grava o resultado no pedido. */
export async function trackOrderEvent(order, product, eventName) {
  if (!order || order.test) return null
  const pixelId = cleanPixelId(product?.checkout?.fbPixelId)
  if (!pixelId || product?.checkout?.capiEnabled === false) return null
  const token = await tokenFor(pixelId)
  if (!token) return null
  const key = eventName === 'Purchase' ? 'purchase' : 'paymentInfo'
  if (order.capi?.[key]?.ok) return order.capi[key]
  const result = await sendCapiEvent({
    pixelId,
    token,
    eventName,
    eventId: eventName === 'Purchase' ? `purchase-${order.id}` : `payinfo-${order.id}`,
    order,
    testCode: product.checkout.capiTestCode || null,
  })
  const entry = { ...result, pixelId, at: new Date().toISOString() }
  await updateDocPaths(`storeOrders/${order.id}`, { capi: { [key]: entry } }, [`capi.${key}`]).catch(() => {})
  if (!result.ok) console.warn(`[loja] CAPI ${eventName} falhou (${order.id}):`, result.error)
  return entry
}

/** Evento de teste (botão "Testar" no CRM) — aparece em Eventos de teste do Gerenciador. */
export async function sendCapiTest(pixelId, testCode) {
  const token = await tokenFor(pixelId)
  if (!token) return { ok: false, error: 'Token não salvo para esse pixel' }
  return sendCapiEvent({
    pixelId,
    token,
    eventName: 'Purchase',
    eventId: `teste-${Date.now()}`,
    order: { id: 'teste', amount: 100, items: [{ name: 'Teste do CRM' }], productIds: ['teste'], buyer: { email: 'teste@exemplo.com', name: 'Teste CRM' }, tracking: {} },
    testCode: testCode || null,
  })
}

// Núcleo da Loja (checkout + área de membros) no servidor.
//
// Coleções (Firestore):
//   storeProducts/{id}            produto, tela de checkout e aparência da área de membros
//   storeProducts/{id}/modules    módulos       storeProducts/{id}/lessons  aulas
//   storeCoupons/{id}             cupons (só a equipe lê; o checkout valida aqui)
//   storeOrders/{id}              pedidos (gravados SÓ por aqui, via service account)
//   storeMembers/{uid}            alunos        storeEnrollments/{uid}_{productId}  acessos
//   storeMemberSecrets/{uid}      hash da senha do aluno (ninguém lê pelo navegador)
//   storeAccessCodes/{sha256}     links de acesso (?code=) → uid
//
// O aluno entra com um custom token (claim member: true) — nunca vira usuário
// do CRM: não tem doc em users/ e as regras tratam "member" à parte.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { getDoc, setDoc, updateDoc, queryDocs, listDocs } from '../firebaseAdmin.js'
import { emitInvoice } from './invoice.js'

export const nowIso = () => new Date().toISOString()

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex')
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

/** uid estável por e-mail — o mesmo aluno em várias compras é uma conta só. */
export function memberUidFor(email) {
  return `m_${sha256(normalizeEmail(email)).slice(0, 26)}`
}

export function publicOrigin(req) {
  if (process.env.STORE_PUBLIC_URL) return process.env.STORE_PUBLIC_URL.replace(/\/+$/, '')
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return `${proto}://${host}`
}

/* --------------------------- recebimento --------------------------- */

/** storeSettings/payments — Pix direto na conta (ex.: Nubank), sem taxa.
 *  { pixManual: bool, pixKey, pixKeyType, pixName, pixCity, whatsapp } */
export async function getPaymentSettings() {
  const snap = await getDoc('storeSettings/payments')
  const s = snap.exists ? snap.data() : {}
  const manualReady = s.pixManual === true && !!s.pixKey && !!s.pixName
  return { ...s, manualReady }
}

/** Conta Pix que recebe este produto: a extra escolhida no produto, ou a principal. */
export function pixAccountFor(settings, product) {
  const extra = (settings.pixAccounts || []).find((a) => a.id && a.id === product.pixAccountId && a.pixKey && a.pixName)
  if (extra) return { ...extra, label: extra.label || 'Conta extra' }
  return { id: '', label: 'Conta principal', pixKey: settings.pixKey, pixKeyType: settings.pixKeyType, pixName: settings.pixName, pixCity: settings.pixCity }
}

/** Aviso no sino do CRM para admins e gerentes ativos. */
export async function notifyStaff(type, message, actorName = 'Loja') {
  try {
    const users = await listDocs('users')
    const staff = users.filter((u) => u.active !== false && (u.role === 'admin' || u.role === 'manager'))
    await Promise.all(
      staff.map((u) =>
        setDoc(`notifications/${randomUUID()}`, { userId: u.id, type, message, actorName, read: false, createdAt: new Date() })
      )
    )
  } catch (err) {
    console.warn('[loja] falha ao notificar a equipe:', err?.message)
  }
}

/* ------------------------------ produtos ------------------------------ */

export async function getProduct(id) {
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
  const snap = await getDoc(`storeProducts/${id}`)
  return snap.exists ? { id, ...snap.data() } : null
}

export async function getProductBySlug(slug) {
  if (!slug || !/^[A-Za-z0-9_-]{1,64}$/.test(slug)) return null
  const rows = await queryDocs('storeProducts', [['slug', slug]])
  return rows[0] || null
}

/** Desconto do Pix do produto, entre 0 e 90%. */
export function pixDiscount(product) {
  return Math.min(90, Math.max(0, Number(product.pixDiscountPercent) || 0))
}

/** Order bumps válidos do produto (só produtos ativos), com o preço da oferta. */
export async function resolveBumps(product) {
  const bumps = Array.isArray(product.checkout?.bumps) ? product.checkout.bumps : []
  const out = []
  for (const b of bumps) {
    if (!b?.productId || b.productId === product.id) continue
    const p = await getProduct(b.productId)
    if (!p || p.status !== 'active') continue
    const price = Number.isInteger(b.price) && b.price > 0 ? b.price : p.price
    out.push({
      productId: p.id,
      name: p.name,
      imageUrl: p.imageUrl || null,
      headline: b.headline || `Leve também: ${p.name}`,
      description: b.description || p.description || '',
      cta: b.cta || 'Sim, eu quero!',
      price,
      fullPrice: p.price,
    })
  }
  return out
}

/** Dados que o checkout público pode ver (nada de cupons nem config interna). */
export function publicCheckout(product, bumps, gateway, settings = {}) {
  const c = product.checkout || {}
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description || '',
    imageUrl: product.imageUrl || null,
    price: product.price,
    comparePrice: product.comparePrice || null,
    supportEmail: product.supportEmail || null,
    maxInstallments: product.maxInstallments || 12,
    pixDiscountPercent: pixDiscount(product),
    paymentMethods: {
      pix: product.paymentMethods?.pix !== false && (gateway.mercadoPago || settings.manualReady === true),
      card: product.paymentMethods?.card !== false && gateway.mercadoPago,
    },
    checkout: {
      primaryColor: c.primaryColor || '#2563eb',
      backgroundColor: c.backgroundColor || '#f1f5f9',
      font: c.font || 'Inter',
      headerImageUrl: c.headerImageUrl || null,
      headline: c.headline || product.name,
      subheadline: c.subheadline || '',
      countdown: c.countdown?.enabled ? { minutes: Number(c.countdown.minutes) || 15, text: c.countdown.text || 'Oferta por tempo limitado', color: c.countdown.color || '#e55858' } : null,
      sideImages: Array.isArray(c.sideImages) ? c.sideImages.filter(Boolean).slice(0, 6) : [],
      benefits: Array.isArray(c.benefits) ? c.benefits.filter(Boolean).slice(0, 8) : [],
      testimonials: Array.isArray(c.testimonials) ? c.testimonials.filter((t) => t?.text).slice(0, 6) : [],
      guaranteeDays: Number(c.guaranteeDays) || 0,
      askPhone: c.askPhone !== false,
      askCpf: c.askCpf === true,
      confirmEmail: c.confirmEmail === true,
      buttonText: c.buttonText || 'Comprar agora',
      fbPixelId: c.fbPixelId || null,
      thankYouUrl: c.thankYouUrl || null,
      footerText: c.footerText || '',
    },
    bumps,
    gateway: {
      mercadoPago: gateway.mercadoPago,
      publicKey: gateway.publicKey,
      // Pix direto na conta tem prioridade sobre o Pix do Mercado Pago (sem taxa).
      pixManual: settings.manualReady === true,
      testMode: !gateway.mercadoPago && !settings.manualReady && product.testMode === true,
    },
  }
}

/* ------------------------------- cupons ------------------------------- */

export async function findCoupon(code, productId) {
  const clean = String(code || '').trim().toUpperCase()
  if (!clean || clean.length > 40) return null
  const rows = await queryDocs('storeCoupons', [['code', clean]])
  const c = rows.find((r) => r.active !== false && (!r.productId || r.productId === productId))
  if (!c) return null
  if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) return null
  if (Number(c.maxUses) > 0 && Number(c.uses || 0) >= Number(c.maxUses)) return null
  const percent = Math.min(100, Math.max(0, Number(c.percent) || 0))
  if (!percent) return null
  return { id: c.id, code: clean, percent }
}

/* --------------------------- alunos e acesso --------------------------- */

export async function ensureMember({ email, name, phone }) {
  const uid = memberUidFor(email)
  const snap = await getDoc(`storeMembers/${uid}`)
  if (!snap.exists) {
    await setDoc(`storeMembers/${uid}`, {
      email: normalizeEmail(email),
      name: String(name || '').trim() || normalizeEmail(email),
      phone: phone || null,
      hasPassword: false,
      createdAt: nowIso(),
      lastAccessAt: null,
    })
  } else if (phone && !snap.data().phone) {
    await updateDoc(`storeMembers/${uid}`, { phone })
  }
  return uid
}

export async function grantAccess({ uid, email, productId, orderId = null, source = 'compra', grantedBy = null }) {
  await setDoc(`storeEnrollments/${uid}_${productId}`, {
    uid,
    email: normalizeEmail(email),
    productId,
    orderId,
    source,
    grantedBy,
    active: true,
    createdAt: nowIso(),
  })
}

export async function revokeAccess(uid, productId) {
  await updateDoc(`storeEnrollments/${uid}_${productId}`, { active: false, revokedAt: nowIso() })
}

/** Gera um link de acesso novo (o código em claro só existe na URL). */
export async function createAccessLink(origin, uid) {
  const code = randomToken(24)
  await setDoc(`storeAccessCodes/${sha256(code)}`, { uid, createdAt: nowIso(), revoked: false })
  return `${origin}/membros/entrar?code=${code}`
}

export async function uidFromAccessCode(code) {
  if (!code || !/^[A-Za-z0-9_-]{20,80}$/.test(code)) return null
  const snap = await getDoc(`storeAccessCodes/${sha256(code)}`)
  if (!snap.exists) return null
  const data = snap.data()
  return data.revoked ? null : data.uid
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), salt, 64).toString('hex')
  return { salt, hash }
}

export function checkPassword(password, salt, hash) {
  if (!salt || !hash) return false
  const test = scryptSync(String(password), salt, 64)
  const stored = Buffer.from(hash, 'hex')
  return stored.length === test.length && timingSafeEqual(stored, test)
}

/* ------------------------------- e-mail ------------------------------- */

/** E-mail de acesso via Resend (opcional). Variáveis: RESEND_API_KEY e
 *  STORE_EMAIL_FROM (ex.: "Arrow Shot <acesso@seudominio.com.br>"). Sem elas,
 *  o link aparece na página de obrigado e no CRM (aba Alunos) pra enviar
 *  pelo WhatsApp. */
export async function sendAccessEmail({ to, name, productNames, accessUrl, supportEmail }) {
  const key = process.env.RESEND_API_KEY
  const from = process.env.STORE_EMAIL_FROM
  if (!key || !from) return false
  const first = String(name || '').split(' ')[0] || 'Olá'
  const list = productNames.map((n) => `<li>${escapeHtml(n)}</li>`).join('')
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0f172a">
    <h2>${escapeHtml(first)}, sua compra foi aprovada!</h2>
    <p>Você já tem acesso a:</p><ul>${list}</ul>
    <p><a href="${accessUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Acessar a área de membros</a></p>
    <p style="font-size:13px;color:#64748b">Guarde este e-mail: o botão acima é o seu acesso. No primeiro acesso você pode criar uma senha.</p>
    ${supportEmail ? `<p style="font-size:13px;color:#64748b">Dúvidas: ${escapeHtml(supportEmail)}</p>` : ''}
  </div>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: 'Seu acesso chegou', html }),
      signal: AbortSignal.timeout(15_000),
    })
    return res.ok
  } catch (err) {
    console.warn('[loja] falha ao enviar e-mail:', err?.message)
    return false
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
}

/* ------------------------------ entrega ------------------------------- */

/** Libera o acesso de um pedido aprovado. Idempotente: pode ser chamado pelo
 *  webhook e pela página de obrigado ao mesmo tempo sem duplicar nada. */
export async function fulfillOrder(origin, orderId) {
  const snap = await getDoc(`storeOrders/${orderId}`)
  if (!snap.exists) return null
  const order = { id: orderId, ...snap.data() }
  if (order.status !== 'approved' || order.fulfilledAt) return order

  const uid = await ensureMember({ email: order.buyer.email, name: order.buyer.name, phone: order.buyer.phone })
  for (const item of order.items || []) {
    await grantAccess({ uid, email: order.buyer.email, productId: item.productId, orderId })
  }
  const accessUrl = await createAccessLink(origin, uid)
  if (order.couponId) {
    const c = await getDoc(`storeCoupons/${order.couponId}`)
    if (c.exists) await updateDoc(`storeCoupons/${order.couponId}`, { uses: Number(c.data().uses || 0) + 1 })
  }
  const emailSent = await sendAccessEmail({
    to: order.buyer.email,
    name: order.buyer.name,
    productNames: (order.items || []).map((i) => i.name),
    accessUrl,
    supportEmail: order.supportEmail,
  })
  const patch = { fulfilledAt: nowIso(), memberUid: uid, accessUrl, emailSent }
  await updateDoc(`storeOrders/${orderId}`, patch)
  if (!order.test) {
    const total = (order.amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    await notifyStaff('store_sale', `Venda aprovada: ${order.buyer.name} comprou ${order.items.map((i) => i.name).join(' + ')} por ${total}.`)
    // Nota fiscal automática (se ligada em Loja > Nota fiscal). Erro não trava a venda.
    await emitInvoice(orderId).catch((err) => console.warn('[loja] nota fiscal falhou:', err?.message))
  }
  return { ...order, ...patch }
}

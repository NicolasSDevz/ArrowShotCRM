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
import { getDoc, setDoc, updateDoc, deleteDoc, queryDocs, listDocs, createDocIfMissing, incrementField } from '../firebaseAdmin.js'
import { emitInvoice, cancelInvoice } from './invoice.js'
import { trackOrderEvent } from './metaCapi.js'
import { mpConfigured, getPayment, orderStatusFromMp, refundPayment } from './mercadoPago.js'
import { mpAccountForOrder } from './mpAccounts.js'
import { sendPushToUsers } from '../webPush.js'

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

const PUSH_TAG = { store_sale: 'venda', store_pix_generated: 'pix-gerado', store_card_refused: 'cartao-recusado', store_cart_abandoned: 'carrinho', store_pix_pending: 'pix', store_refund_request: 'reembolso', store_refund: 'estorno', store_capi_error: 'meta' }

/** Limite simples por chave (IP, e-mail) numa janela de tempo. false = passou do limite. */
export async function rateLimit(key, max, windowMs) {
  const path = `storeRateLimits/${sha256(key).slice(0, 40)}`
  const snap = await getDoc(path)
  const d = snap.exists ? snap.data() : null
  if (!d || Date.now() - new Date(d.windowStart).getTime() > windowMs) {
    await setDoc(path, { windowStart: nowIso(), count: 1 })
    return true
  }
  if (Number(d.count) >= max) return false
  await incrementField(path, 'count', 1)
  return true
}

/** Aviso da Loja: só no celular (notificação push) de admins e gerentes ativos que
 *  ativaram nos aparelhos. Nada vai pro sino do CRM. "Pix pago: ..." vira título + texto.
 *  privateTo: produto privado, o aviso vai só pra dona dele. */
export async function notifyStaff(type, message, _actorName = 'Loja', { privateTo = null } = {}) {
  try {
    const users = await listDocs('users')
    const staff = users.filter((u) => u.active !== false && (u.role === 'admin' || u.role === 'manager') && (!privateTo || u.id === privateTo))
    const cut = message.indexOf(': ')
    const title = cut > 0 && cut < 40 ? message.slice(0, cut) : 'Loja'
    const body = cut > 0 && cut < 40 ? message.slice(cut + 2) : message
    await sendPushToUsers(staff.map((u) => u.id), { title, body, url: '/loja', tag: `${PUSH_TAG[type] || type}-${Date.now()}` })
  } catch (err) {
    console.warn('[loja] falha ao notificar a equipe:', err?.message)
  }
}

/* ------------------------------ privados ------------------------------ */

/** Quem pode usar o "Só eu vejo" (e-mail do login no CRM). Igual em src/types/store.ts
 *  (PRIVATE_OWNER_EMAILS) e em firestore.rules (canUsePrivate). */
export const PRIVATE_OWNER_EMAILS = ['gestorarrowshot@gmail.com']

export function canUsePrivate(email) {
  return PRIVATE_OWNER_EMAILS.includes(String(email || '').toLowerCase())
}

/** Quem pode ver um produto/pedido/cupom privado: só a dona (privateTo). */
export function visibleTo(doc, uid) {
  return !doc?.privateTo || doc.privateTo === uid
}

/* --------------------------- áreas de membros --------------------------- */

/** Caminho da área de membros de um produto: /membros (principal) ou /m/{slug}. */
export async function membersPathFor(productId) {
  const product = productId ? await getProduct(productId) : null
  const areaId = product?.membersAreaId
  if (!areaId || !/^[A-Za-z0-9_-]{1,64}$/.test(areaId)) return '/membros'
  const snap = await getDoc(`storeMemberAreas/${areaId}`)
  const slug = snap.exists ? snap.data().slug : null
  return slug && /^[a-z0-9-]{2,40}$/.test(slug) ? `/m/${slug}` : '/membros'
}

/** Área pelo endereço (/m/{slug}). null = não existe. */
export async function memberAreaBySlug(slug) {
  if (!slug || !/^[a-z0-9-]{2,40}$/.test(slug)) return null
  const rows = await queryDocs('storeMemberAreas', [['slug', slug]])
  return rows[0] || null
}

/* -------------------------- carrinho abandonado -------------------------- */

export function abandonedId(productId, email) {
  return `${productId}_${sha256(normalizeEmail(email)).slice(0, 20)}`
}

/** Carrinho vira "abandonado" depois de 15 min sem pagar (igual ao CRM e ao aviso no celular). */
export const ABANDON_AFTER_MS = 15 * 60_000

/** Comprou. Se o carrinho chegou a ser abandonado (15 min parado ou já avisado no
 *  celular), vira "recuperado". Se comprou direto, é venda normal: o carrinho some. */
async function markRecovered(order) {
  const paidAt = new Date(order.approvedAt || nowIso()).getTime()
  for (const pid of order.productIds || [order.productId]) {
    const path = `storeAbandoned/${abandonedId(pid, order.buyer?.email)}`
    const snap = await getDoc(path).catch(() => null)
    if (!snap?.exists || snap.data().recoveredAt) continue
    const cart = snap.data()
    const wasAbandoned = cart.notified === true || paidAt - new Date(cart.updatedAt).getTime() > ABANDON_AFTER_MS
    // recoveredVia: voltou pelo e-mail do Archer (utm_source=archer) ou comprou depois de conversar com ele no checkout.
    const recoveredVia = order.utm?.utm_source === 'archer' ? 'archer-email' : order.archerChat ? 'archer-chat' : null
    if (wasAbandoned) await updateDoc(path, { recoveredAt: nowIso(), recoveredVia, orderId: order.id, orderStatus: 'approved', updatedAt: nowIso() }).catch(() => {})
    else await deleteDoc(path).catch(() => {})
  }
}

/** Avisa no celular os carrinhos que ficaram 15 min sem pagar (uma vez cada). Roda junto
 *  com o movimento da loja (checkout, pagamento, CRM aberto), no máximo 1x a cada 5 min,
 *  e na rotina diária: o plano da Vercel não deixa agendar de 5 em 5 minutos. Carrinho
 *  antigo (de antes deste aviso) não tem o campo notified e não é avisado. */
export async function notifyAbandonedCarts({ force = false } = {}) {
  if (!force && !(await rateLimit('sweep-carts', 1, 5 * 60_000))) return { skipped: true }
  const rows = await queryDocs('storeAbandoned', [['notified', false]])
  let sent = 0
  for (const a of rows) {
    if (a.recoveredAt) {
      await updateDoc(`storeAbandoned/${a.id}`, { notified: true }).catch(() => {})
      continue
    }
    if (Date.now() - new Date(a.updatedAt).getTime() < ABANDON_AFTER_MS) continue
    await updateDoc(`storeAbandoned/${a.id}`, { notified: true }).catch(() => {})
    const total = (Number(a.amount || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const how = a.orderStatus === 'pending' ? 'gerou o Pix e não pagou' : a.orderStatus === 'refused' ? 'teve o pagamento recusado e não voltou' : 'preencheu os dados e não pagou'
    await notifyStaff('store_cart_abandoned', `Carrinho abandonado: ${a.name || a.email} ${how} (${a.productName}, ${total}). Chame na aba Abandonados.`, 'Loja', { privateTo: a.privateTo })
    sent++
  }
  return { pending: rows.length, sent }
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
    // Rascunho pode ser vendido como bump (não precisa de checkout próprio); arquivado não.
    if (!p || p.status === 'archived') continue
    const price = Number.isInteger(b.price) && b.price > 0 ? b.price : p.price
    out.push({
      productId: p.id,
      name: p.name,
      imageUrl: p.imageUrl || null,
      headline: b.headline || `Leve também: ${p.name}`,
      description: b.description || p.description || '',
      cta: b.cta || 'Sim, eu quero!',
      animation: ['pulse', 'glow', 'shake', 'bounce', 'arrow', 'blink'].includes(b.animation) ? b.animation : 'none',
      position: ['top', 'beforePayment', 'payment', 'button', 'side'].includes(b.position) ? b.position : 'payment',
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
      countdown: c.countdown?.enabled
        ? {
            minutes: Number(c.countdown.minutes) || 15,
            text: c.countdown.text || 'Oferta por tempo limitado',
            color: c.countdown.color || '#e55858',
            textColor: c.countdown.textColor || '#ffffff',
            position: ['top', 'form', 'side', 'button'].includes(c.countdown.position) ? c.countdown.position : 'top',
            mobilePosition: ['top', 'form', 'button'].includes(c.countdown.mobilePosition) ? c.countdown.mobilePosition : null,
            devices: ['all', 'desktop', 'mobile'].includes(c.countdown.devices) ? c.countdown.devices : 'all',
          }
        : null,
      design: c.design && typeof c.design === 'object' ? c.design : {},
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
  return { id: c.id, code: clean, percent, maxUses: Number(c.maxUses) || 0, uses: Number(c.uses) || 0 }
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

/** Gera um link de acesso novo (o código em claro só existe na URL).
 *  basePath: área de membros do produto (/membros ou /m/{slug}). */
export async function createAccessLink(origin, uid, basePath = '/membros') {
  const code = randomToken(24)
  await setDoc(`storeAccessCodes/${sha256(code)}`, { uid, createdAt: nowIso(), revoked: false })
  return `${origin}${basePath}/entrar?code=${code}`
}

/** Link de acesso vale por 30 dias a partir do primeiro uso (depois o aluno entra
 *  com senha ou pede um link novo). Assim um link repassado não vale pra sempre. */
const ACCESS_LINK_TTL_MS = 30 * 86400_000

/** { uid } quando o link vale; { expired: true } quando venceu; null quando não existe. */
export async function uidFromAccessCode(code) {
  if (!code || !/^[A-Za-z0-9_-]{20,80}$/.test(code)) return null
  const path = `storeAccessCodes/${sha256(code)}`
  const snap = await getDoc(path)
  if (!snap.exists) return null
  const data = snap.data()
  if (data.revoked) return null
  if (data.firstUsedAt && Date.now() - new Date(data.firstUsedAt).getTime() > ACCESS_LINK_TTL_MS) return { expired: true }
  await updateDoc(path, { ...(data.firstUsedAt ? {} : { firstUsedAt: nowIso() }), uses: Number(data.uses || 0) + 1, lastUsedAt: nowIso() })
  return { uid: data.uid }
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), salt, 64).toString('hex')
  return { salt, hash }
}

/** Senha provisória vale 1 dia; depois o aluno entra pelo link ou pede outra. */
export const TEMP_PASSWORD_TTL_MS = 86400_000

/** Gera e grava uma senha provisória curta (fácil de digitar).
 *  Substitui a senha anterior. O texto em claro só volta para quem pediu. */
export async function createTempPassword(uid) {
  // 6 caracteres (3 letras + 3 números), sem os que confundem (0/o, 1/l/i). Vale 1 dia e o
  // login tem limite de tentativas, então curta não é fácil de adivinhar.
  const letters = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const pick = (set, n) => Array.from(randomBytes(n), (b) => set[b % set.length]).join('')
  const password = `${pick(letters, 3)}${pick(digits, 3)}`
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_MS).toISOString()
  await setDoc(`storeMemberSecrets/${uid}`, { ...hashPassword(password), temporary: true, expiresAt, updatedAt: nowIso() })
  await updateDoc(`storeMembers/${uid}`, { hasPassword: false, mustChangePassword: true, tempPasswordUntil: expiresAt })
  return { password, expiresAt }
}

/** Data curta em português (ex.: 16/10 às 14h30), no horário de Brasília. */
export function shortDateBr(iso) {
  const d = new Date(iso)
  const day = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(':', 'h')
  return `${day} às ${time}`
}

export function checkPassword(password, salt, hash) {
  if (!salt || !hash) return false
  const test = scryptSync(String(password), salt, 64)
  const stored = Buffer.from(hash, 'hex')
  return stored.length === test.length && timingSafeEqual(stored, test)
}

/* ------------------------------- e-mail ------------------------------- */

/** Envio de e-mail da Loja. Dois jeitos (o primeiro configurado vale):
 *  - Gmail: GMAIL_USER (ex.: conta@gmail.com) e GMAIL_APP_PASSWORD (senha de
 *    app de 16 letras, com verificação em duas etapas ligada). Nome do
 *    remetente opcional em STORE_EMAIL_NAME. Limite do Gmail: ~500 por dia.
 *  - Resend: RESEND_API_KEY e STORE_EMAIL_FROM ("Nome <acesso@dominio>").
 *  Sem nenhum, o link aparece na página de obrigado e no CRM (aba Alunos) pra
 *  enviar pelo WhatsApp. */
/** Conta do Gmail. Aceita também GMAIL_USE (nome cadastrado sem o R na Vercel). */
function gmailUser() {
  return (process.env.GMAIL_USER || process.env.GMAIL_USE || '').trim()
}

export function emailConfigured() {
  return Boolean((gmailUser() && process.env.GMAIL_APP_PASSWORD) || (process.env.RESEND_API_KEY && process.env.STORE_EMAIL_FROM))
}

let gmailTransport = null
/** Motivo da última falha de envio (pro e-mail de teste mostrar na tela). */
export let lastMailError = ''

/** Versão em texto puro do HTML: e-mail só com HTML pesa contra no filtro de spam. */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<span style="display:none[^>]*>[\s\S]*?<\/span>/i, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => `${label.replace(/<[^>]+>/g, '').trim()}: ${href}`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|tr|li|div)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Manda um e-mail; true se saiu. Nunca lança erro (e-mail não trava venda).
 *  `unsubscribeUrl` (lembretes): cabeçalho List-Unsubscribe de um clique, que o
 *  Gmail exige de quem manda e-mail que não é transacional. */
export async function sendMail({ to, subject, html, text, unsubscribeUrl }) {
  const plain = text || htmlToText(html)
  const headers = unsubscribeUrl ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined
  const replyTo = (process.env.STORE_EMAIL_REPLY_TO || '').trim() || undefined
  try {
    const user = gmailUser()
    const pass = process.env.GMAIL_APP_PASSWORD
    if (user && pass) {
      if (!gmailTransport) {
        const { default: nodemailer } = await import('nodemailer')
        gmailTransport = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          // A senha de app aparece com espaços no Google; tanto faz colar com ou sem.
          auth: { user, pass: pass.replace(/\s/g, '') },
          connectionTimeout: 15_000,
          socketTimeout: 15_000,
        })
      }
      const name = (process.env.STORE_EMAIL_NAME || 'Arrow Shot').replace(/["<>]/g, '')
      await gmailTransport.sendMail({ from: `"${name}" <${user}>`, to, subject, html, text: plain, replyTo, headers })
      return true
    }
    const key = process.env.RESEND_API_KEY
    const from = process.env.STORE_EMAIL_FROM
    if (!key || !from) return false
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text: plain, ...(replyTo ? { reply_to: replyTo } : {}), ...(headers ? { headers } : {}) }),
      signal: AbortSignal.timeout(15_000),
    })
    return res.ok
  } catch (err) {
    lastMailError = String(err?.response || err?.message || err || '').slice(0, 300)
    console.warn('[loja] falha ao enviar e-mail:', lastMailError)
    // Transporte com erro de login é refeito na próxima tentativa (senha trocada na Vercel).
    gmailTransport = null
    return false
  }
}

/* ----------------------------- modelo do e-mail ----------------------------- */

/** Marca do e-mail: nome, logo e cor da área de membros do produto (ou da principal). */
export async function emailBrandFor({ productId = null, areaId = null } = {}) {
  let theme = null
  try {
    const product = productId ? await getProduct(productId) : null
    const aid = areaId || product?.membersAreaId || null
    if (aid && /^[A-Za-z0-9_-]{1,64}$/.test(aid)) theme = (await getDoc(`storeMemberAreas/${aid}`)).data() || null
    if (!theme) theme = (await getDoc('storeSettings/membersTheme')).data() || null
  } catch {
    theme = null
  }
  const color = /^#[0-9a-f]{6}$/i.test(theme?.primaryColor || '') ? theme.primaryColor : '#2563eb'
  // Gmail não mostra imagem em data URI: logo só se for um endereço https.
  const logo = /^https:\/\//.test(theme?.logoUrl || '') ? theme.logoUrl : null
  return { name: String(theme?.brandName || 'Área de Membros').slice(0, 60), logo, color }
}

/** Texto escuro ou claro sobre a cor do botão. */
function onColor(hex) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#0f172a' : '#ffffff'
}

/** Moldura dos e-mails da Loja: cabeçalho com a marca, cartão branco e rodapé.
 *  Feito com tabela e estilo na linha (é o que os programas de e-mail entendem). */
export function emailLayout(brand, { preheader, title, body, button, footer }) {
  const font = "font-family:Arial,Helvetica,sans-serif"
  const header = brand.logo
    ? `<img src="${escapeHtml(brand.logo)}" alt="${escapeHtml(brand.name)}" height="40" style="display:block;margin:0 auto;max-height:40px;border:0">`
    : `<span style="${font};font-size:20px;font-weight:bold;color:#0f172a">${escapeHtml(brand.name)}</span>`
  const btn = button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 4px"><tr><td style="border-radius:10px;background:${brand.color}">
        <a href="${escapeHtml(button.url)}" style="${font};display:inline-block;padding:14px 32px;font-size:16px;font-weight:bold;color:${onColor(brand.color)};text-decoration:none;border-radius:10px">${escapeHtml(button.label)}</a>
      </td></tr></table>`
    : ''
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
        <tr><td align="center" style="padding:0 0 20px">${header}</td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;border-top:4px solid ${brand.color};padding:32px 28px;${font};color:#0f172a">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a">${escapeHtml(title)}</h1>
          ${body}
          ${btn}
        </td></tr>
        <tr><td align="center" style="padding:20px 8px 0;${font};font-size:12px;line-height:1.6;color:#94a3b8">${footer}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

const P = 'margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155'

/** Caixa com o login e a senha provisória em destaque. */
export function credentialsBox(brand, email, { password, expiresAt }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">
    <tr><td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif">
      <p style="margin:0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#64748b">Seu e-mail</p>
      <p style="margin:2px 0 14px;font-size:15px;font-weight:bold;color:#0f172a">${escapeHtml(email)}</p>
      <p style="margin:0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#64748b">Senha provisória</p>
      <p style="margin:4px 0 0;font-family:'Courier New',monospace;font-size:28px;font-weight:bold;letter-spacing:6px;color:${brand.color}">${escapeHtml(password)}</p>
      <p style="margin:12px 0 0;font-size:13px;color:#64748b">Vale até <b>${shortDateBr(expiresAt)}</b>. No primeiro acesso você cria a sua senha.</p>
    </td></tr>
  </table>`
}

function footerText(brand, supportEmail) {
  return `${supportEmail ? `Dúvidas? Responda este e-mail ou escreva para ${escapeHtml(supportEmail)}.<br>` : ''}Você recebeu este e-mail porque tem acesso a ${escapeHtml(brand.name)}.`
}

/** E-mail de acesso da compra (link + senha provisória, quando houver). */
export async function sendAccessEmail({ to, name, productNames, accessUrl, supportEmail, tempPassword, productId = null }) {
  if (!emailConfigured()) return false
  const brand = await emailBrandFor({ productId })
  const first = String(name || '').split(' ')[0] || 'Olá'
  const items = productNames
    .map((n) => `<tr><td style="padding:6px 0;font-size:15px;color:#0f172a"><span style="color:${brand.color};font-weight:bold">&#10003;</span>&nbsp; ${escapeHtml(n)}</td></tr>`)
    .join('')
  const body = `<p style="${P}">Pagamento aprovado. Você já tem acesso a:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 4px">${items}</table>
    ${tempPassword ? credentialsBox(brand, to, tempPassword) : `<p style="${P};margin-top:12px">Guarde este e-mail: o botão abaixo é o seu acesso.</p>`}`
  const html = emailLayout(brand, {
    preheader: tempPassword ? `Sua senha provisória: ${tempPassword.password}` : 'Seu acesso está liberado.',
    title: `${first}, seu acesso chegou!`,
    body,
    button: { url: accessUrl, label: 'Acessar agora' },
    footer: footerText(brand, supportEmail),
  })
  return sendMail({ to, subject: `${first}, seu acesso chegou`, html })
}

/** E-mail com um link de acesso novo (aluno que perdeu o link ou a senha). */
export async function sendLoginLinkEmail({ to, name, accessUrl, areaId = null }) {
  if (!emailConfigured()) return false
  const brand = await emailBrandFor({ areaId })
  const first = String(name || '').split(' ')[0] || 'Olá'
  const html = emailLayout(brand, {
    preheader: 'Seu link para entrar na área de membros.',
    title: `${first}, aqui está seu novo acesso`,
    body: `<p style="${P}">Clique no botão para entrar. Lá dentro, em <b>Meu perfil</b>, crie uma senha para as próximas vezes.</p>`,
    button: { url: accessUrl, label: 'Entrar na área de membros' },
    footer: `Se não foi você que pediu, pode ignorar este e-mail.<br>${escapeHtml(brand.name)}`,
  })
  return sendMail({ to, subject: 'Seu link de acesso', html })
}

/** E-mail só com a senha provisória (mandado pela equipe na aba Alunos). */
export async function sendTempPasswordEmail({ to, name, loginUrl, tempPassword, productId = null }) {
  if (!emailConfigured()) return false
  const brand = await emailBrandFor({ productId })
  const first = String(name || '').split(' ')[0] || 'Olá'
  const html = emailLayout(brand, {
    preheader: `Sua senha provisória: ${tempPassword.password}`,
    title: `${first}, aqui está seu acesso`,
    body: `<p style="${P}">Entre com o seu e-mail e a senha abaixo.</p>${credentialsBox(brand, to, tempPassword)}`,
    button: { url: loginUrl, label: 'Entrar na área de membros' },
    footer: `Se não foi você que pediu, pode ignorar este e-mail.<br>${escapeHtml(brand.name)}`,
  })
  return sendMail({ to, subject: 'Sua senha de acesso', html })
}

export function escapeHtml(s) {
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

  // Trava: o webhook e a página de obrigado chegam juntos. Só um entrega
  // (senão saem dois links, dois e-mails, cupom contado duas vezes...).
  const lockPath = `storeLocks/fulfill_${orderId}`
  if (!(await createDocIfMissing(lockPath, { orderId, createdAt: nowIso() }))) {
    const lock = await getDoc(lockPath)
    const age = Date.now() - new Date(lock.data()?.createdAt || 0).getTime()
    // Trava velha = uma entrega anterior caiu no meio; pode tentar de novo.
    if (age < 120_000) return order
    await deleteDoc(lockPath)
    if (!(await createDocIfMissing(lockPath, { orderId, createdAt: nowIso() }))) return order
  }
  try {
    const fresh = await getDoc(`storeOrders/${orderId}`)
    if (fresh.data()?.fulfilledAt) return { id: orderId, ...fresh.data() }
    return await deliver(origin, order)
  } catch (err) {
    await deleteDoc(lockPath).catch(() => {})
    throw err
  }
}

async function deliver(origin, order) {
  const orderId = order.id
  const uid = await ensureMember({ email: order.buyer.email, name: order.buyer.name, phone: order.buyer.phone })
  for (const item of order.items || []) {
    await grantAccess({ uid, email: order.buyer.email, productId: item.productId, orderId })
  }
  const accessUrl = await createAccessLink(origin, uid, await membersPathFor(order.productId).catch(() => '/membros'))
  if (order.couponId) await incrementField(`storeCoupons/${order.couponId}`, 'uses', 1).catch((err) => console.warn('[loja] cupom:', err?.message))
  // Quem ainda não criou senha recebe uma provisória (1 dia) junto com o link, no e-mail.
  const emailOn = emailConfigured()
  const memberSnap = emailOn ? await getDoc(`storeMembers/${uid}`) : null
  const tempPassword = memberSnap && !memberSnap.data()?.hasPassword ? await createTempPassword(uid).catch(() => null) : null
  const emailSent = await sendAccessEmail({
    tempPassword,
    productId: order.productId,
    to: order.buyer.email,
    name: order.buyer.name,
    productNames: (order.items || []).map((i) => i.name),
    accessUrl,
    supportEmail: order.supportEmail,
  })
  const patch = { fulfilledAt: nowIso(), memberUid: uid, accessUrl, emailSent }
  await updateDoc(`storeOrders/${orderId}`, patch)
  await markRecovered(order)
  if (!order.test) {
    const total = (order.amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const product = await getProduct(order.productId).catch(() => null)
    // Título pelo jeito que pagou: "Pix pago" ou "Venda no cartão" (o resto continua "Venda aprovada").
    const title = order.method === 'pix' || order.method === 'pix_manual' ? 'Pix pago' : order.method === 'card' ? 'Venda no cartão' : 'Venda aprovada'
    await notifyStaff('store_sale', `${title}: ${order.buyer.name} comprou ${order.items.map((i) => i.name).join(' + ')} por ${total}.`, 'Loja', { privateTo: order.privateTo })
    const capi = await trackOrderEvent({ ...order, ...patch }, product, 'Purchase').catch((err) => ({ ok: false, error: err?.message }))
    if (capi && !capi.ok) await notifyCapiFailure(order, capi.error)
    // Nota fiscal automática (se ligada em Loja > Nota fiscal). Erro não trava a venda.
    // Produto privado não emite nota no CNPJ da empresa.
    if (!order.privateTo) await emitInvoice(orderId).catch((err) => console.warn('[loja] nota fiscal falhou:', err?.message))
  }
  return { ...order, ...patch }
}

/* ------------------------ Meta (API de Conversões) ------------------------ */

async function notifyCapiFailure(order, error) {
  await notifyStaff('store_capi_error', `Venda não marcada no Meta: a venda de ${order.buyer?.name || 'um cliente'} não foi enviada pela API de Conversões (${String(error || 'erro desconhecido').slice(0, 160)}). O sistema tenta de novo todo dia; confira o token do pixel na Loja.`, 'Loja', { privateTo: order.privateTo })
}

/** Reenvia ao Meta as vendas dos últimos 7 dias que ele recusou (rodado pelo cron). */
export async function retryFailedCapi(limit = 40) {
  const rows = await queryDocs('storeOrders', [['capi.purchase.ok', false]])
  const weekAgo = Date.now() - 7 * 86400_000
  const due = rows
    .filter((o) => o.status === 'approved' && !o.test && Number(o.capi?.purchase?.attempts || 0) < 6 && new Date(o.createdAt).getTime() > weekAgo)
    .slice(0, limit)
  let fixed = 0
  const stillFailing = []
  for (const o of due) {
    const product = await getProduct(o.productId).catch(() => null)
    const r = await trackOrderEvent(o, product, 'Purchase').catch((err) => ({ ok: false, error: err?.message }))
    if (r?.ok) fixed++
    else if (r) stillFailing.push(r.error)
  }
  if (stillFailing.length) {
    await notifyStaff('store_capi_error', `Vendas não marcadas no Meta: ${stillFailing.length} venda(s) continuam sendo recusadas pela API de Conversões (${String(stillFailing[0] || '').slice(0, 160)}). Confira o token do pixel na Loja.`)
  }
  return { pending: due.length, fixed, failing: stillFailing.length }
}

/* ------------------------------ reembolso ------------------------------ */

/** Devolve o dinheiro (Mercado Pago) e tira o acesso. Pix direto: o dinheiro volta
 *  pelo app do banco (aqui só registra). Usado pela equipe e pelo reembolso automático. */
export async function refundOrder(orderId, by, extra = {}) {
  const snap = await getDoc(`storeOrders/${orderId}`)
  if (!snap.exists) throw new Error('Pedido não encontrado')
  const order = { id: orderId, ...snap.data() }
  if (order.status !== 'approved') throw new Error('Só dá pra reembolsar pedido aprovado')
  if (order.mpPaymentId) {
    const acc = await mpAccountForOrder(order)
    if (mpConfigured(acc)) await refundPayment(acc, order.mpPaymentId)
  }
  await updateDoc(`storeOrders/${orderId}`, { status: 'refunded', refundedAt: nowIso(), refundedBy: by, updatedAt: nowIso(), ...extra })
  await cancelInvoice(orderId).catch((err) => console.warn('[loja] cancelar nota falhou:', err?.message))
  for (const pid of order.productIds || [order.productId]) {
    if (order.memberUid) await revokeAccess(order.memberUid, pid).catch(() => {})
  }
  return order
}

/* ------------------------- Mercado Pago (status) ------------------------- */

/** Confere o pagamento no MP e atualiza o pedido. force = consulta mesmo com o
 *  pedido já aprovado e entregue (webhook: pode ser reembolso ou chargeback). */
export async function syncOrderWithMp(origin, orderId, order, { force = false } = {}) {
  if (!order.mpPaymentId) return order
  if (order.status === 'refunded') return order
  if (!force && order.status === 'approved' && order.fulfilledAt) return order
  const acc = await mpAccountForOrder(order)
  if (!mpConfigured(acc)) return order
  const p = await getPayment(acc, order.mpPaymentId)
  let status = orderStatusFromMp(p.status)
  // Aprovado só deixa de ser aprovado se o dinheiro voltou. Disputa aberta
  // (in_mediation) não tira o acesso: espera o resultado.
  if (order.status === 'approved' && status !== 'refunded') status = 'approved'
  if (status !== order.status || p.status !== order.mpStatus) {
    const wasApproved = order.status === 'approved'
    const patch = { status, mpStatus: p.status, mpStatusDetail: p.status_detail || null, updatedAt: nowIso() }
    if (status === 'approved' && !order.approvedAt) patch.approvedAt = nowIso()
    if (status === 'refunded') Object.assign(patch, { refundedAt: nowIso(), refundedBy: p.status === 'charged_back' ? 'Chargeback (Mercado Pago)' : 'Mercado Pago' })
    await updateDoc(`storeOrders/${orderId}`, patch)
    order = { ...order, ...patch }
    if (status === 'refunded') {
      for (const pid of order.productIds || [order.productId]) {
        if (order.memberUid) await revokeAccess(order.memberUid, pid).catch(() => {})
      }
      if (wasApproved) {
        await cancelInvoice(orderId).catch((err) => console.warn('[loja] cancelar nota falhou:', err?.message))
        const total = (order.amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        const why = p.status === 'charged_back' ? 'chargeback (contestação no cartão)' : 'reembolso feito no Mercado Pago'
        await notifyStaff('store_refund', `Estorno: ${order.buyer?.name} teve ${total} devolvido por ${why}. O acesso foi removido.`, 'Loja', { privateTo: order.privateTo })
      }
    }
  }
  if (order.status === 'approved') order = (await fulfillOrder(origin, orderId)) || order
  return order
}

/** Rede de segurança do webhook: confere no MP os pedidos pendentes dos últimos
 *  3 dias e expira Pix direto que ninguém confirmou em 7 dias. */
export async function reconcilePendingOrders(origin, limit = 40) {
  const rows = await queryDocs('storeOrders', [['status', 'pending']])
  const now = Date.now()
  let checked = 0
  let approved = 0
  let expired = 0
  for (const o of rows) {
    const age = now - new Date(o.createdAt).getTime()
    if (o.method === 'pix_manual') {
      if (age > 7 * 86400_000) {
        await updateDoc(`storeOrders/${o.id}`, { status: 'refused', expiredAt: nowIso(), updatedAt: nowIso() })
        expired++
      }
      continue
    }
    if (!o.mpPaymentId || age > 3 * 86400_000 || checked >= limit) continue
    checked++
    const out = await syncOrderWithMp(origin, o.id, o).catch((err) => {
      console.warn('[loja] reconciliar', o.id, err?.message)
      return o
    })
    if (out.status === 'approved') approved++
  }
  return { pending: rows.length, checked, approved, expired }
}

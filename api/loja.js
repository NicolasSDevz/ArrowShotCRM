// Vercel Function — /api/loja?action=...
//
// Uma função só para toda a Loja (checkout + área de membros), porque o plano
// Hobby da Vercel limita o projeto a 12 funções.
//
// Públicas (checkout):
//   GET  checkout&slug=           dados da página de pagamento
//   POST coupon     { slug, code }
//   POST order      { slug, bumpIds, coupon, buyer, method: pix|card|test, card, utm }
//   GET  order&id=&key=           status do pedido (consulta o MP e libera o acesso)
//   POST webhook                  notificação do Mercado Pago
// Alunos:
//   POST member-enter    { code }              → { token } (link de acesso)
//   POST member-login    { email, password }   → { token }
//   POST member-password { password }          (Bearer do aluno)
// Equipe (Bearer de usuário interno):
//   GET  admin-status                          → gateway e e-mail configurados?
//   POST admin-grant   { email, name, productId } → { accessUrl }
//   POST admin-link    { uid }                 → { accessUrl }
//   POST admin-revoke  { uid, productId }
//   POST admin-refund  { orderId }

import { requireInternalUser, AuthError } from './_lib/auth.js'
import { getDoc, setDoc, updateDoc, createCustomToken, verifyIdTokenWithClaims } from './_lib/firebaseAdmin.js'
import {
  mpConfigured,
  mpPublicKey,
  createPixPayment,
  createCardPayment,
  getPayment,
  refundPayment,
  orderStatusFromMp,
} from './_lib/store/mercadoPago.js'
import {
  nowIso,
  randomToken,
  normalizeEmail,
  isValidEmail,
  memberUidFor,
  publicOrigin,
  getProduct,
  getProductBySlug,
  resolveBumps,
  publicCheckout,
  findCoupon,
  ensureMember,
  grantAccess,
  revokeAccess,
  createAccessLink,
  uidFromAccessCode,
  hashPassword,
  checkPassword,
  fulfillOrder,
} from './_lib/store/core.js'

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const gateway = () => ({ mercadoPago: mpConfigured(), publicKey: mpPublicKey() })

/* ------------------------------ checkout ------------------------------ */

async function loadActiveProduct(slug) {
  const product = await getProductBySlug(slug)
  if (!product || product.status !== 'active') throw new HttpError(404, 'Produto não encontrado ou fora do ar')
  return product
}

async function actionCheckout(req) {
  const product = await loadActiveProduct(String(req.query.slug || ''))
  const bumps = await resolveBumps(product)
  return publicCheckout(product, bumps, gateway())
}

async function actionCoupon(req) {
  const { slug, code } = req.body || {}
  const product = await loadActiveProduct(String(slug || ''))
  const coupon = await findCoupon(code, product.id)
  if (!coupon) throw new HttpError(404, 'Cupom inválido ou expirado')
  return { code: coupon.code, percent: coupon.percent }
}

function cleanBuyer(raw = {}) {
  const buyer = {
    name: String(raw.name || '').trim().slice(0, 120),
    email: normalizeEmail(raw.email),
    phone: String(raw.phone || '').replace(/[^\d+]/g, '').slice(0, 20) || null,
    cpf: String(raw.cpf || '').replace(/\D/g, '').slice(0, 14) || null,
  }
  if (buyer.name.length < 3) throw new HttpError(400, 'Informe seu nome completo')
  if (!isValidEmail(buyer.email)) throw new HttpError(400, 'Informe um e-mail válido')
  return buyer
}

function cleanUtm(raw = {}) {
  const out = {}
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'fbclid']) {
    if (raw[k]) out[k] = String(raw[k]).slice(0, 200)
  }
  return out
}

async function actionOrder(req) {
  const body = req.body || {}
  const product = await loadActiveProduct(String(body.slug || ''))
  const buyer = cleanBuyer(body.buyer)
  if (product.checkout?.askCpf === true && !buyer.cpf) throw new HttpError(400, 'Informe seu CPF')
  const method = body.method
  const gw = gateway()

  // Itens: produto principal (com cupom) + order bumps escolhidos.
  const coupon = body.coupon ? await findCoupon(body.coupon, product.id) : null
  const mainPrice = coupon ? Math.round(product.price * (1 - coupon.percent / 100)) : product.price
  const items = [{ productId: product.id, name: product.name, price: mainPrice, fullPrice: product.price, bump: false }]
  const wantedBumps = new Set(Array.isArray(body.bumpIds) ? body.bumpIds.map(String) : [])
  if (wantedBumps.size) {
    for (const b of await resolveBumps(product)) {
      if (wantedBumps.has(b.productId)) items.push({ productId: b.productId, name: b.name, price: b.price, fullPrice: b.fullPrice, bump: true })
    }
  }
  const amount = items.reduce((s, i) => s + i.price, 0)

  const orderId = `ord_${Date.now().toString(36)}${randomToken(6).replace(/[-_]/g, '')}`
  const key = randomToken(18)
  const order = {
    productId: product.id,
    productName: product.name,
    items,
    productIds: items.map((i) => i.productId),
    amount,
    couponCode: coupon?.code || null,
    couponId: coupon?.id || null,
    couponPercent: coupon?.percent || 0,
    buyer,
    method,
    status: 'pending',
    key,
    supportEmail: product.supportEmail || null,
    utm: cleanUtm(body.utm),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  const origin = publicOrigin(req)
  const notificationUrl = `${origin}/api/loja?action=webhook`
  const description = items.map((i) => i.name).join(' + ').slice(0, 250)
  let pix = null

  if (amount <= 0) {
    // Cupom de 100%: aprovado na hora, sem passar pelo gateway.
    order.method = 'free'
    order.status = 'approved'
    order.approvedAt = nowIso()
  } else if (method === 'test') {
    if (gw.mercadoPago || product.testMode !== true) throw new HttpError(400, 'Modo teste desligado para este produto')
    order.status = 'approved'
    order.approvedAt = nowIso()
    order.test = true
  } else if (method === 'pix') {
    if (!gw.mercadoPago) throw new HttpError(400, 'Pagamento ainda não configurado. Fale com o vendedor.')
    if (product.paymentMethods?.pix === false) throw new HttpError(400, 'Pix indisponível para este produto')
    const p = await createPixPayment({ orderId, amountCents: amount, description, buyer, notificationUrl })
    const td = p.point_of_interaction?.transaction_data || {}
    pix = { qrCode: td.qr_code || null, qrBase64: td.qr_code_base64 || null, ticketUrl: td.ticket_url || null, expiresAt: p.date_of_expiration || null }
    order.mpPaymentId = String(p.id)
    order.mpStatus = p.status
    order.status = orderStatusFromMp(p.status)
    order.pix = pix
  } else if (method === 'card') {
    if (!gw.mercadoPago) throw new HttpError(400, 'Pagamento ainda não configurado. Fale com o vendedor.')
    if (product.paymentMethods?.card === false) throw new HttpError(400, 'Cartão indisponível para este produto')
    const card = body.card || {}
    if (!card.token || !card.paymentMethodId) throw new HttpError(400, 'Dados do cartão incompletos')
    const installments = Math.min(Number(card.installments) || 1, Number(product.maxInstallments) || 12)
    const p = await createCardPayment({
      orderId,
      amountCents: amount,
      description,
      buyer,
      card: { ...card, installments },
      notificationUrl,
      statementDescriptor: product.statementDescriptor,
    })
    order.mpPaymentId = String(p.id)
    order.mpStatus = p.status
    order.mpStatusDetail = p.status_detail || null
    order.installments = installments
    order.status = orderStatusFromMp(p.status)
  } else {
    throw new HttpError(400, 'Forma de pagamento inválida')
  }

  if (order.status === 'approved' && !order.approvedAt) order.approvedAt = nowIso()
  await setDoc(`storeOrders/${orderId}`, order)
  let accessUrl = null
  if (order.status === 'approved') accessUrl = (await fulfillOrder(origin, orderId))?.accessUrl || null

  return {
    orderId,
    key,
    status: order.status,
    statusDetail: order.mpStatusDetail || null,
    amount,
    pix,
    accessUrl,
  }
}

/** Confere o pagamento no MP e atualiza o pedido (usado pelo webhook e pela
 *  página de obrigado — assim funciona mesmo sem o webhook configurado). */
async function syncOrderWithMp(origin, orderId, order) {
  if (!order.mpPaymentId || !mpConfigured()) return order
  if (order.status === 'approved' && order.fulfilledAt) return order
  const p = await getPayment(order.mpPaymentId)
  const status = orderStatusFromMp(p.status)
  if (status !== order.status || p.status !== order.mpStatus) {
    const patch = { status, mpStatus: p.status, mpStatusDetail: p.status_detail || null, updatedAt: nowIso() }
    if (status === 'approved' && !order.approvedAt) patch.approvedAt = nowIso()
    await updateDoc(`storeOrders/${orderId}`, patch)
    order = { ...order, ...patch }
  }
  if (order.status === 'approved') order = (await fulfillOrder(origin, orderId)) || order
  if (order.status === 'refunded') {
    for (const pid of order.productIds || []) {
      if (order.memberUid) await revokeAccess(order.memberUid, pid).catch(() => {})
    }
  }
  return order
}

async function actionOrderStatus(req) {
  const id = String(req.query.id || '')
  const key = String(req.query.key || '')
  if (!/^ord_[A-Za-z0-9]{6,40}$/.test(id)) throw new HttpError(404, 'Pedido não encontrado')
  const snap = await getDoc(`storeOrders/${id}`)
  if (!snap.exists || snap.data().key !== key) throw new HttpError(404, 'Pedido não encontrado')
  const order = await syncOrderWithMp(publicOrigin(req), id, { id, ...snap.data() })
  return {
    orderId: id,
    status: order.status,
    statusDetail: order.mpStatusDetail || null,
    amount: order.amount,
    method: order.method,
    items: (order.items || []).map((i) => ({ name: i.name, price: i.price })),
    buyerName: order.buyer?.name || '',
    buyerEmail: order.buyer?.email || '',
    pix: order.status === 'pending' ? order.pix || null : null,
    accessUrl: order.status === 'approved' ? order.accessUrl || null : null,
    emailSent: order.emailSent === true,
    productId: order.productId,
  }
}

async function actionWebhook(req) {
  // MP manda { type: 'payment', data: { id } } (webhooks) ou ?topic=payment&id= (IPN).
  const body = req.body || {}
  const type = body.type || body.topic || req.query.type || req.query.topic
  const paymentId = body.data?.id || req.query['data.id'] || req.query.id
  if (type !== 'payment' || !paymentId || !mpConfigured()) return { ok: true }
  // Nunca confia no corpo: busca o pagamento direto no MP.
  const p = await getPayment(paymentId)
  const orderId = p.external_reference
  if (!orderId || !/^ord_/.test(orderId)) return { ok: true }
  const snap = await getDoc(`storeOrders/${orderId}`)
  if (!snap.exists) return { ok: true }
  await syncOrderWithMp(publicOrigin(req), orderId, { id: orderId, ...snap.data(), mpPaymentId: String(p.id) })
  return { ok: true }
}

/* ------------------------------- alunos ------------------------------- */

async function memberToken(uid) {
  const snap = await getDoc(`storeMembers/${uid}`)
  if (!snap.exists) throw new HttpError(404, 'Aluno não encontrado')
  await updateDoc(`storeMembers/${uid}`, { lastAccessAt: nowIso() })
  const m = snap.data()
  return { token: createCustomToken(uid, { member: true, email: m.email }), hasPassword: m.hasPassword === true }
}

async function actionMemberEnter(req) {
  const uid = await uidFromAccessCode(String(req.body?.code || ''))
  if (!uid) throw new HttpError(401, 'Link de acesso inválido. Peça um novo ao suporte.')
  return memberToken(uid)
}

async function actionMemberLogin(req) {
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password || '')
  const uid = memberUidFor(email)
  const secret = await getDoc(`storeMemberSecrets/${uid}`)
  const s = secret.exists ? secret.data() : null
  // Atraso fixo: não deixa adivinhar senha no ritmo da rede.
  await new Promise((r) => setTimeout(r, 400))
  if (!s || !checkPassword(password, s.salt, s.hash)) {
    throw new HttpError(401, 'E-mail ou senha incorretos. Se ainda não criou senha, entre pelo link de acesso que chegou na compra.')
  }
  return memberToken(uid)
}

async function requireMember(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) throw new HttpError(401, 'Não autenticado')
  let decoded
  try {
    decoded = await verifyIdTokenWithClaims(header.slice(7).trim())
  } catch {
    throw new HttpError(401, 'Sessão expirada')
  }
  if (decoded.claims.member !== true) throw new HttpError(403, 'Sem permissão')
  return decoded.uid
}

async function actionMemberPassword(req) {
  const uid = await requireMember(req)
  const password = String(req.body?.password || '')
  if (password.length < 6) throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres')
  await setDoc(`storeMemberSecrets/${uid}`, { ...hashPassword(password), updatedAt: nowIso() })
  await updateDoc(`storeMembers/${uid}`, { hasPassword: true })
  return { ok: true }
}

/* ------------------------------- equipe ------------------------------- */

async function actionAdminStatus() {
  return {
    mercadoPago: mpConfigured(),
    email: Boolean(process.env.RESEND_API_KEY && process.env.STORE_EMAIL_FROM),
  }
}

async function actionAdminGrant(req, user) {
  const email = normalizeEmail(req.body?.email)
  const name = String(req.body?.name || '').trim()
  const productId = String(req.body?.productId || '')
  if (!isValidEmail(email)) throw new HttpError(400, 'E-mail inválido')
  const product = await getProduct(productId)
  if (!product) throw new HttpError(404, 'Produto não encontrado')
  const uid = await ensureMember({ email, name })
  await grantAccess({ uid, email, productId, source: 'manual', grantedBy: user.name })
  return { uid, accessUrl: await createAccessLink(publicOrigin(req), uid) }
}

async function actionAdminLink(req) {
  const uid = String(req.body?.uid || '')
  if (!/^m_[a-f0-9]{26}$/.test(uid)) throw new HttpError(400, 'Aluno inválido')
  const snap = await getDoc(`storeMembers/${uid}`)
  if (!snap.exists) throw new HttpError(404, 'Aluno não encontrado')
  return { accessUrl: await createAccessLink(publicOrigin(req), uid) }
}

async function actionAdminRevoke(req) {
  const uid = String(req.body?.uid || '')
  const productId = String(req.body?.productId || '')
  if (!/^m_[a-f0-9]{26}$/.test(uid) || !productId) throw new HttpError(400, 'Dados inválidos')
  await revokeAccess(uid, productId)
  return { ok: true }
}

async function actionAdminRefund(req, user) {
  const orderId = String(req.body?.orderId || '')
  const snap = await getDoc(`storeOrders/${orderId}`)
  if (!snap.exists) throw new HttpError(404, 'Pedido não encontrado')
  const order = snap.data()
  if (order.status !== 'approved') throw new HttpError(400, 'Só dá pra reembolsar pedido aprovado')
  if (order.mpPaymentId && mpConfigured()) await refundPayment(order.mpPaymentId)
  await updateDoc(`storeOrders/${orderId}`, { status: 'refunded', refundedAt: nowIso(), refundedBy: user.name, updatedAt: nowIso() })
  for (const pid of order.productIds || []) {
    if (order.memberUid) await revokeAccess(order.memberUid, pid).catch(() => {})
  }
  return { ok: true }
}

/* ------------------------------- roteador ------------------------------ */

const PUBLIC = {
  'GET checkout': actionCheckout,
  'POST coupon': actionCoupon,
  'POST order': actionOrder,
  'GET order': actionOrderStatus,
  'POST webhook': actionWebhook,
  'GET webhook': actionWebhook,
  'POST member-enter': actionMemberEnter,
  'POST member-login': actionMemberLogin,
  'POST member-password': actionMemberPassword,
}

const ADMIN = {
  'GET admin-status': actionAdminStatus,
  'POST admin-grant': actionAdminGrant,
  'POST admin-link': actionAdminLink,
  'POST admin-revoke': actionAdminRevoke,
  'POST admin-refund': actionAdminRefund,
}

export default async function handler(req, res) {
  const route = `${req.method} ${req.query.action || ''}`
  try {
    if (PUBLIC[route]) return res.status(200).json(await PUBLIC[route](req))
    if (ADMIN[route]) {
      const user = await requireInternalUser(req)
      return res.status(200).json(await ADMIN[route](req, user))
    }
    return res.status(404).json({ error: 'Ação desconhecida' })
  } catch (err) {
    const status = err instanceof HttpError || err instanceof AuthError ? err.status : 500
    if (status === 500) console.error(`[loja] ${route} falhou:`, err)
    const message = status === 500 && !String(err?.message || '').startsWith('Mercado Pago') ? 'Erro interno. Tente de novo em instantes.' : err.message
    return res.status(status).json({ error: message })
  }
}

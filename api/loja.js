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
//   POST member-send-link { email }             manda um link de acesso novo por e-mail
//   POST member-password { password }          (Bearer do aluno)
//   GET  member-orders                          compras do aluno e prazo de garantia
//   GET  members-catalog                        produtos no ar para mostrar bloqueados na área (cache de 5 min)
//   POST member-refund-request { orderId, reason }  pede reembolso (avisa a equipe)
// Equipe (Bearer de usuário interno):
//   GET  admin-status                          → gateway e e-mail configurados?
//   POST admin-grant   { email, name, productId } → { accessUrl }
//   POST admin-link    { uid }                 → { accessUrl }
//   POST admin-revoke  { uid, productId }
//   POST admin-delete-member { uid }     apaga o aluno (pedidos ficam)
//   POST admin-refund  { orderId }
//   POST admin-confirm { orderId }   confirma Pix direto (Nubank) e libera o acesso
//   POST admin-cancel  { orderId }   cancela pedido que não foi pago
//   POST admin-reconcile             confere no MP os pedidos pendentes (webhook perdido)
//   POST admin-invoice-token { token }     token da Focus NFe (gravado cifrado)
//   GET  admin-capi-status                  pixels com token da API de Conversões
//   POST admin-capi-token { pixelId, token } token da API de Conversões (cifrado; vazio = remove)
//   POST admin-capi-test  { pixelId, testCode } manda um Purchase de teste
//   POST admin-invoice-emit  { orderId }   emite/reemite a nota do pedido
//   POST admin-invoice-sync  { orderIds }  atualiza notas em processamento
//   GET  admin-push-key                      chave pública das notificações push (null = não configurado)
//   POST admin-push-subscribe { subscription }  liga as notificações neste aparelho
//   POST admin-push-unsubscribe { endpoint }    desliga neste aparelho
//   POST admin-push-test                       manda uma notificação de teste pros aparelhos de quem pediu
// Focus NFe (gatilho configurado no painel deles):
//   POST invoice-webhook { ref }

import { requireInternalUser, AuthError } from './_lib/auth.js'
import { getDoc, setDoc, updateDoc, deleteDoc, queryDocs, incrementField, createCustomToken, verifyIdTokenWithClaims } from './_lib/firebaseAdmin.js'
import {
  mpConfigured,
  mpPublicKey,
  createPixPayment,
  createCardPayment,
  getPayment,
  refundPayment,
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
  getPaymentSettings,
  notifyStaff,
  pixDiscount,
  pixAccountFor,
  rateLimit,
  syncOrderWithMp,
  reconcilePendingOrders,
  sendLoginLinkEmail,
} from './_lib/store/core.js'
import { buildPixCode } from './_lib/store/pixCode.js'
import { fetchPdf, stampPdf } from './_lib/store/protectedPdf.js'
import { encryptToken, decryptToken } from './_lib/tokenCrypto.js'
import { capiStatus, cleanPixelId, removeCapiToken, saveCapiToken, sendCapiTest, trackingFromRequest } from './_lib/store/metaCapi.js'
import { pushConfigured, pushPublicKey, cleanSubscription, savePushSubscription, removePushSubscription, sendPushToUsers } from './_lib/webPush.js'
import { invoiceStatus, saveInvoiceToken, emitInvoice, syncInvoice, cancelInvoice, getInvoiceSettings } from './_lib/store/invoice.js'

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
  const [bumps, settings, invoice] = await Promise.all([resolveBumps(product), getPaymentSettings(), getInvoiceSettings()])
  const data = publicCheckout(product, bumps, gateway(), settings)
  // Com nota fiscal ligada, o CPF/CNPJ do comprador vira obrigatório.
  if (invoice.enabled === true) data.checkout.askCpf = true
  return data
}

/** Visual da área de membros (a tela de login é pública, por isso vem pela API). */
async function actionMembersTheme() {
  const snap = await getDoc('storeSettings/membersTheme')
  const t = snap.exists ? snap.data() : {}
  const pick = ['brandName', 'logoUrl', 'mode', 'primaryColor', 'backgroundColor', 'cardColor', 'font', 'loginLayout', 'loginBgUrl', 'loginTitle', 'loginText', 'loginButtonText', 'loginHelpText', 'supportWhatsapp', 'loginMode', 'loginPrimaryColor', 'loginBackgroundColor', 'loginCardColor', 'loginLogoUrl', 'loginOverlay']
  return Object.fromEntries(pick.filter((k) => t[k] !== undefined).map((k) => [k, t[k]]))
}

/** Produtos no ar para a vitrine da área de membros: quem não comprou vê bloqueado,
 *  com botão de comprar. Público (só o que o checkout já mostra) e com cache na
 *  Vercel, para não virar uma leitura no Firestore a cada aluno que abre a área. */
async function actionMembersCatalog(req) {
  const [rows, links] = await Promise.all([queryDocs('storeProducts', [['status', 'active']]), getDoc('storeSettings/links')])
  const domain = links.exists ? links.data().checkoutDomain : null
  const origin = publicOrigin(req)
  const products = rows
    .filter((p) => p.members?.showInCatalog !== false)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
    .map((p) => ({
      id: p.id,
      name: p.name || '',
      description: String(p.description || '').slice(0, 280),
      coverUrl: p.members?.coverUrl || p.imageUrl || null,
      price: Number(p.price) || 0,
      comparePrice: p.comparePrice || null,
      buyUrl: /^https:\/\//.test(p.members?.salesUrl || '') ? p.members.salesUrl : domain ? `https://${domain}/${p.slug}` : `${origin}/pay/${p.slug}`,
    }))
  return { products }
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
  // Sem limite, um script cria pedidos sem parar (e cada Pix direto avisa a equipe no celular).
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'sem-ip'
  if (!(await rateLimit(`order:${ip}`, 8, 15 * 60_000))) throw new HttpError(429, 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.')
  const invoiceOn = (await getInvoiceSettings()).enabled === true
  if ((product.checkout?.askCpf === true || invoiceOn) && ![11, 14].includes(String(buyer.cpf || '').length)) {
    throw new HttpError(400, 'Informe seu CPF ou CNPJ')
  }
  const method = body.method
  const gw = gateway()
  const settings = await getPaymentSettings()

  // Itens: produto principal (com cupom) + order bumps escolhidos.
  const coupon = body.coupon ? await findCoupon(body.coupon, product.id) : null
  if (body.coupon && !coupon) throw new HttpError(400, 'Cupom inválido ou expirado. Remova o cupom e tente de novo.')
  if (coupon?.maxUses > 0) {
    // O uso só é contado quando o pagamento cai: pedidos em aberto dos últimos 30 min "seguram" uma vaga.
    const holding = (await queryDocs('storeOrders', [['couponId', coupon.id], ['status', 'pending']])).filter(
      (o) => Date.now() - new Date(o.createdAt).getTime() < 30 * 60_000
    ).length
    if (coupon.uses + holding >= coupon.maxUses) throw new HttpError(400, 'Esse cupom atingiu o limite de usos.')
  }
  const mainPrice = coupon ? Math.round(product.price * (1 - coupon.percent / 100)) : product.price
  const items = [{ productId: product.id, name: product.name, price: mainPrice, fullPrice: product.price, bump: false }]
  const wantedBumps = new Set(Array.isArray(body.bumpIds) ? body.bumpIds.map(String) : [])
  if (wantedBumps.size) {
    for (const b of await resolveBumps(product)) {
      if (wantedBumps.has(b.productId)) items.push({ productId: b.productId, name: b.name, price: b.price, fullPrice: b.fullPrice, bump: true })
    }
  }
  const subtotal = items.reduce((s, i) => s + i.price, 0)
  // Desconto no Pix (vale para o Pix direto e o do Mercado Pago), sobre o total.
  const pixPct = method === 'pix' ? pixDiscount(product) : 0
  const pixDiscountAmount = pixPct ? Math.round(subtotal * (pixPct / 100)) : 0
  const amount = subtotal - pixDiscountAmount

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
    pixDiscountPercent: pixPct,
    pixDiscountAmount,
    buyer,
    method,
    status: 'pending',
    key,
    supportEmail: product.supportEmail || null,
    utm: cleanUtm(body.utm),
    tracking: trackingFromRequest(req, body.tracking),
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
  } else if (method === 'pix' && settings.manualReady) {
    if (product.paymentMethods?.pix === false) throw new HttpError(400, 'Pix indisponível para este produto')
    // Pix direto na conta: sem gateway; a equipe confirma no CRM.
    const account = pixAccountFor(settings, product)
    const qrCode = buildPixCode({
      key: account.pixKey,
      keyType: account.pixKeyType,
      name: account.pixName,
      city: account.pixCity,
      amountCents: amount,
      txid: orderId.replace('ord_', ''),
    })
    const whatsapp = String(settings.whatsapp || '').replace(/\D/g, '') || null
    pix = { qrCode, qrBase64: null, ticketUrl: null, expiresAt: null, manual: true, whatsapp }
    order.method = 'pix_manual'
    order.pix = pix
    order.pixAccountLabel = account.label
  } else if (method === 'test') {
    if (gw.mercadoPago || settings.manualReady || product.testMode !== true) throw new HttpError(400, 'Modo teste desligado para este produto')
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
  if (order.method === 'pix_manual') {
    const total = (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    await notifyStaff('store_pix_pending', `Pix para conferir: ${buyer.name} gerou um Pix de ${total} (${description}) na ${order.pixAccountLabel || 'conta principal'}. Confira no banco e confirme na Loja, aba Vendas.`)
  }

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
    manualPix: order.method === 'pix_manual',
    accessUrl: order.status === 'approved' ? order.accessUrl || null : null,
    emailSent: order.emailSent === true,
    productId: order.productId,
    approvedAt: order.approvedAt || null,
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
  // force: pedido já entregue também é conferido (o aviso pode ser de reembolso ou chargeback).
  await syncOrderWithMp(publicOrigin(req), orderId, { id: orderId, ...snap.data(), mpPaymentId: String(p.id) }, { force: true })
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
  const found = await uidFromAccessCode(String(req.body?.code || ''))
  if (found?.expired) throw new HttpError(401, 'Este link de acesso venceu. Entre com e-mail e senha ou peça um link novo na tela de login.')
  if (!found?.uid) throw new HttpError(401, 'Link de acesso inválido. Peça um novo na tela de login ou ao suporte.')
  return memberToken(found.uid)
}

/** Manda um link de acesso novo pro e-mail do aluno (perdeu o link ou a senha).
 *  Responde igual exista ou não o aluno, pra não revelar quem comprou. */
async function actionMemberSendLink(req) {
  const email = normalizeEmail(req.body?.email)
  if (!isValidEmail(email)) throw new HttpError(400, 'Informe um e-mail válido')
  const emailOn = Boolean(process.env.RESEND_API_KEY && process.env.STORE_EMAIL_FROM)
  if (!emailOn) return { ok: true, email: false }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'sem-ip'
  if (!(await rateLimit(`link:${email}`, 3, 3600_000)) || !(await rateLimit(`link-ip:${ip}`, 10, 3600_000))) {
    throw new HttpError(429, 'Muitos pedidos seguidos. Espere um pouco e confira sua caixa de entrada e o spam.')
  }
  const uid = memberUidFor(email)
  const snap = await getDoc(`storeMembers/${uid}`)
  if (snap.exists) {
    await sendLoginLinkEmail({ to: email, name: snap.data().name, accessUrl: await createAccessLink(publicOrigin(req), uid) })
  }
  return { ok: true, email: true }
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

/** Compras do aluno logado (para a tela Meu perfil e o pedido de reembolso). */
async function memberOrders(uid) {
  const rows = await queryDocs('storeOrders', [['memberUid', uid]])
  const out = []
  for (const o of rows) {
    if (o.test) continue
    const product = await getProduct(o.productId)
    const days = Number(product?.checkout?.guaranteeDays) || 0
    const base = o.approvedAt ? new Date(o.approvedAt) : null
    const deadline = base && days ? new Date(base.getTime() + days * 86400_000) : null
    out.push({
      orderId: o.id,
      items: (o.items || []).map((i) => i.name),
      amount: o.amount,
      status: o.status,
      approvedAt: o.approvedAt || null,
      guaranteeUntil: deadline ? deadline.toISOString() : null,
      canRequestRefund: o.status === 'approved' && !o.refundRequest && !!deadline && deadline.getTime() > Date.now(),
      refundRequestedAt: o.refundRequest?.requestedAt || null,
      supportEmail: product?.supportEmail || o.supportEmail || null,
    })
  }
  return out.sort((a, b) => String(b.approvedAt).localeCompare(String(a.approvedAt)))
}

/** PDF protegido: confere a matrícula, baixa o original e carimba nome/CPF/e-mail do aluno. */
async function actionMemberFile(req) {
  const uid = await requireMember(req)
  const productId = String(req.query.productId || '')
  const lessonId = String(req.query.lessonId || '')
  const index = Number(req.query.i)
  if (!/^[\w-]{5,40}$/.test(productId) || !/^[\w-]{5,40}$/.test(lessonId) || !Number.isInteger(index) || index < 0) throw new HttpError(400, 'Arquivo inválido')
  const enr = await getDoc(`storeEnrollments/${uid}_${productId}`)
  if (!enr.exists || enr.data().active === false) throw new HttpError(403, 'Você não tem acesso a este curso')
  const lessonSnap = await getDoc(`storeProducts/${productId}/lessons/${lessonId}`)
  if (!lessonSnap.exists) throw new HttpError(404, 'Aula não encontrada')
  const lesson = lessonSnap.data()
  const releaseDays = Number(lesson.releaseDays) || 0
  if (releaseDays && Date.now() < new Date(enr.data().createdAt).getTime() + releaseDays * 86400_000) throw new HttpError(403, 'Essa aula ainda não foi liberada')
  const att = (lesson.attachments || [])[index]
  if (!att?.protected || !att.sealed) throw new HttpError(404, 'Arquivo não encontrado')

  const member = (await getDoc(`storeMembers/${uid}`)).data() || {}
  // CPF: da compra mais recente aprovada deste produto.
  const orders = (await queryDocs('storeOrders', [['memberUid', uid]]))
    .filter((o) => o.status === 'approved' && (o.productIds || [o.productId]).includes(productId))
    .sort((a, b) => String(b.approvedAt || '').localeCompare(String(a.approvedAt || '')))
  const order = orders[0]
  const original = await fetchPdf(decryptToken(att.sealed)).catch((err) => {
    throw new HttpError(502, err.message)
  })
  const stamped = await stampPdf(original, {
    name: order?.buyer?.name || member.name || '',
    cpf: order?.buyer?.cpf || member.cpf || '',
    email: member.email || order?.buyer?.email || '',
    orderId: order?.id || null,
  })
  const safeName = String(att.name || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').slice(0, 60) || 'arquivo'
  return { __file: stamped, filename: safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf` }
}

async function actionMemberOrders(req) {
  const uid = await requireMember(req)
  return { orders: await memberOrders(uid) }
}

async function actionMemberRefundRequest(req) {
  const uid = await requireMember(req)
  const orderId = String(req.body?.orderId || '')
  const reason = String(req.body?.reason || '').trim().slice(0, 1000)
  const mine = (await memberOrders(uid)).find((o) => o.orderId === orderId)
  if (!mine) throw new HttpError(404, 'Compra não encontrada')
  if (!mine.canRequestRefund) throw new HttpError(400, mine.refundRequestedAt ? 'O reembolso desta compra já foi pedido' : 'O prazo de garantia desta compra já acabou')
  await updateDoc(`storeOrders/${orderId}`, { refundRequest: { reason, requestedAt: nowIso() }, updatedAt: nowIso() })
  const snap = await getDoc(`storeOrders/${orderId}`)
  const o = snap.data()
  const total = (o.amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  await notifyStaff('store_refund_request', `Pedido de reembolso: ${o.buyer?.name} pediu reembolso de ${o.items.map((i) => i.name).join(' + ')} (${total}).${reason ? ` Motivo: ${reason}` : ''}`)
  return { ok: true }
}

/* ------------------------------- equipe ------------------------------- */

async function actionAdminStatus() {
  return {
    mercadoPago: mpConfigured(),
    pixManual: (await getPaymentSettings()).manualReady,
    invoice: await invoiceStatus(),
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

/** Apaga o aluno (acessos, progresso, senha e links). Pedidos ficam como histórico. */
async function actionAdminDeleteMember(req) {
  const uid = String(req.body?.uid || '')
  if (!/^m_[a-f0-9]{26}$/.test(uid)) throw new HttpError(400, 'Aluno inválido')
  return { ok: true, removed: await deleteMemberData(uid) }
}

async function deleteMemberData(uid) {
  const [enrollments, progress, codes] = await Promise.all([
    queryDocs('storeEnrollments', [['uid', uid]]),
    queryDocs('storeProgress', [['uid', uid]]),
    queryDocs('storeAccessCodes', [['uid', uid]]),
  ])
  await Promise.all([
    ...enrollments.map((e) => deleteDoc(`storeEnrollments/${e.id}`)),
    ...progress.map((p) => deleteDoc(`storeProgress/${p.id}`)),
    ...codes.map((c) => deleteDoc(`storeAccessCodes/${c.id}`)),
    deleteDoc(`storeMemberSecrets/${uid}`),
  ])
  await deleteDoc(`storeMembers/${uid}`)
  return { enrollments: enrollments.length, progress: progress.length, links: codes.length }
}

const STORE_NOTIFICATION_TYPES = ['store_sale', 'store_pix_pending', 'store_refund_request', 'store_refund', 'store_capi_error']

/** Exclui um pedido de teste (só admin): some das Vendas junto com os acessos que
 *  ele liberou, os avisos da venda e o uso do cupom. Aluno que fica sem nenhum
 *  acesso nem outro pedido é apagado também. Não mexe no dinheiro: venda paga de
 *  verdade se reembolsa antes. */
async function actionAdminDeleteOrder(req, user) {
  if (user.role !== 'admin') throw new HttpError(403, 'Só admin pode excluir pedidos')
  const orderId = String(req.body?.orderId || '')
  if (!/^ord_[A-Za-z0-9]{6,40}$/.test(orderId)) throw new HttpError(400, 'Pedido inválido')
  const snap = await getDoc(`storeOrders/${orderId}`)
  if (!snap.exists) throw new HttpError(404, 'Pedido não encontrado')
  const order = snap.data()
  if (order.invoice?.status === 'autorizado') throw new HttpError(400, 'Esse pedido tem nota fiscal emitida. Cancele a nota antes de excluir.')

  // Acessos liberados por este pedido (outro pedido do mesmo aluno continua valendo).
  const uid = order.memberUid || memberUidFor(order.buyer?.email || '')
  const enrollments = await queryDocs('storeEnrollments', [['orderId', orderId]])
  await Promise.all(enrollments.map((e) => deleteDoc(`storeEnrollments/${e.id}`)))

  // Avisos desta venda: o aviso guarda o texto, então casa pelo nome do comprador a partir da data do pedido.
  const since = new Date(order.createdAt).getTime() - 5 * 60_000
  const name = String(order.buyer?.name || '').trim()
  let notifications = 0
  if (name) {
    const lists = await Promise.all(STORE_NOTIFICATION_TYPES.map((t) => queryDocs('notifications', [['type', t]])))
    const mine = lists.flat().filter((n) => String(n.message || '').includes(name) && new Date(n.createdAt).getTime() >= since)
    await Promise.all(mine.map((n) => deleteDoc(`notifications/${n.id}`)))
    notifications = mine.length
  }

  if (order.couponId && order.fulfilledAt) await incrementField(`storeCoupons/${order.couponId}`, 'uses', -1).catch(() => {})
  await deleteDoc(`storeLocks/fulfill_${orderId}`).catch(() => {})
  await deleteDoc(`storeOrders/${orderId}`)

  let memberDeleted = false
  if (uid && /^m_[a-f0-9]{26}$/.test(uid)) {
    const [left, otherOrders] = await Promise.all([queryDocs('storeEnrollments', [['uid', uid]]), queryDocs('storeOrders', [['memberUid', uid]])])
    if (!left.length && !otherOrders.length) {
      await deleteMemberData(uid)
      memberDeleted = true
    }
  }
  console.log(`[loja] pedido ${orderId} excluído por ${user.name}`)
  return { ok: true, removed: { enrollments: enrollments.length, notifications, memberDeleted } }
}

async function actionAdminRefund(req, user) {
  const orderId = String(req.body?.orderId || '')
  const snap = await getDoc(`storeOrders/${orderId}`)
  if (!snap.exists) throw new HttpError(404, 'Pedido não encontrado')
  const order = snap.data()
  if (order.status !== 'approved') throw new HttpError(400, 'Só dá pra reembolsar pedido aprovado')
  if (order.mpPaymentId && mpConfigured()) await refundPayment(order.mpPaymentId)
  await updateDoc(`storeOrders/${orderId}`, { status: 'refunded', refundedAt: nowIso(), refundedBy: user.name, updatedAt: nowIso() })
  // Pix direto: o dinheiro é devolvido pela equipe no app do banco (o sistema só registra e remove o acesso).
  await cancelInvoice(orderId).catch((err) => console.warn('[loja] cancelar nota falhou:', err?.message))
  for (const pid of order.productIds || []) {
    if (order.memberUid) await revokeAccess(order.memberUid, pid).catch(() => {})
  }
  return { ok: true }
}

async function actionAdminConfirm(req, user) {
  const orderId = String(req.body?.orderId || '')
  const snap = await getDoc(`storeOrders/${orderId}`)
  if (!snap.exists) throw new HttpError(404, 'Pedido não encontrado')
  const order = snap.data()
  // Pix direto expirado (7 dias sem confirmação) ainda pode ser confirmado se o dinheiro caiu.
  const expiredPix = order.status === 'refused' && !!order.expiredAt
  if (order.status !== 'pending' && !expiredPix) throw new HttpError(400, 'Esse pedido não está aguardando pagamento')
  if (order.method !== 'pix_manual') throw new HttpError(400, 'Só pedidos de Pix direto são confirmados à mão')
  await updateDoc(`storeOrders/${orderId}`, { status: 'approved', approvedAt: nowIso(), confirmedBy: user.name, updatedAt: nowIso() })
  const done = await fulfillOrder(publicOrigin(req), orderId)
  return { ok: true, accessUrl: done?.accessUrl || null }
}

/** Confere no Mercado Pago os pedidos pendentes (o CRM chama ao abrir as Vendas;
 *  cobre webhook que não chegou). Limitado a 1x a cada 2 min. */
async function actionAdminReconcile(req) {
  if (!(await rateLimit('admin-reconcile', 1, 2 * 60_000))) return { skipped: true }
  return reconcilePendingOrders(publicOrigin(req), 25)
}

async function actionAdminCancel(req, user) {
  const orderId = String(req.body?.orderId || '')
  const snap = await getDoc(`storeOrders/${orderId}`)
  if (!snap.exists) throw new HttpError(404, 'Pedido não encontrado')
  if (snap.data().status !== 'pending') throw new HttpError(400, 'Esse pedido não está aguardando pagamento')
  await updateDoc(`storeOrders/${orderId}`, { status: 'refused', cancelledBy: user.name, updatedAt: nowIso() })
  return { ok: true }
}

/* ----------------------------- nota fiscal ----------------------------- */

const orderIdFromRef = (ref) => String(ref || '').replace(/-\d+$/, '')

/** Webhook (gatilho) da Focus NFe. Não confia no corpo: reconsulta a nota. */
async function actionInvoiceWebhook(req) {
  const orderId = orderIdFromRef(req.body?.ref || req.query.ref)
  if (/^ord_[A-Za-z0-9]{6,40}$/.test(orderId)) await syncInvoice(orderId)
  return { ok: true }
}

/** Cifra o link de um PDF protegido (o aluno nunca recebe o link original). */
async function actionAdminFileSeal(req) {
  const url = String(req.body?.url || '').trim()
  if (!/^https:\/\/\S+$/.test(url)) throw new HttpError(400, 'Link inválido (precisa começar com https://)')
  return { sealed: encryptToken(url) }
}

async function actionAdminCapiStatus() {
  return capiStatus()
}

async function actionAdminCapiToken(req, user) {
  const pixelId = cleanPixelId(req.body?.pixelId)
  if (!pixelId) throw new HttpError(400, 'Número do pixel inválido')
  const token = String(req.body?.token || '').trim()
  if (!token) {
    await removeCapiToken(pixelId)
    return { ok: true, removed: true }
  }
  if (token.length < 30) throw new HttpError(400, 'Token inválido')
  await saveCapiToken(pixelId, token, user.name)
  return { ok: true }
}

async function actionAdminCapiTest(req) {
  const pixelId = cleanPixelId(req.body?.pixelId)
  if (!pixelId) throw new HttpError(400, 'Número do pixel inválido')
  return sendCapiTest(pixelId, String(req.body?.testCode || '').trim() || null)
}

async function actionAdminInvoiceToken(req, user) {
  const token = String(req.body?.token || '').trim()
  if (token.length < 10) throw new HttpError(400, 'Token inválido')
  await saveInvoiceToken(token, user.name)
  return { ok: true }
}

async function actionAdminInvoiceEmit(req) {
  const orderId = String(req.body?.orderId || '')
  if (!/^ord_[A-Za-z0-9]{6,40}$/.test(orderId)) throw new HttpError(400, 'Pedido inválido')
  return { invoice: await emitInvoice(orderId, { force: true }) }
}

async function actionAdminInvoiceSync(req) {
  const ids = (Array.isArray(req.body?.orderIds) ? req.body.orderIds : []).map(String).filter((id) => /^ord_[A-Za-z0-9]{6,40}$/.test(id)).slice(0, 20)
  const results = {}
  for (const id of ids) results[id] = await syncInvoice(id).catch(() => null)
  return { results }
}

/* ------------------------- notificações push ------------------------- */

async function actionAdminPushKey() {
  return { publicKey: pushPublicKey() }
}

async function actionAdminPushSubscribe(req, user) {
  if (!pushConfigured()) throw new HttpError(503, 'As notificações ainda não foram configuradas no servidor')
  const sub = cleanSubscription(req.body?.subscription)
  if (!sub) throw new HttpError(400, 'Aparelho inválido')
  await savePushSubscription(user.uid, sub, req.headers['user-agent'])
  return { ok: true }
}

async function actionAdminPushUnsubscribe(req) {
  const endpoint = String(req.body?.endpoint || '')
  if (endpoint) await removePushSubscription(endpoint)
  return { ok: true }
}

async function actionAdminPushTest(req, user) {
  if (!pushConfigured()) throw new HttpError(503, 'As notificações ainda não foram configuradas no servidor')
  const { sent } = await sendPushToUsers([user.uid], {
    title: 'Venda aprovada',
    body: 'Teste: é assim que o aviso chega quando alguém comprar. Toque para abrir a Loja.',
    url: '/loja',
    tag: `teste-${Date.now()}`,
  })
  if (!sent) throw new HttpError(404, 'Nenhum aparelho com notificação ativa encontrado. Ative de novo neste aparelho.')
  return { sent }
}

/* ------------------------------- roteador ------------------------------ */

const PUBLIC = {
  'GET checkout': actionCheckout,
  'GET members-theme': actionMembersTheme,
  'GET members-catalog': actionMembersCatalog,
  'POST coupon': actionCoupon,
  'POST order': actionOrder,
  'GET order': actionOrderStatus,
  'POST webhook': actionWebhook,
  'GET webhook': actionWebhook,
  'POST member-enter': actionMemberEnter,
  'POST member-send-link': actionMemberSendLink,
  'POST member-login': actionMemberLogin,
  'POST member-password': actionMemberPassword,
  'GET member-orders': actionMemberOrders,
  'POST member-refund-request': actionMemberRefundRequest,
  'GET member-file': actionMemberFile,
  'POST invoice-webhook': actionInvoiceWebhook,
}

// Respostas públicas iguais para todo mundo: a Vercel guarda e responde sem chamar o Firestore.
// Mudança no produto aparece no checkout em até ~1 min (a prévia do CRM é na hora).
const CACHED = {
  'GET checkout': 'public, s-maxage=60, stale-while-revalidate=120',
  'GET members-theme': 'public, s-maxage=60, stale-while-revalidate=300',
  'GET members-catalog': 'public, s-maxage=300, stale-while-revalidate=600',
}

const ADMIN = {
  'GET admin-status': actionAdminStatus,
  'POST admin-grant': actionAdminGrant,
  'POST admin-link': actionAdminLink,
  'POST admin-revoke': actionAdminRevoke,
  'POST admin-refund': actionAdminRefund,
  'POST admin-delete-order': actionAdminDeleteOrder,
  'POST admin-confirm': actionAdminConfirm,
  'POST admin-delete-member': actionAdminDeleteMember,
  'POST admin-cancel': actionAdminCancel,
  'POST admin-reconcile': actionAdminReconcile,
  'POST admin-invoice-token': actionAdminInvoiceToken,
  'GET admin-capi-status': actionAdminCapiStatus,
  'POST admin-file-seal': actionAdminFileSeal,
  'POST admin-capi-token': actionAdminCapiToken,
  'POST admin-capi-test': actionAdminCapiTest,
  'POST admin-invoice-emit': actionAdminInvoiceEmit,
  'POST admin-invoice-sync': actionAdminInvoiceSync,
  'GET admin-push-key': actionAdminPushKey,
  'POST admin-push-subscribe': actionAdminPushSubscribe,
  'POST admin-push-unsubscribe': actionAdminPushUnsubscribe,
  'POST admin-push-test': actionAdminPushTest,
}

export default async function handler(req, res) {
  const route = `${req.method} ${req.query.action || ''}`
  try {
    if (PUBLIC[route]) {
      const out = await PUBLIC[route](req)
      if (out?.__file) {
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`)
        res.setHeader('Cache-Control', 'private, no-store')
        return res.status(200).send(out.__file)
      }
      if (CACHED[route]) res.setHeader('Cache-Control', CACHED[route])
      return res.status(200).json(out)
    }
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

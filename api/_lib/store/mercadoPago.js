// Mercado Pago (Checkout Transparente) — via REST puro, sem SDK.
//
// Variáveis no painel da Vercel (Settings > Environment Variables):
//   MP_ACCESS_TOKEN  → credencial de produção (APP_USR-...) da conta que recebe
//   MP_PUBLIC_KEY    → chave pública (vai pro navegador, não é segredo)
// Mercado Pago > Seu negócio > Configurações > Gestão e administração >
// Credenciais. Sem elas, o checkout só funciona em "modo teste" (produto com
// testMode ligado), que libera o acesso sem cobrar — útil pra conferir o fluxo.

const MP_BASE = 'https://api.mercadopago.com'
const TIMEOUT_MS = 25_000

export function mpConfigured() {
  return Boolean(process.env.MP_ACCESS_TOKEN && process.env.MP_PUBLIC_KEY)
}

export function mpPublicKey() {
  return process.env.MP_PUBLIC_KEY || null
}

async function mpFetch(path, { method = 'GET', body, idempotencyKey } = {}) {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) throw new Error('MP_ACCESS_TOKEN não configurado no servidor')
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey
  const res = await fetch(`${MP_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const cause = data?.cause?.[0]?.description || data?.message || res.status
    const err = new Error(`Mercado Pago recusou: ${cause}`)
    err.mp = data
    throw err
  }
  return data
}

/** Separa "Maria da Silva" em { first_name: 'Maria', last_name: 'da Silva' }. */
function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/)
  return { first_name: parts[0] || 'Cliente', last_name: parts.slice(1).join(' ') || '-' }
}

function payerFrom(buyer) {
  const payer = { email: buyer.email, ...splitName(buyer.name) }
  const cpf = String(buyer.cpf || '').replace(/\D/g, '')
  if (cpf.length === 11) payer.identification = { type: 'CPF', number: cpf }
  else if (cpf.length === 14) payer.identification = { type: 'CNPJ', number: cpf }
  return payer
}

/** Cria um Pix. Devolve o pagamento do MP (point_of_interaction tem o QR). */
export function createPixPayment({ orderId, amountCents, description, buyer, notificationUrl, expiresMinutes = 30 }) {
  const expires = new Date(Date.now() + expiresMinutes * 60_000)
  return mpFetch('/v1/payments', {
    method: 'POST',
    idempotencyKey: `pix-${orderId}`,
    body: {
      transaction_amount: amountCents / 100,
      description,
      payment_method_id: 'pix',
      payer: payerFrom(buyer),
      external_reference: orderId,
      notification_url: notificationUrl,
      date_of_expiration: expires.toISOString().replace('Z', '-00:00'),
    },
  })
}

/** Cobra no cartão com o token gerado no navegador pelo Card Payment Brick
 *  (o número do cartão nunca passa pelo nosso servidor). */
export function createCardPayment({ orderId, amountCents, description, buyer, card, notificationUrl, statementDescriptor }) {
  return mpFetch('/v1/payments', {
    method: 'POST',
    idempotencyKey: `card-${orderId}`,
    body: {
      transaction_amount: amountCents / 100,
      description,
      token: card.token,
      installments: Number(card.installments) || 1,
      payment_method_id: card.paymentMethodId,
      issuer_id: card.issuerId || undefined,
      payer: {
        ...payerFrom(buyer),
        ...(card.identification?.number ? { identification: card.identification } : {}),
      },
      external_reference: orderId,
      notification_url: notificationUrl,
      statement_descriptor: statementDescriptor ? String(statementDescriptor).slice(0, 13) : undefined,
    },
  })
}

export function getPayment(paymentId) {
  return mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}`)
}

export function refundPayment(paymentId) {
  return mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
    method: 'POST',
    idempotencyKey: `refund-${paymentId}`,
    body: {},
  })
}

/** Status do MP → status do pedido. */
export function orderStatusFromMp(mpStatus) {
  switch (mpStatus) {
    case 'approved':
      return 'approved'
    case 'refunded':
    case 'charged_back':
      return 'refunded'
    case 'rejected':
    case 'cancelled':
      return 'refused'
    default:
      return 'pending' // pending, in_process, authorized, in_mediation
  }
}

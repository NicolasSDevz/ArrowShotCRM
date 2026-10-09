import { auth } from '../firebase/config'
import { membersAuth } from '../firebase/membersApp'

/** Cliente de /api/loja (ver api/loja.js). */

export interface PublicCheckout {
  id: string
  slug: string
  name: string
  description: string
  imageUrl: string | null
  price: number
  comparePrice: number | null
  supportEmail: string | null
  maxInstallments: number
  paymentMethods: { pix: boolean; card: boolean }
  pixDiscountPercent: number
  checkout: {
    primaryColor: string
    backgroundColor: string
    font: string
    headerImageUrl: string | null
    headline: string
    subheadline: string
    countdown: { minutes: number; text: string; color: string; textColor: string; position: import('../types/store').StoreCountdownPosition; devices: import('../types/store').StoreDeviceScope } | null
    design: import('../types/store').StoreCheckoutDesign
    sideImages: string[]
    benefits: string[]
    testimonials: { name: string; text: string; photoUrl?: string }[]
    guaranteeDays: number
    askPhone: boolean
    askCpf: boolean
    confirmEmail: boolean
    buttonText: string
    fbPixelId: string | null
    thankYouUrl: string | null
    footerText: string
  }
  bumps: { productId: string; name: string; imageUrl: string | null; headline: string; description: string; cta: string; animation?: import('../types/store').StoreBumpAnimation; price: number; fullPrice: number }[]
  gateway: { mercadoPago: boolean; publicKey: string | null; pixManual: boolean; testMode: boolean }
}

export interface PixData {
  qrCode: string | null
  qrBase64: string | null
  ticketUrl: string | null
  expiresAt: string | null
  /** Pix direto na conta (confirmação manual pela equipe). */
  manual?: boolean
  whatsapp?: string | null
}

export interface OrderResult {
  orderId: string
  key: string
  status: 'pending' | 'approved' | 'refused' | 'refunded'
  statusDetail: string | null
  amount: number
  pix: PixData | null
  accessUrl: string | null
}

export interface OrderStatus {
  orderId: string
  status: OrderResult['status']
  statusDetail: string | null
  amount: number
  method: string
  items: { name: string; price: number }[]
  buyerName: string
  buyerEmail: string
  pix: PixData | null
  accessUrl: string | null
  emailSent: boolean
  productId: string
  manualPix?: boolean
}

async function call<T>(action: string, opts: { method?: 'GET' | 'POST'; params?: Record<string, string>; body?: unknown; token?: string | null } = {}): Promise<T> {
  const qs = new URLSearchParams({ action, ...(opts.params || {}) })
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  const res = await fetch(`/api/loja?${qs.toString()}`, {
    method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Não foi possível concluir. Tente de novo.')
  return data as T
}

async function staffToken() {
  const user = auth.currentUser
  if (!user) throw new Error('Faça login de novo no CRM')
  return user.getIdToken()
}

/* área de membros: visual (público) */
export const fetchMembersTheme = () => call<Partial<import('../types/store').StoreMembersTheme>>('members-theme')

/* checkout público */
export const fetchCheckout = (slug: string) => call<PublicCheckout>('checkout', { params: { slug } })
export const checkCoupon = (slug: string, code: string) => call<{ code: string; percent: number }>('coupon', { body: { slug, code } })
export const createOrder = (body: unknown) => call<OrderResult>('order', { body })
export const fetchOrderStatus = (id: string, key: string) => call<OrderStatus>('order', { params: { id, key } })

/* alunos */
export const memberEnter = (code: string) => call<{ token: string; hasPassword: boolean }>('member-enter', { body: { code } })
export const memberLogin = (email: string, password: string) => call<{ token: string; hasPassword: boolean }>('member-login', { body: { email, password } })
export interface MemberOrder {
  orderId: string
  items: string[]
  amount: number
  status: 'pending' | 'approved' | 'refused' | 'refunded'
  approvedAt: string | null
  guaranteeUntil: string | null
  canRequestRefund: boolean
  refundRequestedAt: string | null
  supportEmail: string | null
}
export async function memberOrders() {
  const token = await membersAuth.currentUser?.getIdToken()
  return call<{ orders: MemberOrder[] }>('member-orders', { token })
}
export async function memberRefundRequest(orderId: string, reason: string) {
  const token = await membersAuth.currentUser?.getIdToken()
  return call<{ ok: true }>('member-refund-request', { body: { orderId, reason }, token })
}
export async function memberSetPassword(password: string) {
  const token = await membersAuth.currentUser?.getIdToken()
  return call<{ ok: true }>('member-password', { body: { password }, token })
}

/* equipe */
export async function storeAdminStatus() {
  return call<{ mercadoPago: boolean; pixManual: boolean; email: boolean; invoice: { enabled: boolean; hasToken: boolean; environment: string } }>('admin-status', { token: await staffToken() })
}
export async function storeGrantAccess(email: string, name: string, productId: string) {
  return call<{ uid: string; accessUrl: string }>('admin-grant', { body: { email, name, productId }, token: await staffToken() })
}
export async function storeAccessLink(uid: string) {
  return call<{ accessUrl: string }>('admin-link', { body: { uid }, token: await staffToken() })
}
export async function storeRevokeAccess(uid: string, productId: string) {
  return call<{ ok: true }>('admin-revoke', { body: { uid, productId }, token: await staffToken() })
}
export async function storeCapiStatus() {
  return call<{ pixels: Record<string, { updatedAt: string | null; updatedBy: string | null }> }>('admin-capi-status', { token: await staffToken() })
}
export async function storeSaveCapiToken(pixelId: string, token: string) {
  return call<{ ok: true }>('admin-capi-token', { body: { pixelId, token }, token: await staffToken() })
}
export async function storeTestCapi(pixelId: string, testCode: string) {
  return call<{ ok: boolean; error?: string; received?: number }>('admin-capi-test', { body: { pixelId, testCode }, token: await staffToken() })
}
export async function storeSaveInvoiceToken(token: string) {
  return call<{ ok: true }>('admin-invoice-token', { body: { token }, token: await staffToken() })
}
export async function storeEmitInvoice(orderId: string) {
  return call<{ invoice: unknown }>('admin-invoice-emit', { body: { orderId }, token: await staffToken() })
}
export async function storeSyncInvoices(orderIds: string[]) {
  return call<{ results: Record<string, unknown> }>('admin-invoice-sync', { body: { orderIds }, token: await staffToken() })
}
export async function storeConfirmOrder(orderId: string) {
  return call<{ ok: true; accessUrl: string | null }>('admin-confirm', { body: { orderId }, token: await staffToken() })
}
export async function storeCancelOrder(orderId: string) {
  return call<{ ok: true }>('admin-cancel', { body: { orderId }, token: await staffToken() })
}
export async function storeDeleteMember(uid: string) {
  return call<{ ok: true }>('admin-delete-member', { body: { uid }, token: await staffToken() })
}
export async function storeRefundOrder(orderId: string) {
  return call<{ ok: true }>('admin-refund', { body: { orderId }, token: await staffToken() })
}

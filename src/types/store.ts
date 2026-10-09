import type { Timestamp } from 'firebase/firestore'
import type { BaseDoc } from './common'

/** Loja = checkout próprio + área de membros (nosso "Kiwify").
 *  Valores em dinheiro sempre em CENTAVOS (inteiro). */

export type StoreProductStatus = 'draft' | 'active' | 'archived'

export interface StoreOrderBump {
  productId: string
  headline: string
  description: string
  cta: string
  /** Preço especial da oferta (centavos). Vazio = preço normal do produto. */
  price?: number | null
}

export interface StoreTestimonial {
  name: string
  text: string
  photoUrl?: string
}

export interface StoreCheckoutConfig {
  primaryColor: string
  backgroundColor: string
  font: string
  headerImageUrl?: string | null
  headline?: string
  subheadline?: string
  countdown: { enabled: boolean; minutes: number; text: string; color: string }
  sideImages: string[]
  benefits: string[]
  testimonials: StoreTestimonial[]
  guaranteeDays: number
  askPhone: boolean
  askCpf: boolean
  confirmEmail: boolean
  buttonText: string
  fbPixelId?: string | null
  thankYouUrl?: string | null
  footerText?: string
  bumps: StoreOrderBump[]
}

export interface StoreMembersConfig {
  bannerUrl?: string | null
  coverUrl?: string | null
  logoUrl?: string | null
  primaryColor: string
  welcomeTitle?: string
  welcomeText?: string
  commentsEnabled: boolean
  commentsNeedApproval: boolean
  certificateEnabled: boolean
  /** Carga horária impressa no certificado. */
  certificateHours?: number
  producerName?: string
}

export interface StoreProduct extends BaseDoc {
  name: string
  slug: string
  status: StoreProductStatus
  description: string
  imageUrl?: string | null
  price: number
  comparePrice?: number | null
  maxInstallments: number
  paymentMethods: { pix: boolean; card: boolean }
  supportEmail?: string | null
  statementDescriptor?: string | null
  /** Sem Mercado Pago configurado, deixa comprar sem cobrar (para testar o fluxo). */
  testMode: boolean
  checkout: StoreCheckoutConfig
  members: StoreMembersConfig
  /** Total de aulas (mantido pelo editor de conteúdo) — usado no % dos alunos. */
  lessonCount?: number
}

export interface StoreModule {
  id: string
  title: string
  order: number
  coverUrl?: string | null
  /** Libera N dias depois da compra (0 = na hora). */
  releaseDays: number
  createdAt?: Timestamp
}

export interface StoreAttachment {
  name: string
  url: string
}

export interface StoreLesson {
  id: string
  moduleId: string
  title: string
  order: number
  videoUrl?: string | null
  description?: string
  attachments: StoreAttachment[]
  durationMin?: number | null
  releaseDays: number
  createdAt?: Timestamp
}

export type StoreOrderStatus = 'pending' | 'approved' | 'refused' | 'refunded'

export interface StoreOrderItem {
  productId: string
  name: string
  price: number
  fullPrice: number
  bump: boolean
}

export interface StoreOrder {
  id: string
  productId: string
  productName: string
  items: StoreOrderItem[]
  productIds: string[]
  amount: number
  couponCode?: string | null
  couponPercent?: number
  buyer: { name: string; email: string; phone?: string | null; cpf?: string | null }
  method: 'pix' | 'pix_manual' | 'card' | 'test' | 'free'
  confirmedBy?: string
  installments?: number
  status: StoreOrderStatus
  mpPaymentId?: string
  mpStatus?: string
  mpStatusDetail?: string | null
  test?: boolean
  memberUid?: string
  accessUrl?: string
  emailSent?: boolean
  utm?: Record<string, string>
  invoice?: StoreInvoice
  createdAt: string
  approvedAt?: string
  refundedAt?: string
}

export interface StoreCoupon extends BaseDoc {
  code: string
  percent: number
  productId?: string | null
  active: boolean
  maxUses?: number | null
  uses?: number
  expiresAt?: string | null
}

export interface StoreMember {
  id: string
  email: string
  name: string
  phone?: string | null
  hasPassword: boolean
  createdAt: string
  lastAccessAt?: string | null
}

export interface StoreEnrollment {
  id: string
  uid: string
  email: string
  productId: string
  orderId?: string | null
  source: 'compra' | 'manual'
  active: boolean
  createdAt: string
}

export interface StoreProgress {
  id: string
  uid: string
  productId: string
  completed: string[]
  lastLessonId?: string | null
  ratings?: Record<string, number>
  updatedAt?: Timestamp
}

export interface StoreComment {
  id: string
  productId: string
  lessonId: string
  lessonTitle?: string
  uid: string
  authorName: string
  text: string
  status: 'approved' | 'pending'
  isProducer: boolean
  parentId?: string | null
  createdAt: Timestamp
}

/** Nota fiscal do pedido (Focus NFe). */
export interface StoreInvoice {
  status: 'processando' | 'autorizado' | 'erro' | 'cancelado'
  ref?: string
  attempt?: number
  numero?: string | null
  pdfUrl?: string | null
  xmlUrl?: string | null
  error?: string | null
  cancelError?: string
  emailSent?: boolean
  environment?: 'homologacao' | 'producao'
}

/** storeSettings/invoice — dados fiscais para a NFS-e (o token fica no servidor). */
export interface StoreInvoiceSettings {
  enabled: boolean
  environment: 'homologacao' | 'producao'
  cnpj: string
  inscricaoMunicipal: string
  /** Código IBGE do município da empresa (7 dígitos). */
  codigoMunicipio: string
  /** Item da lista de serviço da LC 116 (ex.: 0802 = treinamento). */
  itemListaServico: string
  codigoTributarioMunicipio?: string
  codigoCnae?: string
  aliquota: number
  simplesNacional: boolean
  naturezaOperacao?: number
  /** Texto da nota. Aceita {produtos}, {pedido} e {cliente}. */
  discriminacao: string
}

/** storeSettings/payments — Pix direto na conta (ex.: Nubank), sem taxa. */
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'evp'

export interface StorePaymentSettings {
  pixManual: boolean
  pixKey: string
  pixKeyType: PixKeyType
  /** Nome do titular da conta (aparece no app do banco de quem paga). */
  pixName: string
  pixCity: string
  /** WhatsApp para o comprador mandar o comprovante (só números, com DDD). */
  whatsapp?: string
}

export const PIX_KEY_TYPE_LABEL: Record<PixKeyType, string> = {
  cnpj: 'CNPJ',
  cpf: 'CPF',
  email: 'E-mail',
  phone: 'Celular',
  evp: 'Chave aleatória',
}

export const STORE_FONTS = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Rubik'] as const

export const STORE_ORDER_STATUS_LABEL: Record<StoreOrderStatus, string> = {
  pending: 'Aguardando pagamento',
  approved: 'Aprovado',
  refused: 'Recusado',
  refunded: 'Reembolsado',
}

export const STORE_METHOD_LABEL: Record<StoreOrder['method'], string> = {
  pix: 'Pix (Mercado Pago)',
  pix_manual: 'Pix direto na conta',
  card: 'Cartão',
  test: 'Teste',
  free: 'Gratuito',
}

export function defaultCheckoutConfig(): StoreCheckoutConfig {
  return {
    primaryColor: '#2563eb',
    backgroundColor: '#f1f5f9',
    font: 'Inter',
    headerImageUrl: null,
    headline: '',
    subheadline: 'Acesso imediato após a confirmação do pagamento.',
    countdown: { enabled: false, minutes: 15, text: 'Oferta por tempo limitado', color: '#e55858' },
    sideImages: [],
    benefits: [],
    testimonials: [],
    guaranteeDays: 7,
    askPhone: true,
    askCpf: false,
    confirmEmail: false,
    buttonText: 'Comprar agora',
    fbPixelId: null,
    thankYouUrl: null,
    footerText: '',
    bumps: [],
  }
}

export function defaultMembersConfig(): StoreMembersConfig {
  return {
    bannerUrl: null,
    coverUrl: null,
    logoUrl: null,
    primaryColor: '#2563eb',
    welcomeTitle: '',
    welcomeText: '',
    commentsEnabled: true,
    commentsNeedApproval: false,
    certificateEnabled: true,
    certificateHours: undefined,
    producerName: 'Arrow Shot',
  }
}

export function formatCents(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

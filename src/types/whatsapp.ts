/** WhatsApp da Arrow Shot (API oficial do Meta). Ver api/_lib/whatsapp.js. */

export type WaAiMode = 'auto' | 'off'

export interface WaConversation {
  id: string
  waId: string
  phone: string
  name: string
  leadId: string | null
  /** 'lead' = contato da agência; 'cart' = carrinho abandonado da Loja. */
  kind: 'lead' | 'cart'
  cartId?: string
  productId?: string
  productName?: string
  aiMode: WaAiMode
  handoffReason?: string | null
  followUpStep: number
  followUpStopped: boolean
  followUpError?: string
  unread: number
  lastMessageAt: string
  lastMessageText: string
  lastDirection: 'in' | 'out' | null
  /** Última mensagem do contato: abre a janela de 24h de texto livre. */
  lastInboundAt: string | null
}

export interface WaMessage {
  id: string
  direction: 'in' | 'out'
  type: string
  text: string
  at: string
  status: 'received' | 'sent' | 'delivered' | 'read' | 'failed'
  /** 'contact' | 'ai' | 'followup' | 'cart' | uid de quem mandou pelo CRM */
  by: string
  byName?: string
  error?: string
}

export interface WaTemplate {
  name: string
  language: string
  status: string
  category: string
  body: string
  vars: number
}

export interface WaFollowUpStep {
  afterHours: number
  /** Vazio = a IA escreve (dentro da janela de 24h). Aceita {nome}. */
  text: string
  /** Usado quando já passou de 24h (o WhatsApp só deixa modelo). */
  templateName: string
  templateLang: string
}

export type WaCartParam = 'nome' | 'produto' | 'link' | 'valor'

export interface WaSettings {
  aiEnabled: boolean
  aiInstructions: string
  autoCreateLead: boolean
  followUp: { enabled: boolean; businessHoursOnly: boolean; steps: WaFollowUpStep[] }
  cart: { enabled: boolean; afterMinutes: number; templateName: string; templateLang: string; params: WaCartParam[] }
}

export const WA_DEFAULT_SETTINGS: WaSettings = {
  aiEnabled: true,
  aiInstructions: '',
  autoCreateLead: true,
  followUp: {
    enabled: true,
    businessHoursOnly: true,
    steps: [
      { afterHours: 4, text: '', templateName: '', templateLang: 'pt_BR' },
      { afterHours: 24, text: '', templateName: '', templateLang: 'pt_BR' },
      { afterHours: 72, text: '', templateName: '', templateLang: 'pt_BR' },
    ],
  },
  cart: { enabled: false, afterMinutes: 40, templateName: '', templateLang: 'pt_BR', params: ['nome', 'produto', 'link'] },
}

export const WA_CART_PARAM_LABEL: Record<WaCartParam, string> = {
  nome: 'Primeiro nome',
  produto: 'Nome do produto',
  link: 'Link do checkout preenchido',
  valor: 'Valor do carrinho',
}

export interface WaStatus {
  connected: boolean
  hasAppSecret: boolean
  phoneNumberId: string
  wabaId: string
  displayPhone: string
  verifiedName: string
  qualityRating: string
  updatedAt: string | null
  lastWebhookAt: string | null
  webhookUrl: string
  verifyToken: string
}

const WINDOW_MS = 24 * 3600_000 - 10 * 60_000

/** Ainda dá pra mandar texto livre? (até 24h depois da última mensagem do contato) */
export function waInWindow(c: Pick<WaConversation, 'lastInboundAt'> | null | undefined, now = Date.now()) {
  if (!c?.lastInboundAt) return false
  return now - new Date(c.lastInboundAt).getTime() < WINDOW_MS
}

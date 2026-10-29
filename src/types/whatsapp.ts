/** WhatsApp da Arrow Shot (API oficial do Meta). Ver api/_lib/whatsapp.js. */

export type WaAiMode = 'auto' | 'off'

/** Etapas do SDR (a IA que qualifica e agenda). Ver leadSystemPrompt em api/_lib/whatsapp.js. */
export type WaSdrStage = 'abertura' | 'descoberta' | 'qualificacao' | 'agendamento' | 'agendado' | 'nutricao' | 'desqualificado'
export type WaSdrTemperature = 'quente' | 'morno' | 'frio'
export type WaSdrField = 'nome' | 'empresa' | 'cidade' | 'servico' | 'tamanho' | 'anuncia' | 'investimento' | 'objetivo' | 'decisor' | 'prazo'

export interface WaSdr {
  stage: WaSdrStage
  temperature: WaSdrTemperature
  /** 0 a 100: chance de virar cliente bom. */
  score: number
  profile: Partial<Record<WaSdrField, string>>
  summary: string
  nextStep: string
  /** at = "AAAA-MM-DDTHH:MM" no horário de Brasília (vazio se não tem hora exata). */
  meeting: { agreed: boolean; when: string; at?: string }
  updatedAt: string
}

export interface WaConversation {
  id: string
  waId: string
  phone: string
  name: string
  leadId: string | null
  /** 'existing' = o número já estava no CRM quando chamou; 'created' = virou lead novo. */
  leadMatch?: 'existing' | 'created' | null
  /** 'lead' = contato da agência; 'cart' = carrinho abandonado da Loja. */
  kind: 'lead' | 'cart'
  cartId?: string
  productId?: string
  productName?: string
  aiMode: WaAiMode
  handoffReason?: string | null
  /** Motivo de a IA não ter respondido: já é cliente ou já está com a equipe. */
  knownContact?: string | null
  /** Contato novo esperando a equipe dizer se a IA atende. */
  approval?: { status: 'pending' | 'approved' | 'rejected' | 'timeout'; askedAt: string; decidedAt?: string; decidedByName?: string } | null
  followUpStep: number
  followUpStopped: boolean
  followUpError?: string
  /** Reunião (sdr.meeting.at) que já recebeu lembrete. */
  meetingReminderFor?: string | null
  meetingReminderError?: string | null
  unread: number
  lastMessageAt: string
  lastMessageText: string
  lastDirection: 'in' | 'out' | null
  /** Última mensagem do contato: abre a janela de 24h de texto livre. */
  lastInboundAt: string | null
  /** Análise do SDR, atualizada a cada resposta da IA. */
  sdr?: WaSdr | null
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
  /** Cliente ou lead que a equipe já atende: a IA não responde e avisa a equipe. */
  skipKnownContacts?: boolean
  /** Contato novo: pergunta pra equipe se a IA atende. waitMinutes sem resposta = IA atende (0 = espera sempre). */
  approval: { enabled: boolean; waitMinutes: number }
  /** Segundos que a IA espera depois da última mensagem do contato. */
  aiDelaySeconds: number
  /** Aviso no celular a cada mensagem nova em conversa sem IA. */
  notifyEveryMessage: boolean
  followUp: { enabled: boolean; businessHoursOnly: boolean; steps: WaFollowUpStep[] }
  cart: { enabled: boolean; afterMinutes: number; templateName: string; templateLang: string; params: WaCartParam[] }
  sdr: WaSdrSettings
  reminder: WaReminderSettings
}

/** Lembrete pro contato antes da reunião marcada pela IA. */
export interface WaReminderSettings {
  enabled: boolean
  minutesBefore: number
  /** Vazio = texto padrão. Variáveis: {nome}, {quando}, {hora}, {com}. */
  text: string
  /** Modelo usado quando passou de 24h da última mensagem do contato ({{1}} = nome, {{2}} = quando). */
  templateName: string
  templateLang: string
}

export interface WaSdrSettings {
  /** Nome que a IA usa ao se apresentar (vazio = não se apresenta por nome). */
  name: string
  /** Com quem é a reunião. */
  meetingWith: string
  meetingLength: string
  /** Link da agenda (Google Agenda, Calendly...). Vazio = a IA propõe horários. */
  meetingLink: string
  meetingHours: string
}

export const WA_DEFAULT_SETTINGS: WaSettings = {
  aiEnabled: true,
  aiInstructions: '',
  autoCreateLead: true,
  skipKnownContacts: true,
  approval: { enabled: true, waitMinutes: 10 },
  aiDelaySeconds: 25,
  notifyEveryMessage: false,
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
  sdr: { name: '', meetingWith: 'Bruno', meetingLength: '30 minutos', meetingLink: '', meetingHours: 'segunda a sexta, das 9h às 18h' },
  reminder: { enabled: true, minutesBefore: 30, text: '', templateName: '', templateLang: 'pt_BR' },
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

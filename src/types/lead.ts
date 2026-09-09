import type { Timestamp } from 'firebase/firestore'
import type { BaseDoc } from './common'

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'meeting_scheduled'
  | 'proposal_sent'
  | 'negotiation'
  | 'closed'
  | 'lost'

export const LEAD_STATUS_ORDER: LeadStatus[] = [
  'new',
  'contacted',
  'meeting_scheduled',
  'proposal_sent',
  'negotiation',
  'closed',
  'lost',
]

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Novo Lead',
  contacted: 'Contato Feito',
  meeting_scheduled: 'Reunião Agendada',
  proposal_sent: 'Proposta Enviada',
  negotiation: 'Negociação',
  closed: 'Fechado ✅',
  lost: 'Perdido ❌',
}

/** Hex por etapa — usado nos badges (via `style`, não classe, já que o valor
 *  varia em tempo de execução). */
export const LEAD_STATUS_COLOR: Record<LeadStatus, string> = {
  new: '#64748B',
  contacted: '#3B82F6',
  meeting_scheduled: '#8B5CF6',
  proposal_sent: '#F59E0B',
  negotiation: '#F97316',
  closed: '#10B981',
  lost: '#EF4444',
}

export type LeadSource = 'instagram_organic' | 'instagram_ad' | 'google_ad' | 'referral' | 'whatsapp' | 'website' | 'other'

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  instagram_organic: 'Instagram (orgânico)',
  instagram_ad: 'Instagram (anúncio)',
  google_ad: 'Google (anúncio)',
  referral: 'Indicação',
  whatsapp: 'WhatsApp direto',
  website: 'Site',
  other: 'Outro',
}

export interface LeadServiceInterest {
  paidTraffic?: boolean
  metaAds?: boolean
  googleAds?: boolean
  socialMedia?: boolean
  /** Só relevante quando socialMedia === true. */
  socialMediaPackage?: 'weekly' | 'monthly'
}

export type LeadLostReason =
  | 'price'
  | 'no_response'
  | 'chose_competitor'
  | 'no_budget'
  | 'not_a_fit'
  | 'bad_timing'
  | 'other'

export const LEAD_LOST_REASON_LABEL: Record<LeadLostReason, string> = {
  price: 'Preço / valor',
  no_response: 'Parou de responder',
  chose_competitor: 'Escolheu concorrente',
  no_budget: 'Sem orçamento no momento',
  not_a_fit: 'Não era perfil de cliente',
  bad_timing: 'Momento não é adequado',
  other: 'Outro motivo',
}

export type LeadContactType = 'call' | 'whatsapp' | 'email' | 'meeting' | 'other'

export const LEAD_CONTACT_TYPE_LABEL: Record<LeadContactType, string> = {
  call: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  meeting: 'Reunião',
  other: 'Outro',
}

export type LeadContactOutcome = 'positive' | 'neutral' | 'negative'

export const LEAD_CONTACT_OUTCOME_LABEL: Record<LeadContactOutcome, string> = {
  positive: 'Positivo',
  neutral: 'Neutro',
  negative: 'Negativo',
}

export interface LeadContactEntry {
  id: string
  type: LeadContactType
  /** Data e horário do contato (definidos pelo usuário no mini-form). */
  date: Timestamp
  summary: string
  outcome: LeadContactOutcome
  createdBy: string
  createdAt: Timestamp
}

export interface Lead extends BaseDoc {
  contactName: string
  companyName?: string
  whatsapp: string
  email?: string
  cityRegion?: string
  services: LeadServiceInterest
  source: LeadSource
  estimatedValue?: number
  nextAction?: string
  nextActionDate?: Timestamp | null
  assignedTo?: string
  notes?: string
  status: LeadStatus
  /** manual sort order dentro da coluna do Kanban */
  order: number
  /** Quando `status` mudou pela última vez — base do "há X dias" no card
   *  (deliberadamente separado de updatedAt, que muda em qualquer edição). */
  stageChangedAt: Timestamp
  contactHistory: LeadContactEntry[]
  /** Preenchido por convertLeadToClient — o card então mostra "Cliente
   *  criado" em vez do botão de converter. */
  convertedClientId?: string | null
  convertedAt?: Timestamp | null
  /** Preenchidos ao mover o lead para "Perdido" (dropdown de motivo). */
  lostReason?: LeadLostReason | null
  lostReasonNote?: string | null
  lostAt?: Timestamp | null
}

export type LeadInput = Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'stageChangedAt'>

import type { BaseDoc } from './common'

export type LeadFormQuestionType = 'short_text' | 'long_text' | 'single_choice' | 'multi_choice' | 'phone' | 'email'

export const LEAD_FORM_QUESTION_TYPE_LABEL: Record<LeadFormQuestionType, string> = {
  short_text: 'Texto curto',
  long_text: 'Texto longo',
  single_choice: 'Escolha única',
  multi_choice: 'Múltipla escolha',
  phone: 'Telefone / WhatsApp',
  email: 'E-mail',
}

/** Marca uma pergunta como um dos campos fixos do Lead — a resposta alimenta
 *  Lead.contactName/whatsapp/email/companyName diretamente (em vez de só
 *  ficar em `formAnswers`), pra reaproveitar o pipeline/Kanban que já existe.
 *  `null` = pergunta livre, guardada só em formAnswers. */
export type LeadFormFieldRole = 'name' | 'whatsapp' | 'email' | 'company' | null

export interface LeadFormQuestionOption {
  id: string
  label: string
}

/** Exibe a pergunta só quando a resposta da pergunta `questionId` (anterior
 *  na lista) for uma das `values` — ids de opção pra perguntas de
 *  escolha, texto exato (lowercase, trim) pra perguntas de texto. */
export interface LeadFormCondition {
  questionId: string
  values: string[]
}

export interface LeadFormQuestion {
  id: string
  type: LeadFormQuestionType
  label: string
  required: boolean
  role: LeadFormFieldRole
  /** Só usado por single_choice/multi_choice. */
  options?: LeadFormQuestionOption[]
  condition?: LeadFormCondition | null
}

/** Um formulário de captura de leads (link público em /captura/:id — o id
 *  do documento é o próprio identificador da URL, sem precisar de query por
 *  slug). Criado e editado só por usuários internos; a página pública só
 *  consegue `get` um doc específico com `active == true` (ver
 *  firestore.rules) — nunca listar todos. */
export interface LeadForm extends BaseDoc {
  name: string
  active: boolean
  questions: LeadFormQuestion[]
  thankYouMessage: string
}

export type LeadFormInput = Omit<LeadForm, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>

/** Resposta de uma pergunta, guardada no Lead criado a partir do formulário
 *  (ver Lead.formAnswers em types/lead.ts) — inclui o texto da pergunta no
 *  momento do envio, já que o formulário pode mudar depois. */
export interface LeadFormAnswer {
  questionId: string
  label: string
  value: string
}

import type { Timestamp } from 'firebase/firestore'
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

/** Aparência da página pública — aba "Design" do construtor. Tudo opcional:
 *  sem nada preenchido a página usa o visual padrão (mesmo de hoje).
 *  `subtitle` dobra como o parágrafo de descrição da tela de boas-vindas
 *  (a primeira tela, antes da primeira pergunta — estilo Typeform/YayForms). */
export interface LeadFormDesign {
  bannerUrl?: string | null
  logoUrl?: string | null
  title?: string
  subtitle?: string
  primaryColor?: string
  backgroundColor?: string
  /** Texto do botão da tela de boas-vindas. Default: "Começar". */
  welcomeButtonLabel?: string
}

/** Uma "tela de resultado" mostrada depois do envio — ex: "Lead qualificado"
 *  vs "Padrão". `matchValues` são ids de opção da pergunta de qualificação
 *  (`LeadForm.qualificationQuestionId`) que levam a essa tela; a entrada com
 *  `isDefault: true` é o fallback — usada sempre que a resposta do lead não
 *  bate com nenhuma outra tela configurada (por isso toda pergunta de
 *  qualificação sempre tem uma tela padrão: sem ela, uma resposta
 *  "estranha" ficaria sem nenhuma tela pra cair). `design` sobrescreve, só
 *  pra essa tela, os campos equivalentes de `LeadForm.design` — quando não
 *  preenchido aqui, usa o valor do formulário. `redirectUrl`, se
 *  preenchido, manda o navegador pra essa URL em vez de mostrar `message`. */
export interface LeadFormOutcome {
  id: string
  label: string
  message: string
  matchValues: string[]
  isDefault?: boolean
  design?: LeadFormDesign
  redirectUrl?: string
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
  /** Mensagem padrão de agradecimento — usada quando `outcomes` está vazio
   *  (formulários antigos, ou quem não configurou telas de resultado). */
  thankYouMessage: string
  design?: LeadFormDesign
  /** Telas de resultado configuráveis (opcional — ver LeadFormOutcome). Vazio
   *  = comportamento simples de sempre (só `thankYouMessage`). */
  outcomes?: LeadFormOutcome[]
  /** Qual pergunta de escolha única decide a tela de resultado. */
  qualificationQuestionId?: string | null
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

/** Evento de analytics da página pública — cada visitante gera um
 *  `sessionId` novo (aleatório, só em memória) ao carregar a página; todo
 *  evento durante aquela visita carrega o mesmo id, o que permite calcular
 *  o funil (quantas sessões chegaram em cada pergunta) sem guardar nenhum
 *  dado pessoal do visitante. Gravado anonimamente (ver firestore.rules),
 *  só leitura por usuário interno — vira as métricas da aba "Métricas" de
 *  cada formulário (visualizações, início, respostas, taxa de conclusão,
 *  tempo médio e desistência por pergunta). */
export type LeadFormEventType = 'view' | 'start' | 'question_view' | 'submit'

export interface LeadFormEvent {
  id: string
  formId: string
  sessionId: string
  type: LeadFormEventType
  /** Só em 'question_view' — qual pergunta e em que posição (0-based). */
  questionId?: string
  stepIndex?: number
  /** Só em 'submit' — tempo entre sair da tela de boas-vindas e enviar,
   *  medido no navegador do visitante (evita depender de dois
   *  serverTimestamp() em documentos diferentes pra calcular a diferença). */
  durationMs?: number
  createdAt: Timestamp
}

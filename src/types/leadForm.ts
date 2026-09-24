import type { Timestamp } from 'firebase/firestore'
import type { BaseDoc } from './common'

export type LeadFormQuestionType = 'short_text' | 'long_text' | 'single_choice' | 'multi_choice' | 'phone' | 'email' | 'address' | 'fields'

export const LEAD_FORM_QUESTION_TYPE_LABEL: Record<LeadFormQuestionType, string> = {
  short_text: 'Texto curto',
  long_text: 'Texto longo',
  single_choice: 'Escolha única',
  multi_choice: 'Múltipla escolha',
  phone: 'Telefone / WhatsApp',
  email: 'E-mail',
  address: 'Endereço',
  fields: 'Vários campos',
}

export type LeadFormSubfieldType = 'text' | 'number' | 'time' | 'date' | 'phone' | 'email' | 'cep'

/** Um campo dentro de uma pergunta de "vários campos" (ex: "Abre às",
 *  "Fecha às" num horário de funcionamento). `fill` = esse campo é
 *  preenchido sozinho quando a pessoa digita um CEP num campo do tipo CEP. */
export interface LeadFormSubfield {
  id: string
  label: string
  type: LeadFormSubfieldType
  required?: boolean
  width?: 'full' | 'half' | 'third'
  placeholder?: string
  fill?: 'street' | 'neighborhood' | 'city' | 'state'
}

/** Partes de uma resposta do tipo Endereço, nessa ordem — a resposta é
 *  guardada como string[] com uma posição por parte. */
export const ADDRESS_PARTS = ['cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state'] as const
export type AddressPart = (typeof ADDRESS_PARTS)[number]

export const ADDRESS_PART_LABEL: Record<AddressPart, string> = {
  cep: 'CEP',
  street: 'Rua',
  number: 'Número',
  complement: 'Complemento',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'Estado',
}

/** Partes obrigatórias quando a pergunta de endereço é obrigatória. */
export const ADDRESS_REQUIRED_PARTS: AddressPart[] = ['cep', 'street', 'number', 'neighborhood', 'city']

/** "Rua X, 123 (apto 4) - Bairro, Cidade/UF - CEP 00000-000" — como o
 *  endereço aparece na ficha do lead. */
export function formatAddressAnswer(parts: string[]): string {
  const get = (p: AddressPart) => (parts[ADDRESS_PARTS.indexOf(p)] ?? '').trim()
  const line1 = [get('street'), get('number')].filter(Boolean).join(', ') + (get('complement') ? ` (${get('complement')})` : '')
  const cityUf = [get('city'), get('state')].filter(Boolean).join('/')
  return [line1, get('neighborhood'), cityUf, get('cep') && `CEP ${get('cep')}`].filter(Boolean).join(' - ')
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

/** Id fixo da opção "Outro" — não existe em `options`, é uma opção extra que
 *  o lead vê quando `allowOther` está ligado. Pode ser usada como qualquer
 *  outro id em `condition.values` e `outcome.matchValues`. */
export const OTHER_OPTION_ID = '__other__'

export interface LeadFormQuestion {
  id: string
  type: LeadFormQuestionType
  label: string
  /** Texto de apoio abaixo da pergunta (opcional). */
  description?: string
  /** Imagem mostrada acima da pergunta (opcional). */
  imageUrl?: string | null
  required: boolean
  role: LeadFormFieldRole
  /** Só usado por single_choice/multi_choice. */
  options?: LeadFormQuestionOption[]
  /** Só usado por 'fields': os campos que a pessoa preenche nessa pergunta. */
  subfields?: LeadFormSubfield[]
  /** Só escolha: acrescenta a opção "Outro" — ao marcá-la o lead precisa
   *  escrever o que é, e esse texto vai junto na resposta pro time avaliar
   *  se ainda se enquadra. */
  allowOther?: boolean
  /** Nome da opção extra (padrão "Outro"). */
  otherLabel?: string
  /** Pergunta mostrada no campo de texto do "Outro" (padrão "Qual?"). */
  otherPrompt?: string
  condition?: LeadFormCondition | null
}

export type LeadFormAlign = 'left' | 'center' | 'right'

export type LeadFormScreenKey = 'welcome' | 'question' | 'end'

/** Conjunto de cores de uma tela. `primaryColor` = botões e destaque. */
export interface LeadFormColors {
  backgroundColor?: string
  cardColor?: string
  primaryColor?: string
  buttonTextColor?: string
  textColor?: string
}

export type LeadFormBlockType = 'heading' | 'text' | 'image' | 'video' | 'button' | 'divider' | 'spacer'

/** Um pedaço do conteúdo de uma tela final — a tela é uma pilha de blocos,
 *  no estilo de uma página de checkout/Canva. Só os campos que fazem sentido
 *  pro `type` são usados: heading/text usam `text` (com quebras de linha),
 *  image usa `url` + `width`, video usa `url` (YouTube), button usa
 *  `label` + `url`, spacer usa `size`. */
export interface LeadFormBlock {
  id: string
  type: LeadFormBlockType
  text?: string
  url?: string | null
  label?: string
  align?: LeadFormAlign
  size?: 'sm' | 'md' | 'lg' | 'xl'
  bold?: boolean
  color?: 'default' | 'muted' | 'primary'
  width?: 'sm' | 'md' | 'full'
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
  /** Alinhamento dos textos da tela de início e das perguntas. Default: esquerda. */
  textAlign?: LeadFormAlign
  /** 'full' (padrão) = o formulário ocupa a tela inteira, sem quadrado;
   *  'card' = conteúdo dentro de um cartão no meio da página. */
  layout?: 'full' | 'card'
  /** Fundo do cartão onde fica o conteúdo (só no layout 'card'). Default: branco. */
  cardColor?: string
  /** Cor do texto dos botões. Default: branco. */
  buttonTextColor?: string
  /** Cor dos textos (títulos, perguntas, mensagens). Default: cinza-escuro. */
  textColor?: string
  /** Cores só de uma etapa (início / perguntas / final) — o que ficar em
   *  branco usa a cor geral acima. */
  screenColors?: Partial<Record<LeadFormScreenKey, LeadFormColors>>
  /** Link do YouTube exibido na tela de início (VSL). */
  welcomeVideoUrl?: string
  /** Link do YouTube exibido na tela final — sobrescrevível por tela de
   *  resultado (ex: um vídeo diferente pra quem se qualificou). */
  resultVideoUrl?: string
  /** Título da tela final (ex: "Tudo certo!"). Separado de `title`, que é o
   *  da tela de início — a final não repete o título de abertura. */
  resultTitle?: string
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
/** "A resposta da pergunta `questionId` é uma destas `values`" (ids de opção,
 *  incluindo o "Outro"). */
export interface LeadFormOutcomeRule {
  questionId: string
  values: string[]
}

export interface LeadFormOutcome {
  id: string
  label: string
  message: string
  /** @deprecated formulários antigos: ids de opção da `qualificationQuestionId`.
   *  Use `rules` (o construtor converte ao abrir o formulário). */
  matchValues: string[]
  /** Quando essa tela aparece: cada regra olha a resposta de UMA pergunta de
   *  escolha. Sem regras (e sem `isDefault`) a tela nunca aparece. */
  rules?: LeadFormOutcomeRule[]
  /** true = só aparece se TODAS as regras baterem; padrão = qualquer uma. */
  matchAll?: boolean
  isDefault?: boolean
  design?: LeadFormDesign
  redirectUrl?: string
  /** Segundos até redirecionar. Sem valor (ou 0) = redireciona na hora, sem
   *  mostrar o conteúdo (comportamento antigo); com valor > 0 mostra o
   *  conteúdo e redireciona depois desse tempo. */
  redirectDelay?: number
  /** Conteúdo da tela (título, texto, imagem, vídeo, botão…). Sem valor =
   *  formulário antigo: o conteúdo é montado a partir de `message` + título
   *  + vídeo (ver effectiveEndBlocks). */
  blocks?: LeadFormBlock[]
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
  /** Conteúdo da tela final única (quando não há `outcomes`). */
  endBlocks?: LeadFormBlock[]
  /** Id do Meta Pixel carregado na página pública (PageView ao abrir, Lead ao enviar). */
  metaPixelId?: string | null
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

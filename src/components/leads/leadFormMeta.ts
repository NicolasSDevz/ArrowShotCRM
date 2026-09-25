import { Type, AlignLeft, CircleDot, ListChecks, Phone, Mail, MapPin, LayoutList, IdCard, ListPlus, Paperclip, Link2, SquareCheck, type LucideIcon } from 'lucide-react'
import type { LeadFormFieldRole, LeadFormQuestion, LeadFormQuestionOption, LeadFormQuestionType } from '../../types/leadForm'
import { OTHER_OPTION_ID } from '../../types/leadForm'
import { FIELD_GROUP_PRESETS } from './leadFormFieldGroups'

export const QUESTION_TYPE_META: Record<LeadFormQuestionType, { icon: LucideIcon; label: string; hint: string }> = {
  short_text: { icon: Type, label: 'Texto curto', hint: 'Resposta de uma linha' },
  long_text: { icon: AlignLeft, label: 'Texto longo', hint: 'Resposta em parágrafo' },
  single_choice: { icon: CircleDot, label: 'Escolha única', hint: 'O lead marca uma opção' },
  multi_choice: { icon: ListChecks, label: 'Múltipla escolha', hint: 'O lead marca várias' },
  phone: { icon: Phone, label: 'Telefone / WhatsApp', hint: 'Campo de telefone' },
  email: { icon: Mail, label: 'E-mail', hint: 'Campo de e-mail' },
  address: { icon: MapPin, label: 'Endereço', hint: 'CEP, rua, número, bairro e cidade (o CEP preenche o resto)' },
  fields: { icon: LayoutList, label: 'Vários campos', hint: 'Você monta os campos (endereço, horário, dados da empresa…)' },
  document: { icon: IdCard, label: 'CPF / CNPJ', hint: 'Aceita CNPJ ou CPF (pra quem ainda não tem empresa aberta), já com a máscara' },
  list: { icon: ListPlus, label: 'Lista', hint: 'O lead escreve um item e toca em "+ Adicionar outro" (ex: os serviços que oferece)' },
  file: { icon: Paperclip, label: 'Arquivo', hint: 'O lead envia arquivos (ex: a logo da empresa) — ficam na ficha do lead pra baixar' },
  link: { icon: Link2, label: 'Link', hint: 'Um endereço de site (Instagram, site, Google Drive…)' },
  confirm: { icon: SquareCheck, label: 'Confirmação', hint: 'Uma caixinha pro lead marcar (ex: "Já enviei as fotos")' },
}

/** Tipos cuja resposta não cabe em nenhum campo fixo do lead (nome, WhatsApp…). */
export const NO_ROLE_TYPES = new Set<LeadFormQuestionType>(['single_choice', 'multi_choice', 'address', 'fields', 'document', 'list', 'file', 'link', 'confirm'])

export const ROLE_LABEL: Record<NonNullable<LeadFormFieldRole>, string> = {
  name: 'Nome do lead',
  whatsapp: 'WhatsApp do lead',
  email: 'E-mail do lead',
  company: 'Empresa do lead',
}

/** Atalhos "Campos do lead" — já vêm com o papel marcado (a resposta preenche
 *  o cadastro do lead direto). */
export const LEAD_FIELD_PRESETS: { role: NonNullable<LeadFormFieldRole>; type: LeadFormQuestionType; label: string; required: boolean }[] = [
  { role: 'name', type: 'short_text', label: 'Qual é o seu nome?', required: true },
  { role: 'whatsapp', type: 'phone', label: 'Qual é o seu WhatsApp?', required: true },
  { role: 'email', type: 'email', label: 'Qual é o seu e-mail?', required: false },
  { role: 'company', type: 'short_text', label: 'Qual é o nome da sua empresa?', required: false },
]

export const isChoiceType = (type: LeadFormQuestionType) => type === 'single_choice' || type === 'multi_choice'

export function newQuestion(type: LeadFormQuestionType, extra: Partial<LeadFormQuestion> = {}): LeadFormQuestion {
  return {
    id: crypto.randomUUID(),
    type,
    label: '',
    required: true,
    role: null,
    options: isChoiceType(type) ? [{ id: crypto.randomUUID(), label: '' }, { id: crypto.randomUUID(), label: '' }] : undefined,
    subfields: type === 'fields' ? FIELD_GROUP_PRESETS.find((p) => p.key === 'custom')!.make() : undefined,
    condition: null,
    ...(type === 'confirm' ? { confirmLabel: 'Confirmo' } : {}),
    ...extra,
  }
}

/** Opções que o lead realmente vê numa pergunta de escolha (as preenchidas +
 *  o "Outro", se ligado) — é a lista usada por lógica condicional e telas
 *  finais. */
export function visibleOptions(q: LeadFormQuestion): LeadFormQuestionOption[] {
  return orderedOptions({ ...q, options: (q.options ?? []).filter((o) => o.label.trim()) })
}

/** Todas as opções na ordem em que o lead vê, com o "Outro" (se ligado) na
 *  posição escolhida — `otherIndex` conta a partir do topo; sem valor fica
 *  por último. Inclui opções ainda sem texto (o editor precisa delas). */
export function orderedOptions(q: LeadFormQuestion): LeadFormQuestionOption[] {
  const opts = q.options ?? []
  if (!q.allowOther) return opts
  const other: LeadFormQuestionOption = { id: OTHER_OPTION_ID, label: q.otherLabel?.trim() || 'Outro', message: q.otherMessage }
  const at = Math.min(Math.max(q.otherIndex ?? opts.length, 0), opts.length)
  return [...opts.slice(0, at), other, ...opts.slice(at)]
}

/** Inverso de orderedOptions: a lista reordenada (com o "Outro" no meio)
 *  volta a ser `options` + `otherIndex`. */
export function fromOrderedOptions(list: LeadFormQuestionOption[]): Pick<LeadFormQuestion, 'options' | 'otherIndex'> {
  const at = list.findIndex((o) => o.id === OTHER_OPTION_ID)
  const options = list.filter((o) => o.id !== OTHER_OPTION_ID)
  return { options, otherIndex: at === -1 || at >= options.length ? undefined : at }
}

/** Motivo pelo qual a condição de uma pergunta não vai funcionar (ou null se
 *  está ok) — usado tanto pra avisar no editor quanto pra bloquear o salvar. */
export function conditionProblem(q: LeadFormQuestion, index: number, questions: LeadFormQuestion[]): string | null {
  if (!q.condition) return null
  const sourceIndex = questions.findIndex((s) => s.id === q.condition!.questionId)
  if (sourceIndex === -1) return 'A pergunta usada na lógica não existe mais.'
  if (sourceIndex >= index) return 'A pergunta usada na lógica agora vem depois desta — o lead ainda não respondeu quando chegar aqui.'
  if (q.condition.values.length === 0) return 'Escolha pelo menos uma resposta — senão essa pergunta nunca aparece.'
  const live = new Set(visibleOptions(questions[sourceIndex]).map((o) => o.id))
  if (!q.condition.values.some((v) => live.has(v))) return 'As respostas escolhidas na lógica foram apagadas — escolha de novo, senão essa pergunta nunca aparece.'
  return null
}

import { Type, AlignLeft, CircleDot, ListChecks, Phone, Mail, type LucideIcon } from 'lucide-react'
import type { LeadFormFieldRole, LeadFormQuestion, LeadFormQuestionType } from '../../types/leadForm'
import { OTHER_OPTION_ID } from '../../types/leadForm'

export const QUESTION_TYPE_META: Record<LeadFormQuestionType, { icon: LucideIcon; label: string; hint: string }> = {
  short_text: { icon: Type, label: 'Texto curto', hint: 'Resposta de uma linha' },
  long_text: { icon: AlignLeft, label: 'Texto longo', hint: 'Resposta em parágrafo' },
  single_choice: { icon: CircleDot, label: 'Escolha única', hint: 'O lead marca uma opção' },
  multi_choice: { icon: ListChecks, label: 'Múltipla escolha', hint: 'O lead marca várias' },
  phone: { icon: Phone, label: 'Telefone / WhatsApp', hint: 'Campo de telefone' },
  email: { icon: Mail, label: 'E-mail', hint: 'Campo de e-mail' },
}

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
    condition: null,
    ...extra,
  }
}

/** Opções que o lead realmente vê numa pergunta de escolha (as preenchidas +
 *  o "Outro", se ligado) — é a lista usada por lógica condicional e telas
 *  finais. */
export function visibleOptions(q: LeadFormQuestion): { id: string; label: string }[] {
  return [
    ...(q.options ?? []).filter((o) => o.label.trim()),
    ...(q.allowOther ? [{ id: OTHER_OPTION_ID, label: q.otherLabel?.trim() || 'Outro' }] : []),
  ]
}

/** Motivo pelo qual a condição de uma pergunta não vai funcionar (ou null se
 *  está ok) — usado tanto pra avisar no editor quanto pra bloquear o salvar. */
export function conditionProblem(q: LeadFormQuestion, index: number, questions: LeadFormQuestion[]): string | null {
  if (!q.condition) return null
  const sourceIndex = questions.findIndex((s) => s.id === q.condition!.questionId)
  if (sourceIndex === -1) return 'A pergunta usada na lógica não existe mais.'
  if (sourceIndex >= index) return 'A pergunta usada na lógica agora vem depois desta — o lead ainda não respondeu quando chegar aqui.'
  if (q.condition.values.length === 0) return 'Escolha pelo menos uma resposta — senão essa pergunta nunca aparece.'
  return null
}

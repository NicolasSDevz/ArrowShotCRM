import type { LeadForm, LeadFormDesign, LeadFormOutcome, LeadFormQuestion } from '../../types/leadForm'

export type LeadFormAnswers = Record<string, string | string[]>

/** Só o conteúdo que o renderer realmente lê — deixa o preview ao vivo do
 *  construtor montar o objeto sem precisar inventar id/createdAt/etc de um
 *  formulário que ainda nem foi salvo. */
export type LeadFormContent = Pick<LeadForm, 'name' | 'questions' | 'thankYouMessage' | 'design' | 'outcomes' | 'qualificationQuestionId'>

/** Qual tela o preview do construtor deve mostrar (segue o item selecionado
 *  na lista de telas, em vez de rodar o fluxo de verdade). */
export type LeadFormPreviewScreen =
  | { kind: 'welcome' }
  | { kind: 'question'; questionId: string }
  | { kind: 'end'; outcomeId?: string | null }

/** Item selecionado na lista de telas do construtor — decide qual painel de
 *  edição aparece e qual tela o preview mostra. `end` com `id: null` é a tela
 *  final única (sem qualificação). */
export type BuilderSelection =
  | { kind: 'welcome' }
  | { kind: 'question'; id: string }
  | { kind: 'end'; id: string | null }
  | { kind: 'theme' }

/** Junta o design da tela por cima do design base, ignorando campos vazios —
 *  um título/vídeo deixado em branco numa tela de resultado herda o do
 *  formulário em vez de apagá-lo. */
export function mergeDesign(base?: LeadFormDesign, override?: LeadFormDesign): LeadFormDesign {
  const out: Record<string, unknown> = { ...(base ?? {}) }
  for (const [key, value] of Object.entries(override ?? {})) {
    if (value === undefined || value === null || value === '') continue
    out[key] = value
  }
  return out as LeadFormDesign
}

/** A pergunta aparece só se a resposta da pergunta-fonte bater com a condição
 *  (ids de opção, incluindo o "Outro"). Sem condição = sempre visível. */
export function isQuestionVisible(q: LeadFormQuestion, answers: LeadFormAnswers): boolean {
  if (!q.condition) return true
  const sourceAnswer = answers[q.condition.questionId]
  if (sourceAnswer === undefined) return false
  const values = Array.isArray(sourceAnswer) ? sourceAnswer : [sourceAnswer]
  return values.some((v) => q.condition!.values.includes(v))
}

/** Escolhe a tela final pela resposta da pergunta de qualificação; a tela
 *  "Padrão" é o fallback. null = formulário sem telas configuradas (usa
 *  `thankYouMessage`). */
export function resolveOutcome(
  form: Pick<LeadForm, 'outcomes' | 'qualificationQuestionId'>,
  answers: LeadFormAnswers
): LeadFormOutcome | null {
  const outcomes = form.outcomes ?? []
  if (outcomes.length === 0) return null
  const raw = form.qualificationQuestionId ? answers[form.qualificationQuestionId] : undefined
  const values = Array.isArray(raw) ? raw : raw ? [raw] : []
  const matched = outcomes.find((o) => !o.isDefault && o.matchValues.some((v) => values.includes(v)))
  return matched ?? outcomes.find((o) => o.isDefault) ?? outcomes[0]
}

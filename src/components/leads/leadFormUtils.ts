import type { LeadFormColors, LeadFormScreenKey } from '../../types/leadForm'
import type { LeadForm, LeadFormBlock, LeadFormDesign, LeadFormOutcome, LeadFormOutcomeRule, LeadFormQuestion } from '../../types/leadForm'

export type LeadFormAnswers = Record<string, string | string[]>

/** Só o conteúdo que o renderer realmente lê — deixa o preview ao vivo do
 *  construtor montar o objeto sem precisar inventar id/createdAt/etc de um
 *  formulário que ainda nem foi salvo. */
export type LeadFormContent = Pick<LeadForm, 'name' | 'questions' | 'thankYouMessage' | 'design' | 'outcomes' | 'qualificationQuestionId' | 'endBlocks'>

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
  | { kind: 'tracking' }
  | { kind: 'routing' }

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

/** Perguntas que o lead realmente vê, em ordem. Em cadeia: se a pergunta-fonte
 *  de uma condição ficou escondida, a resposta antiga dela (de antes de o lead
 *  voltar e mudar de ideia) não conta — a dependente também some. */
export function visibleQuestionsOf(questions: LeadFormQuestion[], answers: LeadFormAnswers): LeadFormQuestion[] {
  const shown = new Set<string>()
  return questions.filter((q) => {
    const ok = !q.condition || (shown.has(q.condition.questionId) && isQuestionVisible(q, answers))
    if (ok) shown.add(q.id)
    return ok
  })
}

/** Regras de uma tela final. Telas antigas guardavam só `matchValues` da
 *  pergunta de qualificação do formulário — viram uma regra equivalente. */
export function outcomeRules(form: Pick<LeadForm, 'qualificationQuestionId'>, outcome: LeadFormOutcome): LeadFormOutcomeRule[] {
  if (outcome.rules) return outcome.rules
  if (form.qualificationQuestionId && outcome.matchValues.length > 0) {
    return [{ questionId: form.qualificationQuestionId, values: outcome.matchValues }]
  }
  return []
}

function ruleMatches(rule: LeadFormOutcomeRule, answers: LeadFormAnswers): boolean {
  const raw = answers[rule.questionId]
  const values = Array.isArray(raw) ? raw : raw ? [raw] : []
  return values.some((v) => rule.values.includes(v))
}

/** Escolhe a tela final pelas respostas do lead: vale a PRIMEIRA tela (na
 *  ordem da lista = prioridade) cujas regras batem — "qualquer uma" por
 *  padrão, "todas" se `matchAll`. A tela padrão também pode receber
 *  respostas (entra na prioridade pela posição dela). Se nenhuma bater, cai
 *  na tela padrão. null = formulário sem telas configuradas. */
export function resolveOutcome(
  form: Pick<LeadForm, 'outcomes' | 'qualificationQuestionId'>,
  answers: LeadFormAnswers
): LeadFormOutcome | null {
  const outcomes = form.outcomes ?? []
  if (outcomes.length === 0) return null
  const matched = outcomes.find((o) => {
    const rules = outcomeRules(form, o)
    if (rules.length === 0) return false
    return o.matchAll ? rules.every((r) => ruleMatches(r, answers)) : rules.some((r) => ruleMatches(r, answers))
  })
  return matched ?? outcomes.find((o) => o.isDefault) ?? outcomes[0]
}

/** Tela final pra onde uma resposta (opção de uma pergunta) leva, ou null
 *  se essa resposta não decide nada. */
export function destinationOf(outcomes: LeadFormOutcome[], questionId: string, optionId: string): string | null {
  const o = outcomes.find((x) => (x.rules ?? []).some((r) => r.questionId === questionId && r.values.includes(optionId)))
  return o?.id ?? null
}

/** Faz uma resposta levar pra uma tela (ou pra nenhuma, com null): tira a
 *  opção de qualquer outra tela antes — cada resposta tem um destino só. */
export function setDestination(outcomes: LeadFormOutcome[], questionId: string, optionId: string, outcomeId: string | null): LeadFormOutcome[] {
  return outcomes.map((o) => {
    let rules = (o.rules ?? [])
      .map((r) => (r.questionId === questionId ? { ...r, values: r.values.filter((v) => v !== optionId) } : r))
      .filter((r) => r.values.length > 0)
    if (o.id === outcomeId) {
      const existing = rules.find((r) => r.questionId === questionId)
      rules = existing
        ? rules.map((r) => (r === existing ? { ...r, values: [...r.values, optionId] } : r))
        : [...rules, { questionId, values: [optionId] }]
    }
    return { ...o, rules, matchValues: [] }
  })
}

/** Só aceita http(s), mailto e tel (nada de `javascript:`) e completa o
 *  https:// quando o admin colou só "wa.me/55…". null = link inutilizável. */
export function normalizeUrl(input?: string | null): string | null {
  const raw = input?.trim()
  if (!raw) return null
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null
  return `https://${raw}`
}

/** Conteúdo de uma tela final como blocos. Telas já editadas no construtor
 *  têm `blocks`/`endBlocks`; as antigas (só mensagem + título + vídeo) são
 *  convertidas na hora, então nenhum formulário existente muda de aparência. */
export function effectiveEndBlocks(
  form: Pick<LeadForm, 'thankYouMessage' | 'design' | 'endBlocks'>,
  outcome: LeadFormOutcome | null
): LeadFormBlock[] {
  const explicit = outcome ? outcome.blocks : form.endBlocks
  if (explicit) return explicit
  const design = outcome ? mergeDesign(form.design, outcome.design) : (form.design ?? {})
  const title = design.resultTitle || outcome?.design?.title
  const message = (outcome ? outcome.message : '') || form.thankYouMessage
  const blocks: LeadFormBlock[] = []
  if (title) blocks.push({ id: 'legacy-title', type: 'heading', text: title, align: 'center', size: 'lg' })
  if (message) blocks.push({ id: 'legacy-message', type: 'text', text: message, align: 'center', size: 'md' })
  if (design.resultVideoUrl) blocks.push({ id: 'legacy-video', type: 'video', url: design.resultVideoUrl })
  return blocks
}

/** Cores efetivas de uma tela: geral do formulário → cores daquela etapa
 *  (início/perguntas/final) → cores da tela final específica (outcome). */
export interface LeadFormTheme {
  page: string
  card: string
  primary: string
  buttonText: string
  /** undefined = usa os cinzas padrão. */
  text?: string
}

export function resolveTheme(design: LeadFormDesign, screen: LeadFormScreenKey, outcomeDesign?: LeadFormDesign): LeadFormTheme {
  const layers: LeadFormColors[] = [design, design.screenColors?.[screen] ?? {}, outcomeDesign ?? {}]
  const pick = (k: keyof LeadFormColors) => layers.reduce<string | undefined>((acc, l) => l[k] || acc, undefined)
  return {
    page: pick('backgroundColor') || '#F8FAFC',
    card: pick('cardColor') || '#FFFFFF',
    primary: pick('primaryColor') || '#2563EB',
    buttonText: pick('buttonTextColor') || '#FFFFFF',
    text: pick('textColor'),
  }
}

import { useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import { Spinner } from '../ui/FullPageSpinner'
import type { LeadForm, LeadFormQuestion } from '../../types/leadForm'

type Phase = 'form' | 'submitting' | 'done'

/** Só o conteúdo que o renderer realmente lê — deixa o preview ao vivo do
 *  construtor montar o objeto sem precisar inventar id/createdAt/etc de um
 *  formulário que ainda nem foi salvo. */
export type LeadFormContent = Pick<LeadForm, 'name' | 'questions' | 'thankYouMessage' | 'design' | 'outcomes' | 'qualificationQuestionId'>

/** Renderiza a página de um formulário de captura — título/banner/logo do
 *  Design, perguntas com visibilidade condicional, validação de obrigatórias
 *  e a tela de resultado (thankYouMessage ou uma das `outcomes`, decidida
 *  pela resposta da pergunta de qualificação). Componente único usado tanto
 *  pela página pública real (LeadCapturePage, com `onSubmitted` gravando no
 *  Firestore) quanto pelo preview ao vivo do construtor (sem `onSubmitted`
 *  — clicar "Enviar" só resolve a tela de resultado localmente, nada é
 *  salvo) — garante que o preview nunca fique visualmente diferente do que
 *  o lead realmente vê. */
export function LeadFormRenderer({
  form,
  onSubmitted,
  fillViewport = false,
}: {
  form: LeadFormContent
  onSubmitted?: (answers: Record<string, string | string[]>) => Promise<void>
  /** true na página pública real (ocupa a tela toda via 100vh); false (padrão)
   *  no preview do construtor, onde o componente pai já define a altura. */
  fillViewport?: boolean
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [phase, setPhase] = useState<Phase>('form')

  const isVisible = (q: LeadFormQuestion): boolean => {
    if (!q.condition) return true
    const sourceAnswer = answers[q.condition.questionId]
    if (sourceAnswer === undefined) return false
    const values = Array.isArray(sourceAnswer) ? sourceAnswer : [sourceAnswer]
    return values.some((v) => q.condition!.values.includes(v))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visibleQuestions = useMemo(() => form.questions.filter(isVisible), [form.questions, answers])

  const setAnswer = (id: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [id]: value }))
    setErrors((prev) => ({ ...prev, [id]: false }))
  }

  const toggleMultiOption = (q: LeadFormQuestion, optId: string) => {
    const current = (answers[q.id] as string[] | undefined) ?? []
    setAnswer(q.id, current.includes(optId) ? current.filter((v) => v !== optId) : [...current, optId])
  }

  const resolveOutcomeMessage = (): string => {
    const outcomes = form.outcomes ?? []
    if (outcomes.length === 0 || !form.qualificationQuestionId) return form.thankYouMessage
    const raw = answers[form.qualificationQuestionId]
    const values = Array.isArray(raw) ? raw : raw ? [raw] : []
    const matched = outcomes.find((o) => !o.isDefault && o.matchValues.some((v) => values.includes(v)))
    const fallback = outcomes.find((o) => o.isDefault)
    return (matched ?? fallback)?.message || form.thankYouMessage
  }

  const handleSubmit = async () => {
    const nextErrors: Record<string, boolean> = {}
    for (const q of visibleQuestions) {
      if (!q.required) continue
      const v = answers[q.id]
      const empty = v === undefined || (Array.isArray(v) ? v.length === 0 : !v.trim())
      if (empty) nextErrors[q.id] = true
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    if (!onSubmitted) {
      // Preview do construtor — sem gravação nenhuma.
      setPhase('done')
      return
    }

    setPhase('submitting')
    try {
      const visibleIds = new Set(visibleQuestions.map((q) => q.id))
      const payload: Record<string, string | string[]> = {}
      for (const [id, value] of Object.entries(answers)) {
        if (visibleIds.has(id)) payload[id] = value
      }
      await onSubmitted(payload)
      setPhase('done')
    } catch (err) {
      console.error(err)
      setPhase('form')
    }
  }

  const design = form.design ?? {}
  const primaryColor = design.primaryColor || '#2563EB'
  const backgroundColor = design.backgroundColor || '#F8FAFC'

  return (
    <div className={`flex ${fillViewport ? 'min-h-screen' : 'min-h-full'} items-center justify-center px-4 py-10`} style={{ backgroundColor }}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {design.bannerUrl && <img src={design.bannerUrl} alt="" className="h-36 w-full object-cover" />}
        <div className="p-8">
          {design.logoUrl && (
            <img src={design.logoUrl} alt="" className="mb-4 h-14 w-14 rounded-full object-cover" />
          )}

          {phase === 'done' ? (
            <p className="text-center text-[15px] text-slate-700">{resolveOutcomeMessage()}</p>
          ) : (
            <>
              <h1 className="mb-1 text-xl font-bold text-slate-900">{design.title || form.name}</h1>
              {design.subtitle && <p className="mb-5 text-sm text-slate-500">{design.subtitle}</p>}
              {!design.subtitle && <div className="mb-5" />}

              <div className="flex flex-col gap-4">
                {visibleQuestions.map((q) => (
                  <QuestionField
                    key={q.id}
                    question={q}
                    value={answers[q.id]}
                    error={!!errors[q.id]}
                    onChange={(v) => setAnswer(q.id, v)}
                    onToggleOption={(optId) => toggleMultiOption(q, optId)}
                  />
                ))}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={phase === 'submitting'}
                  style={{ backgroundColor: primaryColor }}
                  className="mt-2 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {phase === 'submitting' ? <Spinner className="h-4 w-4 border-white/30 border-t-white" /> : <Send size={14} />}
                  Enviar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function QuestionField({
  question,
  value,
  error,
  onChange,
  onToggleOption,
}: {
  question: LeadFormQuestion
  value: string | string[] | undefined
  error: boolean
  onChange: (v: string) => void
  onToggleOption: (optionId: string) => void
}) {
  const label = (
    <span className="mb-1.5 block text-sm font-medium text-slate-700">
      {question.label}
      {question.required && <span className="text-red-400"> *</span>}
    </span>
  )
  const inputClass = `w-full rounded-lg border px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${
    error ? 'border-red-300' : 'border-slate-200'
  }`

  if (question.type === 'long_text') {
    return (
      <label className="block">
        {label}
        <textarea rows={3} className={`${inputClass} resize-none`} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
      </label>
    )
  }

  if (question.type === 'single_choice') {
    return (
      <div>
        {label}
        <div className="flex flex-col gap-2">
          {(question.options ?? []).map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" name={question.id} checked={value === opt.id} onChange={() => onChange(opt.id)} className="h-4 w-4" />
              {opt.label}
            </label>
          ))}
        </div>
        {error && <p className="mt-1 text-xs text-red-500">Escolha uma opção</p>}
      </div>
    )
  }

  if (question.type === 'multi_choice') {
    const selected = (value as string[] | undefined) ?? []
    return (
      <div>
        {label}
        <div className="flex flex-col gap-2">
          {(question.options ?? []).map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={selected.includes(opt.id)} onChange={() => onToggleOption(opt.id)} className="h-4 w-4 rounded" />
              {opt.label}
            </label>
          ))}
        </div>
        {error && <p className="mt-1 text-xs text-red-500">Escolha ao menos uma opção</p>}
      </div>
    )
  }

  const inputType = question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'text'
  return (
    <label className="block">
      {label}
      <input type={inputType} className={inputClass} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
      {error && <p className="mt-1 text-xs text-red-500">Campo obrigatório</p>}
    </label>
  )
}

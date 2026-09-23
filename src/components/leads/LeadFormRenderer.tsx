import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Send } from 'lucide-react'
import { Spinner } from '../ui/FullPageSpinner'
import { trackLeadFormEvent } from '../../services/leadFormAnalyticsService'
import type { LeadForm, LeadFormDesign, LeadFormOutcome, LeadFormQuestion } from '../../types/leadForm'

type Phase = 'welcome' | 'question' | 'submitting' | 'done'

/** Só o conteúdo que o renderer realmente lê — deixa o preview ao vivo do
 *  construtor montar o objeto sem precisar inventar id/createdAt/etc de um
 *  formulário que ainda nem foi salvo. */
export type LeadFormContent = Pick<LeadForm, 'name' | 'questions' | 'thankYouMessage' | 'design' | 'outcomes' | 'qualificationQuestionId'>

/** Renderiza a página de um formulário de captura no estilo Typeform/
 *  YayForms — uma tela de boas-vindas, depois uma pergunta por tela (com
 *  barra de progresso, voltar/avançar, avanço automático em escolha única e
 *  Enter pra avançar em campos de texto), e por fim a tela de resultado
 *  (thankYouMessage ou uma das `outcomes`). Componente único usado tanto
 *  pela página pública real (LeadCapturePage, com `formId`+`onSubmitted`
 *  gravando no Firestore e registrando analytics) quanto pelo preview ao
 *  vivo do construtor (sem `onSubmitted` — nada é salvo nem rastreado) —
 *  garante que o preview nunca fique visualmente diferente do que o lead
 *  realmente vê. */
export function LeadFormRenderer({
  form,
  formId,
  onSubmitted,
  fillViewport = false,
}: {
  form: LeadFormContent
  /** Id real do formulário (slug da URL) — só usado pra registrar
   *  analytics; ausente no preview do construtor (formulário ainda não
   *  salvo), o que já basta pra desligar o rastreamento ali. */
  formId?: string
  onSubmitted?: (answers: Record<string, string | string[]>) => Promise<void>
  /** true na página pública real (ocupa a tela toda via 100vh); false (padrão)
   *  no preview do construtor, onde o componente pai já define a altura. */
  fillViewport?: boolean
}) {
  const isTracking = !!onSubmitted && !!formId
  const [sessionId] = useState(() => crypto.randomUUID())
  const [phase, setPhase] = useState<Phase>('welcome')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const startedAtRef = useRef<number | null>(null)
  const seenQuestionsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (isTracking) trackLeadFormEvent(formId!, sessionId, 'view')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isVisible = (q: LeadFormQuestion): boolean => {
    if (!q.condition) return true
    const sourceAnswer = answers[q.condition.questionId]
    if (sourceAnswer === undefined) return false
    const values = Array.isArray(sourceAnswer) ? sourceAnswer : [sourceAnswer]
    return values.some((v) => q.condition!.values.includes(v))
  }

  const visibleQuestions = form.questions.filter(isVisible)
  const currentQuestion = phase === 'question' ? visibleQuestions[currentIndex] : undefined

  useEffect(() => {
    if (!currentQuestion || !isTracking) return
    if (seenQuestionsRef.current.has(currentQuestion.id)) return
    seenQuestionsRef.current.add(currentQuestion.id)
    trackLeadFormEvent(formId!, sessionId, 'question_view', { questionId: currentQuestion.id, stepIndex: currentIndex })
  }, [currentQuestion, currentIndex, isTracking, formId, sessionId])

  const setAnswer = (id: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [id]: value }))
    setErrors((prev) => ({ ...prev, [id]: false }))
  }

  const toggleMultiOption = (q: LeadFormQuestion, optId: string) => {
    const current = (answers[q.id] as string[] | undefined) ?? []
    setAnswer(q.id, current.includes(optId) ? current.filter((v) => v !== optId) : [...current, optId])
  }

  const resolveOutcome = (): LeadFormOutcome | null => {
    const outcomes = form.outcomes ?? []
    if (outcomes.length === 0) return null
    const values = form.qualificationQuestionId
      ? (() => {
          const raw = answers[form.qualificationQuestionId!]
          return Array.isArray(raw) ? raw : raw ? [raw] : []
        })()
      : []
    const matched = outcomes.find((o) => !o.isDefault && o.matchValues.some((v) => values.includes(v)))
    return matched ?? outcomes.find((o) => o.isDefault) ?? outcomes[0]
  }

  const handleSubmit = async () => {
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
      if (isTracking) {
        const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : undefined
        trackLeadFormEvent(formId!, sessionId, 'submit', { durationMs })
      }
      setPhase('done')
    } catch (err) {
      console.error(err)
      setPhase('question')
    }
  }

  const handleNextRef = useRef<() => void>(() => {})
  const goNext = () => {
    const q = currentQuestion
    if (q && q.required) {
      const v = answers[q.id]
      const empty = v === undefined || (Array.isArray(v) ? v.length === 0 : !v.trim())
      if (empty) {
        setErrors((prev) => ({ ...prev, [q.id]: true }))
        return
      }
    }
    if (currentIndex >= visibleQuestions.length - 1) {
      void handleSubmit()
    } else {
      setCurrentIndex((i) => i + 1)
    }
  }
  handleNextRef.current = goNext

  const goBack = () => setCurrentIndex((i) => Math.max(0, i - 1))

  const handleStart = () => {
    startedAtRef.current = Date.now()
    if (isTracking) trackLeadFormEvent(formId!, sessionId, 'start')
    setPhase('question')
    setCurrentIndex(0)
  }

  const handleAnswerChange = (q: LeadFormQuestion, v: string | string[]) => {
    setAnswer(q.id, v)
    if (q.type === 'single_choice') {
      // Avanço automático estilo Typeform — dá um respiro visual pra
      // mostrar a opção marcada antes de trocar de tela.
      setTimeout(() => handleNextRef.current(), 300)
    }
  }

  const formDesign = form.design ?? {}
  const matchedOutcome = phase === 'done' ? resolveOutcome() : null
  // A tela de resultado herda o Design do formulário e só sobrescreve o que
  // a tela em si define — assim ela não precisa repetir banner/cor se não
  // quiser mudar nada.
  const design: LeadFormDesign = phase === 'done' ? { ...formDesign, ...matchedOutcome?.design } : formDesign
  const primaryColor = design.primaryColor || '#2563EB'
  const backgroundColor = design.backgroundColor || '#F8FAFC'

  // Redireciona de verdade só na página pública real (onSubmitted definido)
  // — no preview do construtor isso só mostraria uma nota, pra não navegar
  // pra fora do construtor sem querer.
  useEffect(() => {
    if (phase === 'done' && onSubmitted && matchedOutcome?.redirectUrl) {
      window.location.href = matchedOutcome.redirectUrl
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  return (
    <div className={`flex ${fillViewport ? 'min-h-screen' : 'min-h-full'} items-center justify-center px-4 py-10`} style={{ backgroundColor }}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {(phase === 'welcome' || phase === 'done') && design.bannerUrl && (
          <img src={design.bannerUrl} alt="" className="h-36 w-full object-cover" />
        )}
        <div className="p-8">
          {(phase === 'welcome' || phase === 'done') && design.logoUrl && (
            <img src={design.logoUrl} alt="" className="mb-4 h-14 w-14 rounded-full object-cover" />
          )}

          {phase === 'welcome' && (
            <>
              <h1 className="mb-1 text-xl font-bold text-slate-900">{design.title || form.name}</h1>
              {design.subtitle && <p className="mb-5 text-sm text-slate-500">{design.subtitle}</p>}
              {!design.subtitle && <div className="mb-5" />}
              <button
                type="button"
                onClick={handleStart}
                disabled={visibleQuestions.length === 0}
                style={{ backgroundColor: primaryColor }}
                className="flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {design.welcomeButtonLabel || 'Começar'} <ArrowRight size={14} />
              </button>
            </>
          )}

          {(phase === 'question' || phase === 'submitting') && currentQuestion && (
            <div>
              <div className="mb-5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all duration-300 ease-in-out"
                  style={{ width: `${((currentIndex + 1) / Math.max(visibleQuestions.length, 1)) * 100}%`, backgroundColor: primaryColor }}
                />
              </div>
              <p className="mb-3 text-xs font-medium text-slate-400">
                {currentIndex + 1} de {visibleQuestions.length}
              </p>

              <QuestionField
                question={currentQuestion}
                value={answers[currentQuestion.id]}
                error={!!errors[currentQuestion.id]}
                onChange={(v) => handleAnswerChange(currentQuestion, v)}
                onToggleOption={(optId) => toggleMultiOption(currentQuestion, optId)}
                onEnter={goNext}
              />

              <div className="mt-5 flex items-center gap-2">
                {currentIndex > 0 && (
                  <button type="button" onClick={goBack} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
                    <ArrowLeft size={14} /> Voltar
                  </button>
                )}
                <button
                  type="button"
                  onClick={goNext}
                  disabled={phase === 'submitting'}
                  style={{ backgroundColor: primaryColor }}
                  className="ml-auto flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {phase === 'submitting' ? (
                    <Spinner className="h-4 w-4 border-white/30 border-t-white" />
                  ) : currentIndex >= visibleQuestions.length - 1 ? (
                    <Send size={14} />
                  ) : (
                    <ArrowRight size={14} />
                  )}
                  {currentIndex >= visibleQuestions.length - 1 ? 'Enviar' : 'Avançar'}
                </button>
              </div>
            </div>
          )}

          {phase === 'done' &&
            (matchedOutcome?.redirectUrl ? (
              <p className="text-center text-sm text-slate-400">
                {onSubmitted ? 'Redirecionando…' : `Preview: essa tela redirecionaria para ${matchedOutcome.redirectUrl}`}
              </p>
            ) : (
              <>
                {design.title && <h1 className="mb-1 text-center text-xl font-bold text-slate-900">{design.title}</h1>}
                <p className="text-center text-[15px] text-slate-700">{matchedOutcome?.message || form.thankYouMessage}</p>
              </>
            ))}
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
  onEnter,
}: {
  question: LeadFormQuestion
  value: string | string[] | undefined
  error: boolean
  onChange: (v: string) => void
  onToggleOption: (optionId: string) => void
  onEnter: () => void
}) {
  const label = (
    <span className="mb-1.5 block text-base font-medium text-slate-800">
      {question.label}
      {question.required && <span className="text-red-400"> *</span>}
    </span>
  )
  const inputClass = `w-full rounded-lg border px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${
    error ? 'border-red-300' : 'border-slate-200'
  }`
  const handleEnterKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onEnter()
    }
  }

  if (question.type === 'long_text') {
    return (
      <label className="block">
        {label}
        <textarea rows={4} autoFocus className={`${inputClass} resize-none`} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
      </label>
    )
  }

  if (question.type === 'single_choice') {
    return (
      <div>
        {label}
        <div className="flex flex-col gap-2">
          {(question.options ?? []).map((opt) => {
            const checked = value === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange(opt.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  checked ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${checked ? 'border-brand-500 bg-brand-500' : 'border-slate-300'}`}>
                  {checked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                {opt.label}
              </button>
            )
          })}
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
          {(question.options ?? []).map((opt) => {
            const checked = selected.includes(opt.id)
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onToggleOption(opt.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  checked ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-brand-500 bg-brand-500' : 'border-slate-300'}`}>
                  {checked && <span className="h-2 w-2 rounded-sm bg-white" />}
                </span>
                {opt.label}
              </button>
            )
          })}
        </div>
        {error && <p className="mt-1 text-xs text-red-500">Escolha ao menos uma opção</p>}
      </div>
    )
  }

  const inputType = question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'text'
  return (
    <label className="block">
      {label}
      <input autoFocus type={inputType} className={inputClass} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} onKeyDown={handleEnterKey} />
      {error && <p className="mt-1 text-xs text-red-500">Campo obrigatório</p>}
    </label>
  )
}

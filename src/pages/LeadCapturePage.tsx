import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { Send } from 'lucide-react'
import { getPublicLeadForm, submitLeadFormResponse } from '../services/leadFormService'
import type { LeadForm, LeadFormQuestion } from '../types/leadForm'
import { Spinner } from '../components/ui/FullPageSpinner'

type Phase = 'loading' | 'invalid' | 'ready' | 'submitting' | 'done'

/** Página pública de captura de leads — sem login, sem menu, sem nenhum dado
 *  do CRM: só o formulário que o admin configurou em Leads > Formulários.
 *  Pensada pra ser o link colocado direto num anúncio do Meta (rota
 *  /captura/:formId, formId é o "link" escolhido na criação do formulário).
 *  A escrita do lead é anônima e estritamente scoped em firestore.rules —
 *  quem responde nunca consegue ler outros leads nem nada do painel. */
export function LeadCapturePage() {
  const { formId } = useParams<{ formId: string }>()
  const [phase, setPhase] = useState<Phase>('loading')
  const [form, setForm] = useState<LeadForm | null>(null)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [errors, setErrors] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!formId) {
      setPhase('invalid')
      return
    }
    getPublicLeadForm(formId)
      .then((f) => {
        if (!f) {
          setPhase('invalid')
          return
        }
        setForm(f)
        setPhase('ready')
      })
      .catch(() => setPhase('invalid'))
  }, [formId])

  const isVisible = (q: LeadFormQuestion): boolean => {
    if (!q.condition) return true
    const sourceAnswer = answers[q.condition.questionId]
    if (sourceAnswer === undefined) return false
    const values = Array.isArray(sourceAnswer) ? sourceAnswer : [sourceAnswer]
    return values.some((v) => q.condition!.values.includes(v))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visibleQuestions = useMemo(() => (form ? form.questions.filter(isVisible) : []), [form, answers])

  const setAnswer = (id: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [id]: value }))
    setErrors((prev) => ({ ...prev, [id]: false }))
  }

  const toggleMultiOption = (q: LeadFormQuestion, optId: string) => {
    const current = (answers[q.id] as string[] | undefined) ?? []
    setAnswer(q.id, current.includes(optId) ? current.filter((v) => v !== optId) : [...current, optId])
  }

  const handleSubmit = async () => {
    if (!form) return
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

    setPhase('submitting')
    try {
      // Só manda respostas de perguntas visíveis — uma pergunta condicional
      // escondida não deve "vazar" uma resposta de quando esteve visível
      // antes de o usuário mudar a resposta que a escondeu.
      const visibleIds = new Set(visibleQuestions.map((q) => q.id))
      const payload: Record<string, string | string[]> = {}
      for (const [id, value] of Object.entries(answers)) {
        if (visibleIds.has(id)) payload[id] = value
      }
      await submitLeadFormResponse(form, payload)
      setPhase('done')
    } catch (err) {
      console.error(err)
      setPhase('ready')
    }
  }

  if (phase === 'loading') {
    return <FullScreenCard><Spinner className="h-6 w-6" /></FullScreenCard>
  }

  if (phase === 'invalid') {
    return (
      <FullScreenCard>
        <p className="text-center text-sm text-slate-500">Este formulário não existe ou não está mais disponível.</p>
      </FullScreenCard>
    )
  }

  if (phase === 'done') {
    return (
      <FullScreenCard>
        <p className="text-center text-[15px] text-slate-700">{form?.thankYouMessage}</p>
      </FullScreenCard>
    )
  }

  return (
    <FullScreenCard title={form?.name}>
      <div className="flex flex-col gap-4">
        {visibleQuestions.map((q) => (
          <QuestionField key={q.id} question={q} value={answers[q.id]} error={!!errors[q.id]} onChange={(v) => setAnswer(q.id, v)} onToggleOption={(optId) => toggleMultiOption(q, optId)} />
        ))}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={phase === 'submitting'}
          className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {phase === 'submitting' ? <Spinner className="h-4 w-4 border-white/30 border-t-white" /> : <Send size={14} />}
          Enviar
        </button>
      </div>
    </FullScreenCard>
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

function FullScreenCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        {title && <h1 className="mb-5 text-xl font-bold text-slate-900">{title}</h1>}
        {children}
      </div>
    </div>
  )
}

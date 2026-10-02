import { useState } from 'react'
import toast from 'react-hot-toast'
import { Send } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { submitSurveyResponse } from '../../services/teamSurveyService'
import { askConfirm } from '../../utils/confirmDialog'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Field'
import { groupBySection } from '../../utils/surveySections'
import type { SurveyQuestion, TeamSurvey } from '../../types'

function NumberChoice({
  question,
  value,
  onChange,
}: {
  question: SurveyQuestion
  value: number | undefined
  onChange: (n: number) => void
}) {
  const options = question.kind === 'nps' ? Array.from({ length: 11 }, (_, i) => i) : [1, 2, 3, 4, 5]
  const minLabel = question.kind === 'nps' ? 'Não indicaria' : question.minLabel
  const maxLabel = question.kind === 'nps' ? 'Indicaria com certeza' : question.maxLabel
  const describe = (n: number) => {
    if (n === options[0] && minLabel) return `${n}, ${minLabel}`
    if (n === options[options.length - 1] && maxLabel) return `${n}, ${maxLabel}`
    return String(n)
  }

  return (
    <fieldset id={`q-${question.id}`} className="flex flex-col gap-2">
      <legend className="mb-2 text-[15px] font-medium text-slate-800">
        {question.text} <span className="text-red-400" aria-hidden="true">*</span>
        <span className="sr-only"> (obrigatória)</span>
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((n) => (
          <label key={n} className="cursor-pointer">
            <input
              type="radio"
              name={`q-${question.id}`}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              aria-label={describe(n)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="flex h-10 min-w-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-600 transition-colors hover:border-brand-300 peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300"
            >
              {n}
            </span>
          </label>
        ))}
      </div>
      {(minLabel || maxLabel) && (
        <div className="flex justify-between gap-4 text-xs text-slate-400" aria-hidden="true">
          <span>
            {options[0]} = {minLabel}
          </span>
          <span className="text-right">
            {options[options.length - 1]} = {maxLabel}
          </span>
        </div>
      )}
    </fieldset>
  )
}

/** Formulário de resposta. Nada aqui guarda quem respondeu — ver submitSurveyResponse. */
export function SurveyForm({ survey, onDone }: { survey: TeamSurvey; onDone: () => void }) {
  const { profile } = useAuth()
  const [answers, setAnswers] = useState<Record<string, number | string>>({})
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  const set = (id: string, v: number | string) => setAnswers((prev) => ({ ...prev, [id]: v }))

  const submit = async () => {
    if (!profile) return
    const missing = survey.questions.filter((q) => q.kind !== 'text' && typeof answers[q.id] !== 'number')
    if (missing.length > 0) {
      const msg = `Falta responder ${missing.length === 1 ? '1 pergunta' : `${missing.length} perguntas`} de nota.`
      setStatus(msg)
      toast.error(msg)
      document.querySelector<HTMLInputElement>(`#q-${missing[0].id} input`)?.focus()
      return
    }
    const ok = await askConfirm({
      title: 'Enviar avaliação?',
      message: 'Sua resposta é anônima e não pode ser alterada depois de enviada.',
      confirmLabel: 'Enviar',
    })
    if (!ok) return

    // Texto em branco não vai junto.
    const clean: Record<string, number | string> = {}
    for (const [k, v] of Object.entries(answers)) {
      if (typeof v === 'string') {
        if (v.trim()) clean[k] = v.trim()
      } else clean[k] = v
    }

    setSaving(true)
    try {
      await submitSurveyResponse(survey.id, profile.id, clean)
      toast.success('Avaliação enviada. Obrigado!')
      onDone()
    } catch (err) {
      console.error(err)
      toast.error('Não foi possível enviar. Talvez a avaliação tenha sido encerrada ou você já tenha respondido.')
      setSaving(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {groupBySection(survey.questions).map((g) => (
        <section key={g.section} className="flex flex-col gap-5">
          <h3 className="border-b border-slate-100 pb-1.5 text-sm font-bold uppercase tracking-wide text-brand-600">{g.section}</h3>
          {g.questions.map((q) =>
            q.kind === 'text' ? (
              <label key={q.id} className="flex flex-col gap-2">
                <span className="text-[15px] font-medium text-slate-800">
                  {q.text} <span className="text-xs font-normal text-slate-400">(opcional)</span>
                </span>
                <Textarea
                  rows={3}
                  maxLength={2000}
                  value={(answers[q.id] as string) ?? ''}
                  onChange={(e) => set(q.id, e.target.value)}
                  placeholder="Escreva com sinceridade, ninguém vai saber que foi você."
                />
              </label>
            ) : (
              <NumberChoice key={q.id} question={q} value={answers[q.id] as number | undefined} onChange={(n) => set(q.id, n)} />
            )
          )}
        </section>
      ))}

      <p role="status" aria-live="polite" className="text-sm text-red-500">
        {status}
      </p>
      <div className="flex justify-end">
        <Button type="submit" loading={saving} icon={<Send size={14} />}>
          Enviar avaliação anônima
        </Button>
      </div>
    </form>
  )
}

import { useState } from 'react'
import { Check, X, RotateCcw } from 'lucide-react'
import type { QuizQuestion } from '../../types'
import { QUIZ_PASS_THRESHOLD } from '../../types'
import { Button } from '../ui/Button'

export function QuizBlock({
  quiz,
  onSubmit,
}: {
  quiz: QuizQuestion[]
  onSubmit: (score: number) => void
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [submittedScore, setSubmittedScore] = useState<number | null>(null)

  if (quiz.length === 0) return null

  const allAnswered = quiz.every((q) => answers[q.id] !== undefined)
  const submitted = submittedScore !== null
  const passed = submittedScore !== null && submittedScore >= QUIZ_PASS_THRESHOLD

  const handleSubmit = () => {
    if (!allAnswered) return
    const score = Math.round(
      (quiz.filter((q) => answers[q.id] === q.correctIndex).length / quiz.length) * 100
    )
    setSubmittedScore(score)
    onSubmit(score)
  }

  const handleRetry = () => {
    setAnswers({})
    setSubmittedScore(null)
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">
          Quiz <span className="font-normal text-slate-400">· mínimo {QUIZ_PASS_THRESHOLD}% para concluir</span>
        </p>
        {submitted && (
          <span className={`text-xs font-medium ${passed ? 'text-emerald-600' : 'text-red-500'}`}>
            Nota: {submittedScore}%
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {quiz.map((q, qi) => (
          <div key={q.id}>
            <p className="mb-1.5 text-sm text-slate-700">
              {qi + 1}. {q.question}
            </p>
            <div className="flex flex-col gap-1">
              {q.options.map((opt, oi) => {
                const selected = answers[q.id] === oi
                const isCorrect = oi === q.correctIndex
                let style = 'border-slate-200 hover:bg-slate-50'
                if (submitted) {
                  if (isCorrect) style = 'border-emerald-300 bg-emerald-50'
                  else if (selected) style = 'border-red-300 bg-red-50'
                  else style = 'border-slate-100 opacity-60'
                } else if (selected) {
                  style = 'border-brand-400 bg-brand-50'
                }
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={submitted}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm text-slate-700 transition-colors disabled:cursor-default ${style}`}
                  >
                    {opt}
                    {submitted && isCorrect && <Check size={14} className="shrink-0 text-emerald-600" />}
                    {submitted && selected && !isCorrect && <X size={14} className="shrink-0 text-red-500" />}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {!submitted && (
        <Button className="mt-4" size="sm" onClick={handleSubmit} disabled={!allAnswered}>
          Enviar respostas
        </Button>
      )}

      {submitted && !passed && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-xs text-red-600">
            Nota abaixo de {QUIZ_PASS_THRESHOLD}% — revise o conteúdo do módulo e refaça o quiz para poder concluir.
          </p>
          <Button variant="secondary" size="sm" icon={<RotateCcw size={13} />} onClick={handleRetry} className="w-fit">
            Refazer quiz
          </Button>
        </div>
      )}

      {submitted && passed && (
        <p className="mt-4 text-xs font-medium text-emerald-600">✅ Aprovado — você já pode concluir o módulo.</p>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { subscribeSurveyResponses } from '../../services/teamSurveyService'
import { Spinner } from '../ui/FullPageSpinner'
import { StatCard } from '../ui/StatCard'
import { groupBySection } from '../../utils/surveySections'
import { SURVEY_MIN_RESPONSES, type SurveyQuestion, type SurveyResponse, type TeamSurvey } from '../../types'

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

function numbersFor(q: SurveyQuestion, responses: SurveyResponse[]) {
  return responses.map((r) => r.answers[q.id]).filter((v): v is number => typeof v === 'number')
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** eNPS = % que deu 9 ou 10 menos % que deu de 0 a 6. Vai de -100 a 100. */
function enps(xs: number[]) {
  if (!xs.length) return null
  const promoters = xs.filter((x) => x >= 9).length
  const detractors = xs.filter((x) => x <= 6).length
  return Math.round(((promoters - detractors) / xs.length) * 100)
}

function scaleTone(a: number) {
  if (a >= 4) return { label: 'Bom', cls: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' }
  if (a >= 3) return { label: 'Atenção', cls: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500' }
  return { label: 'Crítico', cls: 'bg-red-100 text-red-700', bar: 'bg-red-500' }
}

function Distribution({ q, values }: { q: SurveyQuestion; values: number[] }) {
  const options = q.kind === 'nps' ? Array.from({ length: 11 }, (_, i) => i) : [1, 2, 3, 4, 5]
  const max = Math.max(1, ...options.map((o) => values.filter((v) => v === o).length))
  return (
    <ul className="mt-2 flex flex-col gap-1" aria-label="Quantas pessoas deram cada nota">
      {options.map((o) => {
        const count = values.filter((v) => v === o).length
        return (
          <li key={o} className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-5 text-right font-semibold text-slate-600">{o}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(count / max) * 100}%` }} />
            </span>
            <span className="w-24">
              {count} {count === 1 ? 'resposta' : 'respostas'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Resultado consolidado da equipe — só o Admin vê, e só a partir de
 *  SURVEY_MIN_RESPONSES respostas. Comentários aparecem soltos, sem ordem de
 *  chegada (ordenados pelo id aleatório). */
export function SurveyResults({ survey }: { survey: TeamSurvey }) {
  const [responses, setResponses] = useState<SurveyResponse[] | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(
    () =>
      subscribeSurveyResponses(
        survey.id,
        (items) => setResponses([...items].sort((a, b) => a.id.localeCompare(b.id))),
        () => setDenied(true)
      ),
    [survey.id]
  )

  if (denied) return <p className="text-sm text-slate-500">Só o administrador pode ver os resultados.</p>
  if (!responses) return <Spinner />

  if (responses.length < SURVEY_MIN_RESPONSES) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <Lock size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
        <p>
          {responses.length === 0 ? 'Nenhuma resposta ainda.' : `${responses.length} de no mínimo ${SURVEY_MIN_RESPONSES} respostas.`} O resultado
          aparece a partir de {SURVEY_MIN_RESPONSES} respostas, para que ninguém possa ser identificado.
        </p>
      </div>
    )
  }

  const scaleQs = survey.questions.filter((q) => q.kind === 'scale')
  const npsQs = survey.questions.filter((q) => q.kind === 'nps')
  const scaleAverages = scaleQs
    .map((q) => ({ q, a: avg(numbersFor(q, responses)) }))
    .filter((x): x is { q: SurveyQuestion; a: number } => x.a !== null)
  const overall = avg(scaleAverages.map((x) => x.a))
  const firstEnps = npsQs.length ? enps(numbersFor(npsQs[0], responses)) : null
  const ranked = [...scaleAverages].sort((x, y) => y.a - x.a)
  const strengths = ranked.slice(0, 3)
  const weaknesses = ranked.slice(-3).reverse()

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Respostas" value={responses.length} />
        <StatCard label="Satisfação média (de 1 a 5)" value={overall !== null ? fmt(overall) : 'Sem dados'} />
        <StatCard label="eNPS (de -100 a 100)" value={firstEnps !== null ? firstEnps : 'Sem dados'} />
      </div>

      {ranked.length >= 4 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <h3 className="mb-2 text-sm font-bold text-emerald-700">Pontos fortes da equipe</h3>
            <ul className="flex flex-col gap-1.5 text-sm text-slate-700">
              {strengths.map(({ q, a }) => (
                <li key={q.id}>
                  {q.text} <span className="font-semibold">Média {fmt(a)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
            <h3 className="mb-2 text-sm font-bold text-red-700">Pontos de atenção</h3>
            <ul className="flex flex-col gap-1.5 text-sm text-slate-700">
              {weaknesses.map(({ q, a }) => (
                <li key={q.id}>
                  {q.text} <span className="font-semibold">Média {fmt(a)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {groupBySection(survey.questions).map((g) => (
        <section key={g.section} className="flex flex-col gap-3">
          <h3 className="border-b border-slate-100 pb-1.5 text-sm font-bold uppercase tracking-wide text-brand-600">{g.section}</h3>
          {g.questions.map((q) => {
            if (q.kind === 'text') {
              const texts = responses.map((r) => r.answers[q.id]).filter((v): v is string => typeof v === 'string' && !!v.trim())
              return (
                <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-[15px] font-medium text-slate-800">{q.text}</p>
                  {texts.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">Ninguém escreveu nada aqui.</p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-2">
                      {texts.map((t, i) => (
                        <li key={i} className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            }
            const values = numbersFor(q, responses)
            const a = avg(values)
            const score = q.kind === 'nps' ? enps(values) : null
            const tone = q.kind === 'scale' && a !== null ? scaleTone(a) : null
            return (
              <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[15px] font-medium text-slate-800">{q.text}</p>
                  <p className="flex items-center gap-2 text-sm text-slate-600">
                    {a !== null && <span className="font-bold">Média {fmt(a)}</span>}
                    {score !== null && <span className="font-bold">eNPS {score}</span>}
                    {tone && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone.cls}`}>{tone.label}</span>}
                  </p>
                </div>
                {q.kind === 'scale' && (q.minLabel || q.maxLabel) && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    1 = {q.minLabel}, 5 = {q.maxLabel}
                  </p>
                )}
                <Distribution q={q} values={values} />
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}

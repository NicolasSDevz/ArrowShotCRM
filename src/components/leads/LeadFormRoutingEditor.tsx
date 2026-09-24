import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowRight, GitBranch, Info, Plus } from 'lucide-react'
import { Field, Select } from '../ui/Field'
import { EditorSection } from './LeadFormBuilderParts'
import { isChoiceType, visibleOptions } from './leadFormMeta'
import { destinationOf, outcomeRules, resolveOutcome, type LeadFormAnswers } from './leadFormUtils'
import type { LeadFormOutcome, LeadFormQuestion } from '../../types/leadForm'

/** Painel único da lógica das telas finais: cada resposta de cada pergunta de
 *  escolha aponta pra uma tela (ou pra nenhuma). Junto: a prioridade quando
 *  as respostas apontam pra telas diferentes, a tela de quem não se encaixa e
 *  um simulador pra conferir pra onde o lead vai. */
export function RoutingEditor({
  questions,
  outcomes,
  onSetDestination,
  onMoveOutcome,
  onSetDefault,
  onOpenOutcome,
  onEnableRouting,
}: {
  questions: LeadFormQuestion[]
  outcomes: LeadFormOutcome[]
  onSetDestination: (questionId: string, optionId: string, outcomeId: string | null) => void
  onMoveOutcome: (id: string, dir: -1 | 1) => void
  onSetDefault: (id: string) => void
  onOpenOutcome: (id: string) => void
  onEnableRouting: () => void
}) {
  const choiceQuestions = questions.filter((q) => isChoiceType(q.type) && q.label.trim() && visibleOptions(q).length > 0)
  const [test, setTest] = useState<LeadFormAnswers>({})
  const defaultOutcome = outcomes.find((o) => o.isDefault) ?? outcomes[0]

  const header = (
    <div className="flex items-center gap-2">
      <GitBranch size={15} className="text-brand-600" />
      <div>
        <p className="text-sm font-semibold text-slate-800">Qual resposta vai pra qual tela</p>
        <p className="text-xs text-slate-400">Escolha a tela final de cada resposta.</p>
      </div>
    </div>
  )

  if (outcomes.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <button type="button" onClick={onEnableRouting} className="flex w-fit items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700">
          <Plus size={13} /> Criar telas finais por resposta
        </button>
      </div>
    )
  }

  const routedQuestions = choiceQuestions.filter((q) => visibleOptions(q).some((o) => destinationOf(outcomes, q.id, o.id)))
  const testForm = { outcomes, qualificationQuestionId: null }
  const testResult = resolveOutcome(testForm, test)
  const testAnswered = Object.values(test).some((v) => (Array.isArray(v) ? v.length > 0 : !!v))
  // Por que caiu nessa tela: a primeira regra que bateu (ou "nenhuma bateu").
  const testReason = (() => {
    if (!testResult) return ''
    for (const r of outcomeRules(testForm, testResult)) {
      const raw = test[r.questionId]
      const values = Array.isArray(raw) ? raw : raw ? [raw] : []
      const hit = values.find((v) => r.values.includes(v))
      if (hit) {
        const q = questions.find((x) => x.id === r.questionId)
        const opt = q ? visibleOptions(q).find((o) => o.id === hit) : null
        return `porque respondeu "${opt?.label ?? '?'}"${q ? ` em "${q.label}"` : ''}`
      }
    }
    return 'porque nenhuma resposta marcada leva pra outra tela'
  })()

  return (
    <div className="flex flex-col gap-4">
      {header}

      <EditorSection title="Para onde vai cada resposta" hint='Deixe em "Não decide" as respostas que não mudam a tela final.'>
        {choiceQuestions.length === 0 ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 p-2.5 text-xs leading-relaxed text-slate-500">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>Adicione uma pergunta de <strong>escolha única</strong> ou <strong>múltipla escolha</strong> pra separar as telas pela resposta.</span>
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {choiceQuestions.map((q) => (
              <div key={q.id} className="rounded-lg border border-slate-200 p-2.5">
                <p className="mb-2 text-xs font-semibold text-slate-700">
                  {questions.indexOf(q) + 1}. {q.label}
                </p>
                <div className="flex flex-col gap-1.5">
                  {visibleOptions(q).map((opt) => {
                    const dest = destinationOf(outcomes, q.id, opt.id)
                    return (
                      <div key={opt.id} className="grid grid-cols-[minmax(0,1fr)_14px_minmax(0,1.2fr)] items-center gap-2">
                        <span className="truncate text-xs text-slate-600" title={opt.label}>
                          {opt.label}
                        </span>
                        <ArrowRight size={12} className={dest ? 'text-brand-500' : 'text-slate-300'} />
                        <Select
                          value={dest ?? ''}
                          onChange={(e) => onSetDestination(q.id, opt.id, e.target.value || null)}
                          className={dest ? 'font-semibold text-brand-700' : 'text-slate-400'}
                          aria-label={`Tela final para "${opt.label}"`}
                        >
                          <option value="">Não decide</option>
                          {outcomes.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label || 'Tela sem nome'}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </EditorSection>

      <EditorSection title="Quem não se encaixar em nada vai pra">
        <Select value={defaultOutcome?.id ?? ''} onChange={(e) => onSetDefault(e.target.value)}>
          {outcomes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label || 'Tela sem nome'}
            </option>
          ))}
        </Select>
      </EditorSection>

      {outcomes.length > 1 && (
        <EditorSection
          title="Se as respostas levarem pra telas diferentes"
          hint="Ex: o lead marcou uma resposta que leva pra “Lead qualificado” e outra que leva pra “Desqualificado”. Vale a tela mais acima nesta lista."
        >
          <div className="flex flex-col gap-1">
            {outcomes.map((o, i) => (
              <div key={o.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                <span className="w-4 text-xs font-bold text-slate-400">{i + 1}º</span>
                <button type="button" onClick={() => onOpenOutcome(o.id)} className="min-w-0 flex-1 truncate text-left text-xs font-medium text-slate-700 hover:text-brand-700">
                  {o.label || 'Tela sem nome'}
                </button>
                {o.isDefault && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">padrão</span>}
                <button type="button" title="Mais prioridade" disabled={i === 0} onClick={() => onMoveOutcome(o.id, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                  <ArrowUp size={13} />
                </button>
                <button type="button" title="Menos prioridade" disabled={i === outcomes.length - 1} onClick={() => onMoveOutcome(o.id, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                  <ArrowDown size={13} />
                </button>
              </div>
            ))}
          </div>
        </EditorSection>
      )}

      {routedQuestions.length > 0 && (
        <EditorSection title="Testar" hint="Simule as respostas e veja pra qual tela o lead vai.">
          <div className="flex flex-col gap-2.5">
            {routedQuestions.map((q) => {
              const multi = q.type === 'multi_choice'
              const current = test[q.id]
              const selected = Array.isArray(current) ? current : current ? [current] : []
              return (
                <Field key={q.id} label={`${questions.indexOf(q) + 1}. ${q.label}`}>
                  <div className="flex flex-wrap gap-1.5">
                    {visibleOptions(q).map((opt) => {
                      const on = selected.includes(opt.id)
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setTest((prev) => {
                              if (!multi) return { ...prev, [q.id]: on ? '' : opt.id }
                              return { ...prev, [q.id]: on ? selected.filter((v) => v !== opt.id) : [...selected, opt.id] }
                            })
                          }
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                            on ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </Field>
              )
            })}
            {testAnswered && testResult && (
              <div className="rounded-lg border border-brand-200 bg-brand-50 p-2.5 text-xs text-brand-800">
                <p>
                  O lead vai pra <strong>{testResult.label || 'Tela sem nome'}</strong> {testReason}.
                </p>
                <button type="button" onClick={() => onOpenOutcome(testResult.id)} className="mt-1 font-semibold text-brand-700 underline hover:text-brand-800">
                  Abrir essa tela
                </button>
              </div>
            )}
          </div>
        </EditorSection>
      )}
    </div>
  )
}

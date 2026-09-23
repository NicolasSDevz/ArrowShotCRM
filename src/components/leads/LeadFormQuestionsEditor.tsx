import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical } from 'lucide-react'
import { Input, Select } from '../ui/Field'
import {
  LEAD_FORM_QUESTION_TYPE_LABEL,
  type LeadFormQuestion,
  type LeadFormQuestionType,
  type LeadFormFieldRole,
} from '../../types/leadForm'

const ROLE_LABEL: Record<NonNullable<LeadFormFieldRole>, string> = {
  name: 'Nome do lead',
  whatsapp: 'WhatsApp do lead',
  email: 'E-mail do lead',
  company: 'Empresa do lead',
}

function newQuestion(type: LeadFormQuestionType): LeadFormQuestion {
  return {
    id: crypto.randomUUID(),
    type,
    label: '',
    required: true,
    role: null,
    options: type === 'single_choice' || type === 'multi_choice' ? [{ id: crypto.randomUUID(), label: '' }] : undefined,
    condition: null,
  }
}

/** Aba "Perguntas" do construtor de formulário — tipo, obrigatoriedade,
 *  papel (nome/whatsapp/e-mail/empresa alimentam os campos fixos do Lead) e
 *  visibilidade condicional a uma pergunta anterior de escolha. Extraído do
 *  LeadFormBuilderModal pra caber ao lado do preview ao vivo sem virar um
 *  arquivo gigante. */
export function LeadFormQuestionsEditor({
  questions,
  onChange,
}: {
  questions: LeadFormQuestion[]
  onChange: (next: LeadFormQuestion[]) => void
}) {
  const usedRoles = new Set(questions.map((q) => q.role).filter((r): r is NonNullable<LeadFormFieldRole> => !!r))

  const addQuestion = (type: LeadFormQuestionType) => onChange([...questions, newQuestion(type)])

  const updateQuestion = (id: string, patch: Partial<LeadFormQuestion>) =>
    onChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)))

  const removeQuestion = (id: string) =>
    onChange(questions.filter((q) => q.id !== id).map((q) => (q.condition?.questionId === id ? { ...q, condition: null } : q)))

  const moveQuestion = (index: number, dir: -1 | 1) => {
    const next = [...questions]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const addOption = (qId: string) =>
    updateQuestion(qId, {
      options: [...(questions.find((q) => q.id === qId)?.options ?? []), { id: crypto.randomUUID(), label: '' }],
    })

  const updateOption = (qId: string, optId: string, label: string) => {
    const q = questions.find((item) => item.id === qId)
    if (!q) return
    updateQuestion(qId, { options: (q.options ?? []).map((o) => (o.id === optId ? { ...o, label } : o)) })
  }

  const removeOption = (qId: string, optId: string) => {
    const q = questions.find((item) => item.id === qId)
    if (!q) return
    updateQuestion(qId, { options: (q.options ?? []).filter((o) => o.id !== optId) })
  }

  const conditionSourceOptions = (index: number) =>
    questions.slice(0, index).filter((q) => q.type === 'single_choice' || q.type === 'multi_choice')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Perguntas</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(LEAD_FORM_QUESTION_TYPE_LABEL) as [LeadFormQuestionType, string][]).map(([type, label]) => (
            <button
              key={type}
              type="button"
              onClick={() => addQuestion(type)}
              className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
            >
              <Plus size={11} /> {label}
            </button>
          ))}
        </div>
      </div>

      {questions.length === 0 && <p className="text-sm text-slate-400">Nenhuma pergunta ainda — adicione pelo menos uma acima.</p>}

      <div className="flex flex-col gap-3">
        {questions.map((q, index) => {
          const sources = conditionSourceOptions(index)
          return (
            <div key={q.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start gap-2">
                <div className="mt-2 flex shrink-0 flex-col items-center text-slate-300">
                  <GripVertical size={14} />
                  <button type="button" onClick={() => moveQuestion(index, -1)} disabled={index === 0} className="disabled:opacity-30">
                    <ChevronUp size={13} />
                  </button>
                  <button type="button" onClick={() => moveQuestion(index, 1)} disabled={index === questions.length - 1} className="disabled:opacity-30">
                    <ChevronDown size={13} />
                  </button>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      {LEAD_FORM_QUESTION_TYPE_LABEL[q.type]}
                    </span>
                    <Input
                      value={q.label}
                      onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
                      placeholder="Texto da pergunta"
                      className="flex-1"
                    />
                    <button type="button" onClick={() => removeQuestion(q.id)} className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {(q.type === 'single_choice' || q.type === 'multi_choice') && (
                    <div className="flex flex-col gap-1.5 pl-1">
                      {(q.options ?? []).map((opt) => (
                        <div key={opt.id} className="flex items-center gap-1.5">
                          <Input
                            value={opt.label}
                            onChange={(e) => updateOption(q.id, opt.id, e.target.value)}
                            placeholder="Opção"
                            className="h-8 flex-1 text-sm"
                          />
                          <button type="button" onClick={() => removeOption(q.id, opt.id)} className="rounded p-1 text-slate-300 hover:text-red-500">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={() => addOption(q.id)} className="flex w-fit items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                        <Plus size={11} /> Adicionar opção
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={q.required} onChange={(e) => updateQuestion(q.id, { required: e.target.checked })} />
                      Obrigatória
                    </label>

                    <label className="flex items-center gap-1.5">
                      Campo:
                      <Select
                        value={q.role ?? ''}
                        onChange={(e) => updateQuestion(q.id, { role: (e.target.value || null) as LeadFormFieldRole })}
                        className="h-7 w-auto text-xs"
                      >
                        <option value="">Livre (só fica na resposta)</option>
                        {(Object.entries(ROLE_LABEL) as [NonNullable<LeadFormFieldRole>, string][]).map(([r, l]) => (
                          <option key={r} value={r} disabled={usedRoles.has(r) && q.role !== r}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>

                  {sources.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2 text-xs">
                      <span className="text-slate-500">Só mostrar se</span>
                      <Select
                        value={q.condition?.questionId ?? ''}
                        onChange={(e) =>
                          updateQuestion(q.id, {
                            condition: e.target.value ? { questionId: e.target.value, values: [] } : null,
                          })
                        }
                        className="h-7 w-auto text-xs"
                      >
                        <option value="">(sem condição)</option>
                        {sources.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label || '(pergunta sem texto)'}
                          </option>
                        ))}
                      </Select>
                      {q.condition && (
                        <>
                          <span className="text-slate-500">for</span>
                          <div className="flex flex-wrap gap-1">
                            {(questions.find((s) => s.id === q.condition!.questionId)?.options ?? []).map((opt) => {
                              const checked = q.condition!.values.includes(opt.id)
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() =>
                                    updateQuestion(q.id, {
                                      condition: {
                                        questionId: q.condition!.questionId,
                                        values: checked
                                          ? q.condition!.values.filter((v) => v !== opt.id)
                                          : [...q.condition!.values, opt.id],
                                      },
                                    })
                                  }
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    checked ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'
                                  }`}
                                >
                                  {opt.label || '(sem texto)'}
                                </button>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Plus, Trash2, Copy, GitBranch, CornerDownRight, AlertTriangle, Info } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { InfoTip } from '../ui/InfoTip'
import { EditorSection, Toggle, ImageUploadField } from './LeadFormBuilderParts'
import { QUESTION_TYPE_META, ROLE_LABEL, conditionProblem, isChoiceType, visibleOptions } from './leadFormMeta'
import type { LeadFormFieldRole, LeadFormQuestion, LeadFormQuestionType } from '../../types/leadForm'

/** Painel de edição de UMA pergunta (a que está selecionada na lista de
 *  telas): texto, tipo, opções (com "Outro"), obrigatoriedade, lógica
 *  condicional e a que campo do lead a resposta alimenta. */
export function LeadFormQuestionEditor({
  question: q,
  index,
  questions,
  formId,
  canUpload,
  onChange,
  onDelete,
  onDuplicate,
}: {
  question: LeadFormQuestion
  index: number
  questions: LeadFormQuestion[]
  formId: string
  canUpload: boolean
  onChange: (patch: Partial<LeadFormQuestion>) => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const [focusOptionId, setFocusOptionId] = useState<string | null>(null)
  const isChoice = isChoiceType(q.type)
  const options = q.options ?? []
  const usedRoles = new Set(questions.filter((o) => o.id !== q.id).map((o) => o.role).filter((r): r is NonNullable<LeadFormFieldRole> => !!r))

  const setType = (type: LeadFormQuestionType) => {
    if (type === q.type) return
    const patch: Partial<LeadFormQuestion> = { type }
    if (isChoiceType(type) && options.length === 0) {
      patch.options = [
        { id: crypto.randomUUID(), label: '' },
        { id: crypto.randomUUID(), label: '' },
      ]
    }
    if (isChoiceType(type)) patch.role = null
    onChange(patch)
  }

  const updateOption = (optId: string, label: string) => onChange({ options: options.map((o) => (o.id === optId ? { ...o, label } : o)) })
  const removeOption = (optId: string) => onChange({ options: options.filter((o) => o.id !== optId) })
  const addOptionAfter = (afterId?: string) => {
    const created = { id: crypto.randomUUID(), label: '' }
    const at = afterId ? options.findIndex((o) => o.id === afterId) + 1 : options.length
    onChange({ options: [...options.slice(0, at), created, ...options.slice(at)] })
    setFocusOptionId(created.id)
  }
  /** Colar uma lista (uma opção por linha) cria todas de uma vez. */
  const pasteOptions = (optId: string, text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length < 2) return false
    const at = options.findIndex((o) => o.id === optId)
    const current = options[at]
    const replaceCurrent = !current.label.trim()
    const created = lines.slice(replaceCurrent ? 1 : 0).map((label) => ({ id: crypto.randomUUID(), label }))
    const next = options.map((o) => (o.id === optId && replaceCurrent ? { ...o, label: lines[0] } : o))
    next.splice(at + 1, 0, ...created)
    // Os campos em branco que já existiam só atrapalham depois de colar a lista.
    onChange({ options: next.filter((o) => o.label.trim()) })
    return true
  }

  const sources = questions.slice(0, index).filter((s) => isChoiceType(s.type))
  const problem = conditionProblem(q, index, questions)
  const source = q.condition ? questions.find((s) => s.id === q.condition!.questionId) : undefined
  const sourceOptions = source ? visibleOptions(source) : []
  const summary =
    q.condition && source && q.condition.values.length > 0
      ? sourceOptions.filter((o) => q.condition!.values.includes(o.id)).map((o) => `"${o.label}"`)
      : []

  const enableCondition = (on: boolean) => {
    if (!on) return onChange({ condition: null })
    const pick = sources[sources.length - 1]
    if (pick) onChange({ condition: { questionId: pick.id, values: [] } })
  }

  const meta = QUESTION_TYPE_META[q.type]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-brand-50 px-1.5 text-xs font-bold text-brand-700">{index + 1}</span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">Pergunta {index + 1}</p>
        <button type="button" onClick={onDuplicate} title="Duplicar pergunta" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <Copy size={14} />
        </button>
        <button type="button" onClick={onDelete} title="Excluir pergunta" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
          <Trash2 size={14} />
        </button>
      </div>

      <EditorSection title="Pergunta">
        <Field label="Texto da pergunta" required>
          <Textarea rows={2} value={q.label} onChange={(e) => onChange({ label: e.target.value })} placeholder='Ex: "Qual serviço você está procurando?"' />
        </Field>
        <Field label="Texto de apoio (opcional)">
          <Input value={q.description ?? ''} onChange={(e) => onChange({ description: e.target.value })} placeholder="Uma dica curta abaixo da pergunta" />
        </Field>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-500">Tipo de resposta</span>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.entries(QUESTION_TYPE_META) as [LeadFormQuestionType, (typeof QUESTION_TYPE_META)[LeadFormQuestionType]][]).map(([type, m]) => {
              const Icon = m.icon
              const active = q.type === type
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setType(type)}
                  title={m.hint}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-[11px] font-medium leading-tight transition-colors ${
                    active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={15} />
                  {m.label}
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-xs text-slate-400">{meta.hint}</p>
        </div>
      </EditorSection>

      {isChoice && (
        <EditorSection title="Opções de resposta" hint="Dica: cole uma lista (uma opção por linha) no primeiro campo e todas são criadas de uma vez. Enter cria a próxima.">
          <div className="flex flex-col gap-1.5">
            {options.map((opt, i) => (
              <div key={opt.id} className="flex items-center gap-1.5">
                <span className="w-4 shrink-0 text-center text-[11px] text-slate-300">{i + 1}</span>
                <Input
                  autoFocus={opt.id === focusOptionId}
                  value={opt.label}
                  onChange={(e) => updateOption(opt.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addOptionAfter(opt.id)
                    }
                  }}
                  onPaste={(e) => {
                    if (pasteOptions(opt.id, e.clipboardData.getData('text'))) e.preventDefault()
                  }}
                  placeholder={`Opção ${i + 1}`}
                  className="flex-1"
                />
                <button type="button" onClick={() => removeOption(opt.id)} disabled={options.length <= 1} className="rounded p-1.5 text-slate-300 hover:text-red-500 disabled:opacity-30">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {q.allowOther && (
              <div className="flex items-center gap-1.5">
                <span className="w-4 shrink-0 text-center text-[11px] text-slate-300">
                  <CornerDownRight size={11} />
                </span>
                <div className="flex h-[38px] flex-1 items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">
                  {q.otherLabel?.trim() || 'Outro'} <span className="ml-1.5 text-xs text-slate-400">(o lead escreve o que é)</span>
                </div>
              </div>
            )}
          </div>
          <button type="button" onClick={() => addOptionAfter()} className="flex w-fit items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
            <Plus size={12} /> Adicionar opção
          </button>

          <div className="mt-1 rounded-lg border border-slate-200 p-3">
            <Toggle
              checked={!!q.allowOther}
              onChange={(v) => onChange({ allowOther: v })}
              label='Incluir a opção "Outro"'
              hint="Quem marcar precisa escrever o que é — assim você vê se ainda se enquadra."
            />
            {q.allowOther && (
              <div className="mt-3 flex flex-col gap-2.5">
                <Field label="Nome da opção">
                  <Input value={q.otherLabel ?? ''} onChange={(e) => onChange({ otherLabel: e.target.value })} placeholder="Outro" />
                </Field>
                <Field label="O que perguntar quando marcar">
                  <Input value={q.otherPrompt ?? ''} onChange={(e) => onChange({ otherPrompt: e.target.value })} placeholder="Qual serviço você precisa?" />
                </Field>
                <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-400">
                  <Info size={12} className="mt-0.5 shrink-0" />
                  <span>
                    O texto aparece na ficha do lead ("Outro: pintura"). Em <strong>Tela final</strong> você pode mandar quem escolhe
                    "Outro" pra uma tela diferente das demais.
                  </span>
                </p>
              </div>
            )}
          </div>
        </EditorSection>
      )}

      <EditorSection title="Regras">
        <Toggle checked={q.required} onChange={(v) => onChange({ required: v })} label="Resposta obrigatória" hint="O lead não avança sem responder." />
        <Field label="Guardar essa resposta no cadastro do lead como">
          <div className="flex items-center gap-1.5">
            <Select value={q.role ?? ''} onChange={(e) => onChange({ role: (e.target.value || null) as LeadFormFieldRole })} disabled={isChoice}>
              <option value="">Só resposta (fica na ficha do lead)</option>
              {(Object.entries(ROLE_LABEL) as [NonNullable<LeadFormFieldRole>, string][]).map(([r, l]) => (
                <option key={r} value={r} disabled={usedRoles.has(r) && q.role !== r}>
                  {l}
                </option>
              ))}
            </Select>
            <InfoTip title="Pra que serve isso?">
              Marcar uma pergunta como "Nome do lead" ou "WhatsApp do lead" faz a resposta preencher esses campos direto no
              cadastro do lead — é assim que ele aparece certinho no Kanban de Leads, em vez de só ficar guardado como uma
              resposta solta. Perguntas de escolha não podem ser usadas assim.
            </InfoTip>
          </div>
        </Field>
      </EditorSection>

      <EditorSection
        title="Lógica: mostrar só em certos casos"
        hint="Por padrão todo mundo vê todas as perguntas. Use isso pra pular uma pergunta quando ela não faz sentido pra aquele lead."
        collapsible
        defaultOpen={!!q.condition}
        badge={q.condition ? <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">ligada</span> : undefined}
      >
        {sources.length === 0 && !q.condition ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 p-2.5 text-xs leading-relaxed text-slate-500">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>Pra usar lógica, coloque antes desta uma pergunta de <strong>escolha única</strong> ou <strong>múltipla escolha</strong> — a lógica usa a resposta dela.</span>
          </p>
        ) : (
          <>
            <Toggle checked={!!q.condition} onChange={enableCondition} label="Mostrar só pra quem responder algo específico antes" />
            {q.condition && (
              <div className="flex flex-col gap-3 rounded-lg border border-brand-100 bg-brand-50/40 p-3">
                <div className="flex items-start gap-2">
                  <GitBranch size={14} className="mt-2 shrink-0 text-brand-600" />
                  <Field label="1. Olhar a resposta de">
                    <Select
                      value={q.condition.questionId}
                      onChange={(e) => onChange({ condition: { questionId: e.target.value, values: [] } })}
                    >
                      {!sources.some((s) => s.id === q.condition!.questionId) && (
                        <option value={q.condition.questionId} disabled>
                          ⚠ pergunta inválida
                        </option>
                      )}
                      {sources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {questions.indexOf(s) + 1}. {s.label || '(pergunta sem texto)'}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div>
                  <span className="mb-1.5 block text-xs font-medium text-slate-500">2. Mostrar esta pergunta se a resposta for (marque uma ou mais)</span>
                  <div className="flex flex-wrap gap-1.5">
                    {sourceOptions.length === 0 && <span className="text-xs text-slate-400">A pergunta escolhida ainda não tem opções preenchidas.</span>}
                    {sourceOptions.map((opt) => {
                      const checked = q.condition!.values.includes(opt.id)
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            onChange({
                              condition: {
                                questionId: q.condition!.questionId,
                                values: checked ? q.condition!.values.filter((v) => v !== opt.id) : [...q.condition!.values, opt.id],
                              },
                            })
                          }
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                            checked ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {problem ? (
                  <p className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-700">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {problem}
                  </p>
                ) : (
                  <p className="text-xs leading-relaxed text-slate-500">
                    Resumo: essa pergunta só aparece pra quem responder {summary.join(' ou ')} em "{source?.label || 'pergunta sem texto'}". Pra
                    todos os outros ela é pulada.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </EditorSection>

      <EditorSection title="Imagem (opcional)" hint="Aparece acima do texto da pergunta." collapsible defaultOpen={!!q.imageUrl}>
        <ImageUploadField label="Imagem da pergunta" url={q.imageUrl} formId={formId} assetKey={`question-${q.id}`} sizeHint="banner" canUpload={canUpload} onChange={(url) => onChange({ imageUrl: url })} />
      </EditorSection>
    </div>
  )
}

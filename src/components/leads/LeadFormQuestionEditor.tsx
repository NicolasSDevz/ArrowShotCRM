import { useState } from 'react'
import { Plus, Trash2, Copy, GitBranch, CornerDownRight, AlertTriangle, Info, ArrowUp, ArrowDown, MessageSquareText } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { InfoTip } from '../ui/InfoTip'
import { FieldGroupEditor } from './FieldGroupEditor'
import { FIELD_GROUP_PRESETS } from './leadFormFieldGroups'
import { EditorSection, Toggle, ImageUploadField } from './LeadFormBuilderParts'
import { DRIVE_DEFAULTS, NO_ROLE_TYPES, QUESTION_TYPE_META, ROLE_LABEL, conditionProblem, fromOrderedOptions, isChoiceType, orderedOptions, visibleOptions } from './leadFormMeta'
import { ButtonAnimationPicker } from './LeadFormBlocksEditor'
import { OTHER_OPTION_ID, type LeadFormFieldRole, type LeadFormQuestion, type LeadFormQuestionButton, type LeadFormQuestionOption, type LeadFormQuestionType } from '../../types/leadForm'

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
  // Opções com a caixa de "mensagem ao escolher" aberta (as que já têm mensagem ficam abertas sempre).
  const [messageOpen, setMessageOpen] = useState<Set<string>>(new Set())
  const isChoice = isChoiceType(q.type)
  const options = q.options ?? []
  // Ordem que o lead vê, com o "Outro" na posição dele — é essa lista que sobe/desce.
  const ordered = orderedOptions(q)
  const saveOrdered = (list: LeadFormQuestionOption[]) => onChange(fromOrderedOptions(list))
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
    if (NO_ROLE_TYPES.has(type)) patch.role = null
    if (type === 'confirm' && !q.confirmLabel) patch.confirmLabel = 'Confirmo'
    if (type === 'file') {
      if (!q.driveButtonLabel) patch.driveButtonLabel = DRIVE_DEFAULTS.driveButtonLabel
      if (!q.confirmLabel || q.confirmLabel === 'Confirmo') patch.confirmLabel = DRIVE_DEFAULTS.confirmLabel
    }
    if (type === 'fields' && !(q.subfields ?? []).length) patch.subfields = FIELD_GROUP_PRESETS.find((p) => p.key === 'custom')!.make()
    onChange(patch)
  }

  const updateOption = (optId: string, label: string) => onChange({ options: options.map((o) => (o.id === optId ? { ...o, label } : o)) })
  const setOptionMessage = (optId: string, message: string) =>
    optId === OTHER_OPTION_ID
      ? onChange({ otherMessage: message })
      : onChange({ options: options.map((o) => (o.id === optId ? { ...o, message } : o)) })
  const removeOption = (optId: string) => saveOrdered(ordered.filter((o) => o.id !== optId))
  const moveOption = (optId: string, dir: -1 | 1) => {
    const i = ordered.findIndex((o) => o.id === optId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= ordered.length) return
    const next = [...ordered]
    ;[next[i], next[j]] = [next[j], next[i]]
    saveOrdered(next)
  }
  const addOptionAfter = (afterId?: string) => {
    const created = { id: crypto.randomUUID(), label: '' }
    // Sem referência: entra no fim das opções normais (antes do "Outro" se ele for o último).
    const at = afterId ? ordered.findIndex((o) => o.id === afterId) + 1 : q.otherIndex == null ? ordered.filter((o) => o.id !== OTHER_OPTION_ID).length : ordered.length
    saveOrdered([...ordered.slice(0, at), created, ...ordered.slice(at)])
    setFocusOptionId(created.id)
  }
  const buttons = q.buttons ?? []
  const setButtons = (next: LeadFormQuestionButton[]) => onChange({ buttons: next })
  const updateButton = (id: string, patch: Partial<LeadFormQuestionButton>) => setButtons(buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  /** Colar uma lista (uma opção por linha) cria todas de uma vez. */
  const pasteOptions = (optId: string, text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length < 2) return false
    const at = ordered.findIndex((o) => o.id === optId)
    const current = ordered[at]
    const replaceCurrent = !current.label.trim()
    const created = lines.slice(replaceCurrent ? 1 : 0).map((label) => ({ id: crypto.randomUUID(), label }))
    const next = ordered.map((o) => (o.id === optId && replaceCurrent ? { ...o, label: lines[0] } : o))
    next.splice(at + 1, 0, ...created)
    // Os campos em branco que já existiam só atrapalham depois de colar a lista.
    saveOrdered(next.filter((o) => o.id === OTHER_OPTION_ID || o.label.trim()))
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
          <Textarea
            rows={Math.min(8, Math.max(3, (q.description ?? '').split('\n').length + 1))}
            value={q.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder={'Uma explicação abaixo da pergunta.\nPode quebrar linha, usar emoji e **negrito**.'}
          />
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            Enter quebra a linha · **texto** fica em negrito · links (https://… ou www.…) ficam clicáveis
          </p>
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
            {ordered.map((opt, i) => {
              const isOther = opt.id === OTHER_OPTION_ID
              const showMessage = messageOpen.has(opt.id) || !!opt.message
              return (
                <div key={opt.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <span className="w-4 shrink-0 text-center text-[11px] text-slate-300">{isOther ? <CornerDownRight size={11} className="mx-auto" /> : i + 1}</span>
                    {isOther ? (
                      <div className="flex h-[38px] min-w-0 flex-1 items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">
                        <span className="truncate">{q.otherLabel?.trim() || 'Outro'}</span>
                        <span className="ml-1.5 shrink-0 text-xs text-slate-400">(o lead escreve)</span>
                      </div>
                    ) : (
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
                        className="min-w-0 flex-1"
                      />
                    )}
                    <div className="flex shrink-0 flex-col">
                      <button type="button" onClick={() => moveOption(opt.id, -1)} disabled={i === 0} title="Subir" className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30">
                        <ArrowUp size={12} />
                      </button>
                      <button type="button" onClick={() => moveOption(opt.id, 1)} disabled={i === ordered.length - 1} title="Descer" className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30">
                        <ArrowDown size={12} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMessageOpen((prev) => new Set(prev).add(opt.id))}
                      title="Mostrar uma mensagem quando escolherem esta opção"
                      className={`shrink-0 rounded p-1.5 hover:text-brand-600 ${opt.message ? 'text-brand-600' : 'text-slate-300'}`}
                    >
                      <MessageSquareText size={13} />
                    </button>
                    {!isOther && (
                      <button type="button" onClick={() => removeOption(opt.id)} disabled={options.length <= 1} title="Excluir opção" className="shrink-0 rounded p-1.5 text-slate-300 hover:text-red-500 disabled:opacity-30">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  {showMessage && (
                    <div className="ml-5 flex items-start gap-1.5">
                      <Textarea
                        rows={2}
                        autoFocus={messageOpen.has(opt.id) && !opt.message}
                        value={opt.message ?? ''}
                        onChange={(e) => setOptionMessage(opt.id, e.target.value)}
                        placeholder="Mensagem que aparece ao escolher (ex: Perfeito! Nossa equipe vai te chamar no WhatsApp com a proposta.)"
                        className="flex-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setOptionMessage(opt.id, '')
                          setMessageOpen((prev) => {
                            const next = new Set(prev)
                            next.delete(opt.id)
                            return next
                          })
                        }}
                        title="Tirar a mensagem"
                        className="mt-1 rounded p-1 text-slate-300 hover:text-red-500"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            As setas mudam a ordem (o "Outro" também). O balãozinho <MessageSquareText size={10} className="inline" /> mostra uma mensagem na tela quando a opção é escolhida.
          </p>
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

      {q.type === 'fields' && (
        <EditorSection title="Campos desta pergunta" hint="Monte os campos que a pessoa vai preencher (ex: Abre às / Fecha às). Dá pra partir de um modelo pronto.">
          <FieldGroupEditor subfields={q.subfields ?? []} onChange={(next) => onChange({ subfields: next })} />
        </EditorSection>
      )}

      {(q.type === 'short_text' || q.type === 'long_text' || q.type === 'document' || q.type === 'link' || q.type === 'list') && (
        <EditorSection title="Campo de resposta" collapsible defaultOpen={q.type === 'list' || !!q.placeholder}>
          <Field label="Texto de exemplo dentro do campo (opcional)">
            <Input
              value={q.placeholder ?? ''}
              onChange={(e) => onChange({ placeholder: e.target.value })}
              placeholder={q.type === 'link' ? 'Ex: instagram.com/suaempresa' : q.type === 'list' ? 'Ex: Limpeza pós-obra' : q.type === 'document' ? '00.000.000/0000-00' : 'Ex: Escreva aqui'}
            />
          </Field>
          {q.type === 'list' && (
            <Field label="Texto do botão de adicionar">
              <Input value={q.addLabel ?? ''} onChange={(e) => onChange({ addLabel: e.target.value })} placeholder="Adicionar outro" />
            </Field>
          )}
          {q.type === 'document' && <p className="text-xs text-slate-400">Aceita CNPJ ou CPF (quem ainda não tem empresa aberta). A máscara e a checagem dos números são automáticas.</p>}
          {q.type === 'link' && <p className="text-xs text-slate-400">Aceita com ou sem "https://" — o link já vai clicável pra ficha do lead.</p>}
        </EditorSection>
      )}

      {q.type === 'confirm' && (
        <EditorSection title="Caixinha de confirmação">
          <Field label="Texto ao lado da caixinha" required>
            <Input value={q.confirmLabel ?? ''} onChange={(e) => onChange({ confirmLabel: e.target.value })} placeholder="Já enviei as fotos da fachada" />
          </Field>
          <p className="text-xs text-slate-400">Com "Resposta obrigatória" ligado, o lead só continua depois de marcar. Fica registrado na ficha do lead.</p>
        </EditorSection>
      )}

      {q.type === 'file' && (
        <EditorSection title="Pasta do Google Drive" hint="O lead toca no botão, a pasta abre em outra aba, ele envia o arquivo lá e volta pra marcar a caixinha.">
          <Field label="Link da pasta do Drive" required>
            <Input value={q.driveUrl ?? ''} onChange={(e) => onChange({ driveUrl: e.target.value })} placeholder="https://drive.google.com/drive/folders/…" />
          </Field>
          <Field label="Texto do botão">
            <Input value={q.driveButtonLabel ?? ''} onChange={(e) => onChange({ driveButtonLabel: e.target.value })} placeholder={DRIVE_DEFAULTS.driveButtonLabel} />
          </Field>
          <Field label="Texto da caixinha">
            <Input value={q.confirmLabel ?? ''} onChange={(e) => onChange({ confirmLabel: e.target.value })} placeholder={DRIVE_DEFAULTS.confirmLabel} />
          </Field>
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-800">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              No Drive, abra a pasta → <strong>Compartilhar</strong> → em "Acesso geral" escolha <strong>Qualquer pessoa com o link</strong> e mude
              pra <strong>Editor</strong>. Sem isso o cliente não consegue enviar. Ele precisa estar logado numa conta Google pra enviar.
            </span>
          </p>
        </EditorSection>
      )}

      <EditorSection
        title="Botões com link (opcional)"
        hint='Ex: "📁 Enviar fotos no Drive". Aparecem abaixo do texto de apoio e abrem em outra aba — o lead não sai do formulário.'
        collapsible
        defaultOpen={buttons.length > 0}
        badge={buttons.length > 0 ? <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">{buttons.length}</span> : undefined}
      >
        {buttons.map((b, i) => (
          <div key={b.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Botão {i + 1}</span>
              <button type="button" onClick={() => setButtons(buttons.filter((x) => x.id !== b.id))} title="Excluir botão" className="rounded p-1 text-slate-300 hover:text-red-500">
                <Trash2 size={13} />
              </button>
            </div>
            <Field label="Texto do botão">
              <Input value={b.label} onChange={(e) => updateButton(b.id, { label: e.target.value })} placeholder="📁 Enviar fotos no Drive" />
            </Field>
            <Field label="Link">
              <Input value={b.url} onChange={(e) => updateButton(b.id, { url: e.target.value })} placeholder="https://drive.google.com/…" />
            </Field>
            <ButtonAnimationPicker value={b.animation} onChange={(animation) => updateButton(b.id, { animation })} />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setButtons([...buttons, { id: crypto.randomUUID(), label: '', url: '' }])}
          className="flex w-fit items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          <Plus size={12} /> Adicionar botão
        </button>
      </EditorSection>

      <EditorSection title="Dica embaixo da resposta (opcional)" collapsible defaultOpen={!!q.note}>
        <Textarea
          rows={2}
          value={q.note ?? ''}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="Ex: Tire as fotos de dia, de frente e mostrando a placa com o nome da empresa."
        />
      </EditorSection>

      <EditorSection title="Regras">
        <Toggle checked={q.required} onChange={(v) => onChange({ required: v })} label="Resposta obrigatória" hint="O lead não avança sem responder." />
        <Field label="Guardar essa resposta no cadastro do lead como">
          <div className="flex items-center gap-1.5">
            <Select value={q.role ?? ''} onChange={(e) => onChange({ role: (e.target.value || null) as LeadFormFieldRole })} disabled={NO_ROLE_TYPES.has(q.type)}>
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

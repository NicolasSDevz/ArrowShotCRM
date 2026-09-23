import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { createLeadForm, updateLeadForm, slugifyFormName } from '../../services/leadFormService'
import {
  LEAD_FORM_QUESTION_TYPE_LABEL,
  type LeadForm,
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

/** Editor de um formulário de captura de leads: nome/slug do link público,
 *  mensagem de agradecimento e a lista de perguntas (com tipo, obrigatoriedade,
 *  papel — nome/whatsapp/e-mail/empresa alimentam os campos fixos do Lead — e
 *  visibilidade condicional a uma pergunta anterior de escolha). Usado tanto
 *  pra criar (form == null) quanto pra editar um formulário existente. */
export function LeadFormBuilderModal({
  open,
  onClose,
  form,
}: {
  open: boolean
  onClose: () => void
  form?: LeadForm | null
}) {
  const { profile } = useAuth()
  const isEditing = !!form

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [active, setActive] = useState(true)
  const [thankYouMessage, setThankYouMessage] = useState('Obrigado! Recebemos suas informações e vamos entrar em contato em breve.')
  const [questions, setQuestions] = useState<LeadFormQuestion[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (form) {
      setName(form.name)
      setSlug(form.id)
      setSlugTouched(true)
      setActive(form.active)
      setThankYouMessage(form.thankYouMessage)
      setQuestions(form.questions)
    } else {
      setName('')
      setSlug('')
      setSlugTouched(false)
      setActive(true)
      setThankYouMessage('Obrigado! Recebemos suas informações e vamos entrar em contato em breve.')
      setQuestions([])
    }
  }, [open, form])

  const handleNameChange = (v: string) => {
    setName(v)
    if (!slugTouched) setSlug(slugifyFormName(v))
  }

  const usedRoles = new Set(questions.map((q) => q.role).filter((r): r is NonNullable<LeadFormFieldRole> => !!r))
  const hasName = usedRoles.has('name')
  const hasWhatsapp = usedRoles.has('whatsapp')

  const addQuestion = (type: LeadFormQuestionType) => setQuestions((prev) => [...prev, newQuestion(type)])

  const updateQuestion = (id: string, patch: Partial<LeadFormQuestion>) =>
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)))

  const removeQuestion = (id: string) =>
    setQuestions((prev) =>
      prev.filter((q) => q.id !== id).map((q) => (q.condition?.questionId === id ? { ...q, condition: null } : q))
    )

  const moveQuestion = (index: number, dir: -1 | 1) =>
    setQuestions((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

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

  const handleSave = async () => {
    if (!profile) return
    if (!name.trim()) return toast.error('Dê um nome ao formulário')
    if (!slug.trim()) return toast.error('Defina o link do formulário')
    if (!/^[a-z0-9-]+$/.test(slug)) return toast.error('O link só pode ter letras minúsculas, números e hífen')
    if (questions.length === 0) return toast.error('Adicione pelo menos uma pergunta')
    if (questions.some((q) => !q.label.trim())) return toast.error('Toda pergunta precisa de um texto')
    if (questions.some((q) => (q.type === 'single_choice' || q.type === 'multi_choice') && (q.options ?? []).filter((o) => o.label.trim()).length < 2))
      return toast.error('Perguntas de escolha precisam de pelo menos 2 opções preenchidas')
    if (!hasName) return toast.error('Marque uma pergunta como "Nome do lead" — sem isso o lead chega sem nome')
    if (!hasWhatsapp) return toast.error('Marque uma pergunta como "WhatsApp do lead" — é como o time entra em contato')

    setSaving(true)
    try {
      const payload = { name: name.trim(), active, questions, thankYouMessage: thankYouMessage.trim() }
      if (isEditing) {
        await updateLeadForm(form!.id, payload, profile.id)
        toast.success('Formulário atualizado')
      } else {
        const ok = await createLeadForm(slug, payload, profile.id)
        if (!ok) {
          toast.error('Esse link já está em uso — escolha outro')
          setSaving(false)
          return
        }
        toast.success('Formulário criado')
      }
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar o formulário')
    } finally {
      setSaving(false)
    }
  }

  const publicUrl = slug ? `${window.location.origin}/captura/${slug}` : ''

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Editar formulário' : 'Novo formulário de captura'} width="max-w-2xl">
      <div className="flex flex-col gap-4">
        <Field label="Nome interno" required>
          <Input value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Ex: Campanha Black Friday 2026" />
        </Field>

        <Field label="Link público" required>
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-xs text-slate-400">/captura/</span>
            <Input
              value={slug}
              disabled={isEditing}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(slugifyFormName(e.target.value))
              }}
              placeholder="campanha-black-friday"
            />
          </div>
          {isEditing ? (
            <p className="mt-1 text-xs text-slate-400">O link não pode ser alterado depois de criado.</p>
          ) : publicUrl ? (
            <p className="mt-1 truncate text-xs text-slate-400">{publicUrl}</p>
          ) : null}
        </Field>

        <Field label="Mensagem de agradecimento (depois de enviar)">
          <Textarea rows={2} value={thankYouMessage} onChange={(e) => setThankYouMessage(e.target.value)} />
        </Field>

        <label className="flex w-fit items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Formulário ativo (recebe respostas)
        </label>

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

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {isEditing ? 'Salvar alterações' : 'Criar formulário'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

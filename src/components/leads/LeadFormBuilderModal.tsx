import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'
import { Field, Input } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { createLeadForm, updateLeadForm, slugifyFormName } from '../../services/leadFormService'
import { LeadFormQuestionsEditor } from './LeadFormQuestionsEditor'
import { LeadFormDesignEditor } from './LeadFormDesignEditor'
import { LeadFormRenderer } from './LeadFormRenderer'
import type { LeadForm, LeadFormQuestion, LeadFormDesign, LeadFormOutcome, LeadFormFieldRole } from '../../types/leadForm'

const DEFAULT_THANK_YOU = 'Obrigado! Recebemos suas informações e vamos entrar em contato em breve.'

type Tab = 'questions' | 'design'

/** Construtor de um formulário de captura de leads — duas abas (Perguntas,
 *  Design) com um preview ao vivo da página pública ao lado (mesmo
 *  componente que a página real usa, LeadFormRenderer), pra ver o resultado
 *  enquanto edita em vez de só depois de salvar. Usado tanto pra criar
 *  (form == null) quanto pra editar um formulário existente. */
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

  const [tab, setTab] = useState<Tab>('questions')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [active, setActive] = useState(true)
  const [thankYouMessage, setThankYouMessage] = useState(DEFAULT_THANK_YOU)
  const [questions, setQuestions] = useState<LeadFormQuestion[]>([])
  const [design, setDesign] = useState<LeadFormDesign>({})
  const [qualificationQuestionId, setQualificationQuestionId] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<LeadFormOutcome[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTab('questions')
    if (form) {
      setName(form.name)
      setSlug(form.id)
      setSlugTouched(true)
      setActive(form.active)
      setThankYouMessage(form.thankYouMessage)
      setQuestions(form.questions)
      setDesign(form.design ?? {})
      setQualificationQuestionId(form.qualificationQuestionId ?? null)
      setOutcomes(form.outcomes ?? [])
    } else {
      setName('')
      setSlug('')
      setSlugTouched(false)
      setActive(true)
      setThankYouMessage(DEFAULT_THANK_YOU)
      setQuestions([])
      setDesign({})
      setQualificationQuestionId(null)
      setOutcomes([])
    }
  }, [open, form])

  const handleNameChange = (v: string) => {
    setName(v)
    if (!slugTouched) setSlug(slugifyFormName(v))
  }

  const usedRoles = new Set(questions.map((q) => q.role).filter((r): r is NonNullable<LeadFormFieldRole> => !!r))
  const hasName = usedRoles.has('name')
  const hasWhatsapp = usedRoles.has('whatsapp')

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
    if (qualificationQuestionId && outcomes.length === 0) return toast.error('Configure pelo menos uma tela de resultado')

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        active,
        questions,
        thankYouMessage: thankYouMessage.trim() || DEFAULT_THANK_YOU,
        design,
        qualificationQuestionId,
        outcomes,
      }
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

  if (!open) return null

  const publicUrl = slug ? `${window.location.origin}/captura/${slug}` : ''
  const previewForm = { name: name || 'Formulário', questions, thankYouMessage: thankYouMessage || DEFAULT_THANK_YOU, design, outcomes, qualificationQuestionId }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-50 flex h-[96vh] w-full max-w-[1440px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="text-base font-semibold text-slate-800">{isEditing ? 'Editar formulário' : 'Novo formulário de captura'}</div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-full flex-col overflow-hidden lg:w-[56%]">
            <div className="grid grid-cols-1 gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-2">
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
              <label className="flex w-fit items-center gap-2 text-sm text-slate-600 sm:col-span-2">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Formulário ativo (recebe respostas)
              </label>
            </div>

            <div className="flex gap-1 border-b border-slate-100 px-5">
              {(['questions', 'design'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`border-b-2 px-2 py-2.5 text-sm font-medium transition-colors ${
                    tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {t === 'questions' ? 'Perguntas' : 'Design'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {tab === 'questions' ? (
                <LeadFormQuestionsEditor questions={questions} onChange={setQuestions} />
              ) : (
                <LeadFormDesignEditor
                  formId={slug || 'preview'}
                  canUploadImages={!!slug}
                  design={design}
                  onDesignChange={setDesign}
                  questions={questions}
                  qualificationQuestionId={qualificationQuestionId}
                  onQualificationQuestionChange={setQualificationQuestionId}
                  outcomes={outcomes}
                  onOutcomesChange={setOutcomes}
                  thankYouMessage={thankYouMessage}
                  onThankYouMessageChange={setThankYouMessage}
                />
              )}
            </div>
          </div>

          <div className="hidden min-h-0 flex-1 flex-col bg-slate-100 lg:flex">
            <div className="border-b border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Preview ao vivo</div>
            <div className="flex-1 overflow-y-auto">
              <LeadFormRenderer form={previewForm} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {isEditing ? 'Salvar alterações' : 'Criar formulário'}
          </Button>
        </div>
      </div>
    </div>
  )
}

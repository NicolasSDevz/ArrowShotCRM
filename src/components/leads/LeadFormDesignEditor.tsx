import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Upload, X, Plus, Trash2 } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Spinner } from '../ui/FullPageSpinner'
import { uploadLeadFormImage, LEAD_FORM_IMAGE_ACCEPT_ATTR } from '../../services/leadFormAssetService'
import type { LeadFormDesign, LeadFormOutcome, LeadFormQuestion } from '../../types/leadForm'

function ImageUploadField({
  label,
  url,
  formId,
  kind,
  onChange,
}: {
  label: string
  url?: string | null
  formId: string
  kind: 'banner' | 'logo'
  onChange: (url: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const uploadedUrl = await uploadLeadFormImage(formId, kind, file)
      onChange(uploadedUrl)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar imagem')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-slate-500">{label}</span>
      {url ? (
        <div className="flex items-center gap-2">
          <img src={url} alt="" className={kind === 'banner' ? 'h-14 w-24 rounded object-cover' : 'h-14 w-14 rounded-full object-cover'} />
          <button type="button" onClick={() => onChange(null)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-500">
            <X size={12} /> Remover
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-500 hover:border-brand-400 hover:text-brand-600"
        >
          {uploading ? <Spinner className="h-3.5 w-3.5" /> : <Upload size={13} />}
          {uploading ? 'Enviando...' : 'Enviar imagem'}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={LEAD_FORM_IMAGE_ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void handleFile(file)
        }}
      />
    </div>
  )
}

function newOutcome(label: string, isDefault = false): LeadFormOutcome {
  return {
    id: crypto.randomUUID(),
    label,
    message: '',
    matchValues: [],
    isDefault,
  }
}

/** Aba "Design" do construtor: identidade visual da página pública (banner,
 *  foto/logo, título, subtítulo, cores) e as telas de resultado — uma
 *  mensagem única (padrão) ou, quando há uma pergunta de escolha única no
 *  formulário, várias telas roteadas pela resposta dela (ex: "Lead
 *  qualificado" x "Lead padrão"). Upload de imagem só funciona depois que o
 *  link (slug) do formulário está definido, porque o caminho no Storage usa
 *  esse id. */
export function LeadFormDesignEditor({
  formId,
  canUploadImages,
  design,
  onDesignChange,
  questions,
  qualificationQuestionId,
  onQualificationQuestionChange,
  outcomes,
  onOutcomesChange,
  thankYouMessage,
  onThankYouMessageChange,
}: {
  formId: string
  canUploadImages: boolean
  design: LeadFormDesign
  onDesignChange: (next: LeadFormDesign) => void
  questions: LeadFormQuestion[]
  qualificationQuestionId?: string | null
  onQualificationQuestionChange: (id: string | null) => void
  outcomes: LeadFormOutcome[]
  onOutcomesChange: (next: LeadFormOutcome[]) => void
  thankYouMessage: string
  onThankYouMessageChange: (v: string) => void
}) {
  const set = <K extends keyof LeadFormDesign>(key: K, v: LeadFormDesign[K]) => onDesignChange({ ...design, [key]: v })

  const choiceQuestions = questions.filter((q) => q.type === 'single_choice' && q.label.trim())
  const qualificationQuestion = questions.find((q) => q.id === qualificationQuestionId)

  const handleQualificationChange = (id: string) => {
    if (!id) {
      onQualificationQuestionChange(null)
      onOutcomesChange([])
      return
    }
    onQualificationQuestionChange(id)
    if (outcomes.length === 0) {
      onOutcomesChange([newOutcome('Lead padrão', true), newOutcome('Lead qualificado')])
    }
  }

  const updateOutcome = (id: string, patch: Partial<LeadFormOutcome>) =>
    onOutcomesChange(outcomes.map((o) => (o.id === id ? { ...o, ...patch } : o)))

  const setDefaultOutcome = (id: string) => onOutcomesChange(outcomes.map((o) => ({ ...o, isDefault: o.id === id })))

  const removeOutcome = (id: string) => {
    const target = outcomes.find((o) => o.id === id)
    const rest = outcomes.filter((o) => o.id !== id)
    // Sempre precisa sobrar uma tela padrão pra cair de volta.
    if (target?.isDefault && rest.length > 0 && !rest.some((o) => o.isDefault)) rest[0].isDefault = true
    onOutcomesChange(rest)
  }

  const toggleOutcomeValue = (outcomeId: string, optionId: string) => {
    const outcome = outcomes.find((o) => o.id === outcomeId)
    if (!outcome) return
    const has = outcome.matchValues.includes(optionId)
    updateOutcome(outcomeId, { matchValues: has ? outcome.matchValues.filter((v) => v !== optionId) : [...outcome.matchValues, optionId] })
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Identidade visual</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Título da página">
            <Input value={design.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="Usa o nome interno se deixar em branco" />
          </Field>
          <Field label="Subtítulo (opcional)">
            <Input value={design.subtitle ?? ''} onChange={(e) => set('subtitle', e.target.value)} />
          </Field>
        </div>

        {canUploadImages ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ImageUploadField label="Banner (topo da página)" url={design.bannerUrl} formId={formId} kind="banner" onChange={(url) => set('bannerUrl', url)} />
            <ImageUploadField label="Foto / logo" url={design.logoUrl} formId={formId} kind="logo" onChange={(url) => set('logoUrl', url)} />
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-400">Defina o link do formulário na aba anterior pra poder enviar banner e foto.</p>
        )}

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Cor de destaque">
            <div className="flex items-center gap-2">
              <input type="color" value={design.primaryColor || '#2563EB'} onChange={(e) => set('primaryColor', e.target.value)} className="h-[38px] w-12 cursor-pointer rounded border border-slate-200" />
              <span className="text-xs text-slate-400">Botão de envio</span>
            </div>
          </Field>
          <Field label="Cor de fundo">
            <div className="flex items-center gap-2">
              <input type="color" value={design.backgroundColor || '#F8FAFC'} onChange={(e) => set('backgroundColor', e.target.value)} className="h-[38px] w-12 cursor-pointer rounded border border-slate-200" />
              <span className="text-xs text-slate-400">Fundo da página</span>
            </div>
          </Field>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className="mb-2 text-sm font-semibold text-slate-700">Tela de resultado</p>

        {choiceQuestions.length === 0 ? (
          <>
            <p className="mb-2 text-xs text-slate-400">
              Adicione uma pergunta de escolha única na aba Perguntas pra poder mostrar telas diferentes por qualificação (ex: "Lead qualificado" x "Lead padrão").
            </p>
            <Field label="Mensagem de agradecimento (depois de enviar)">
              <Textarea rows={2} value={thankYouMessage} onChange={(e) => onThankYouMessageChange(e.target.value)} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Qualificar pela resposta de">
              <Select value={qualificationQuestionId ?? ''} onChange={(e) => handleQualificationChange(e.target.value)}>
                <option value="">Nenhuma (uma única mensagem pra todo mundo)</option>
                {choiceQuestions.map((q) => (
                  <option key={q.id} value={q.id}>{q.label}</option>
                ))}
              </Select>
            </Field>

            {!qualificationQuestionId ? (
              <Field label="Mensagem de agradecimento (depois de enviar)">
                <Textarea rows={2} value={thankYouMessage} onChange={(e) => onThankYouMessageChange(e.target.value)} />
              </Field>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {outcomes.map((o) => (
                  <div key={o.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center gap-2">
                      <Input value={o.label} onChange={(e) => updateOutcome(o.id, { label: e.target.value })} placeholder="Nome da tela (ex: Lead qualificado)" className="flex-1" />
                      <label className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                        <input type="radio" name="default-outcome" checked={!!o.isDefault} onChange={() => setDefaultOutcome(o.id)} />
                        Padrão
                      </label>
                      {outcomes.length > 1 && (
                        <button type="button" onClick={() => removeOutcome(o.id)} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <Textarea
                      rows={2}
                      value={o.message}
                      onChange={(e) => updateOutcome(o.id, { message: e.target.value })}
                      placeholder="Mensagem mostrada pra quem cai nessa tela"
                      className="mt-2"
                    />
                    {!o.isDefault && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-slate-500">Quando a resposta for</span>
                        {(qualificationQuestion?.options ?? []).map((opt) => {
                          const checked = o.matchValues.includes(opt.id)
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => toggleOutcomeValue(o.id, opt.id)}
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${checked ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}
                            >
                              {opt.label || '(sem texto)'}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onOutcomesChange([...outcomes, newOutcome('Nova tela')])}
                  className="flex w-fit items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  <Plus size={11} /> Adicionar tela de resultado
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Upload, X, Plus, Trash2, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Spinner } from '../ui/FullPageSpinner'
import { uploadLeadFormImage, LEAD_FORM_IMAGE_ACCEPT_ATTR } from '../../services/leadFormAssetService'
import type { LeadFormDesign, LeadFormOutcome, LeadFormQuestion } from '../../types/leadForm'

/** Modelos prontos de cor (fundo + destaque) — um atalho pra quem não quer
 *  escolher cor por cor, sem tirar a opção de personalizar tudo à mão logo
 *  abaixo (os dois seletores de cor continuam livres pra qualquer valor). */
const COLOR_PRESETS: { name: string; backgroundColor: string; primaryColor: string }[] = [
  { name: 'Azul (padrão)', backgroundColor: '#F8FAFC', primaryColor: '#2563EB' },
  { name: 'Verde', backgroundColor: '#F0FDF4', primaryColor: '#16A34A' },
  { name: 'Roxo', backgroundColor: '#FAF5FF', primaryColor: '#9333EA' },
  { name: 'Laranja', backgroundColor: '#FFF7ED', primaryColor: '#EA580C' },
  { name: 'Rosa', backgroundColor: '#FDF2F8', primaryColor: '#DB2777' },
  { name: 'Vermelho', backgroundColor: '#FEF2F2', primaryColor: '#DC2626' },
  { name: 'Cinza', backgroundColor: '#F1F5F9', primaryColor: '#475569' },
  { name: 'Escuro', backgroundColor: '#0F172A', primaryColor: '#38BDF8' },
]

function ColorPresetPicker({ design, onDesignChange }: { design: LeadFormDesign; onDesignChange: (next: LeadFormDesign) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-slate-500">Modelos prontos (clique pra aplicar, depois ajuste à vontade)</span>
      <div className="flex flex-wrap gap-2">
        {COLOR_PRESETS.map((preset) => {
          const active = design.backgroundColor === preset.backgroundColor && design.primaryColor === preset.primaryColor
          return (
            <button
              key={preset.name}
              type="button"
              title={preset.name}
              onClick={() => onDesignChange({ ...design, backgroundColor: preset.backgroundColor, primaryColor: preset.primaryColor })}
              className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 transition-colors ${
                active ? 'border-brand-600' : 'border-slate-200 hover:border-slate-300'
              }`}
              style={{ backgroundColor: preset.backgroundColor }}
            >
              <span className="h-4 w-4 rounded-full" style={{ backgroundColor: preset.primaryColor }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ImageUploadField({
  label,
  url,
  formId,
  assetKey,
  sizeHint,
  onChange,
}: {
  label: string
  url?: string | null
  formId: string
  assetKey: string
  sizeHint: 'banner' | 'logo'
  onChange: (url: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const uploadedUrl = await uploadLeadFormImage(formId, assetKey, file, sizeHint)
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
          <img src={url} alt="" className={sizeHint === 'banner' ? 'h-14 w-24 rounded object-cover' : 'h-14 w-14 rounded-full object-cover'} />
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

function newOutcome(label: string, message: string, isDefault = false): LeadFormOutcome {
  return {
    id: crypto.randomUUID(),
    label,
    message,
    matchValues: [],
    isDefault,
  }
}

function OutcomeDesignPanel({
  outcome,
  formId,
  onChange,
}: {
  outcome: LeadFormOutcome
  formId: string
  onChange: (design: LeadFormDesign) => void
}) {
  const d = outcome.design ?? {}
  const set = <K extends keyof LeadFormDesign>(key: K, v: LeadFormDesign[K]) => onChange({ ...d, [key]: v })

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg bg-slate-50 p-3">
      <Field label="Título nessa tela">
        <Input value={d.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="Usa o título do formulário se deixar em branco" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ImageUploadField label="Banner nessa tela" url={d.bannerUrl} formId={formId} assetKey={`outcome-${outcome.id}-banner`} sizeHint="banner" onChange={(url) => set('bannerUrl', url)} />
        <ImageUploadField label="Foto/logo nessa tela" url={d.logoUrl} formId={formId} assetKey={`outcome-${outcome.id}-logo`} sizeHint="logo" onChange={(url) => set('logoUrl', url)} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Cor de fundo nessa tela">
          <input type="color" value={d.backgroundColor || '#F8FAFC'} onChange={(e) => set('backgroundColor', e.target.value)} className="h-[38px] w-12 cursor-pointer rounded border border-slate-200" />
        </Field>
      </div>
    </div>
  )
}

/** Aba "Design" do construtor: identidade visual da página pública (banner,
 *  foto/logo, título, subtítulo, cores) e as telas de resultado — uma
 *  mensagem única (padrão) ou, quando há uma pergunta de escolha única no
 *  formulário, várias telas roteadas pela resposta dela (ex: "Lead
 *  qualificado" x "Padrão"). Cada tela pode ter seu próprio banner/foto/
 *  cores, além de um link de redirecionamento opcional. Upload de imagem só
 *  funciona depois que o link (slug) do formulário está definido, porque o
 *  caminho no Storage usa esse id. */
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
  const [expandedOutcomeId, setExpandedOutcomeId] = useState<string | null>(null)

  const choiceQuestions = questions.filter((q) => q.type === 'single_choice' && q.label.trim())
  const qualificationQuestion = questions.find((q) => q.id === qualificationQuestionId)

  const handleQualificationChange = (id: string) => {
    if (!id) {
      onQualificationQuestionChange(null)
      onOutcomesChange([])
      return
    }
    onQualificationQuestionChange(id)
    // Só cria a tela padrão — o resto é sempre uma ação explícita do
    // usuário ("+ Adicionar tela de resultado"), pra nunca aparecer nada
    // sem ele ter pedido.
    if (outcomes.length === 0) {
      onOutcomesChange([newOutcome('Padrão', thankYouMessage, true)])
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
        <p className="text-sm font-semibold text-slate-700">Identidade visual da página</p>
        <p className="mb-2 text-xs text-slate-400">Tudo aqui é opcional — sem preencher nada, a página usa o visual padrão que já aparece no preview ao lado.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Título da página">
            <Input value={design.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="Usa o nome interno se deixar em branco" />
          </Field>
          <Field label="Subtítulo (opcional)">
            <Input value={design.subtitle ?? ''} onChange={(e) => set('subtitle', e.target.value)} />
          </Field>
          <Field label="Texto do botão de início">
            <Input value={design.welcomeButtonLabel ?? ''} onChange={(e) => set('welcomeButtonLabel', e.target.value)} placeholder="Começar" />
          </Field>
        </div>

        {canUploadImages ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ImageUploadField label="Banner (topo da página)" url={design.bannerUrl} formId={formId} assetKey="banner" sizeHint="banner" onChange={(url) => set('bannerUrl', url)} />
            <ImageUploadField label="Foto / logo" url={design.logoUrl} formId={formId} assetKey="logo" sizeHint="logo" onChange={(url) => set('logoUrl', url)} />
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-400">Defina o link do formulário na aba anterior pra poder enviar banner e foto.</p>
        )}

        <div className="mt-3">
          <ColorPresetPicker design={design} onDesignChange={onDesignChange} />
        </div>

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
        <p className="text-sm font-semibold text-slate-700">O que o lead vê depois de enviar</p>
        <p className="mb-2 text-xs text-slate-400">
          No mais simples, é uma mensagem só (usa o mesmo banner/cores da página acima). Se quiser diferenciar por
          qualificação — por exemplo, mostrar uma página com um link de WhatsApp pra quem é um bom lead, e uma mensagem
          genérica pros demais — configure uma pergunta de qualificação abaixo.
        </p>

        {choiceQuestions.length === 0 ? (
          <>
            <p className="mb-2 text-xs text-slate-400">
              Adicione uma pergunta de escolha única na aba Perguntas pra poder qualificar (ex: "Lead qualificado" x "Padrão").
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
                <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-2.5 text-xs text-blue-700">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  <p>
                    A tela marcada <strong>"Padrão"</strong> é a que aparece sempre que a resposta do lead não bate com
                    nenhuma outra tela que você configurar — por isso ela vem sozinha, é o fallback. Clique em "+
                    Adicionar tela de resultado" pra criar uma tela específica (ex: "Lead qualificado") e escolher quais
                    respostas levam pra ela.
                  </p>
                </div>

                {outcomes.map((o) => {
                  const expanded = expandedOutcomeId === o.id
                  return (
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

                      <Textarea
                        rows={2}
                        value={o.message}
                        onChange={(e) => updateOutcome(o.id, { message: e.target.value })}
                        placeholder="Mensagem mostrada pra quem cai nessa tela"
                        className="mt-2"
                      />

                      <Field label="Link de redirecionamento (opcional — no lugar da mensagem acima)">
                        <Input
                          value={o.redirectUrl ?? ''}
                          onChange={(e) => updateOutcome(o.id, { redirectUrl: e.target.value || undefined })}
                          placeholder="https://wa.me/5511999999999"
                          className="mt-1"
                        />
                      </Field>

                      <button
                        type="button"
                        onClick={() => setExpandedOutcomeId(expanded ? null : o.id)}
                        className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                      >
                        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        Personalizar banner/foto/cor só desta tela
                      </button>
                      {expanded && (
                        <OutcomeDesignPanel outcome={o} formId={formId} onChange={(d) => updateOutcome(o.id, { design: d })} />
                      )}
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={() => onOutcomesChange([...outcomes, newOutcome('Nova tela', '')])}
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

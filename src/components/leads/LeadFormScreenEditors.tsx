import { Trash2, Info, Flag } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { ColorField, ColorPresetPicker, EditorSection, ImageUploadField, VideoField } from './LeadFormBuilderParts'
import { visibleOptions } from './leadFormMeta'
import type { LeadFormDesign, LeadFormOutcome, LeadFormQuestion } from '../../types/leadForm'

interface DesignEditorProps {
  design: LeadFormDesign
  onDesignChange: (next: LeadFormDesign) => void
  formId: string
  canUpload: boolean
}

/** Editor da tela de início (a primeira que o lead vê, antes das perguntas):
 *  título, descrição, botão, vídeo de apresentação (VSL) e imagens. Os campos
 *  moram em `LeadForm.design` — as telas finais herdam banner/logo daqui. */
export function WelcomeScreenEditor({ design, onDesignChange, formId, canUpload }: DesignEditorProps) {
  const set = <K extends keyof LeadFormDesign>(key: K, v: LeadFormDesign[K]) => onDesignChange({ ...design, [key]: v })
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">Tela de início</p>
        <p className="text-xs text-slate-400">A primeira coisa que o lead vê, antes das perguntas.</p>
      </div>

      <EditorSection title="Textos">
        <Field label="Título">
          <Input value={design.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="Usa o nome interno se deixar em branco" />
        </Field>
        <Field label="Descrição (opcional)">
          <Textarea rows={2} value={design.subtitle ?? ''} onChange={(e) => set('subtitle', e.target.value)} placeholder="Ex: Responda 5 perguntas rápidas e receba seu orçamento" />
        </Field>
        <Field label="Texto do botão">
          <Input value={design.welcomeButtonLabel ?? ''} onChange={(e) => set('welcomeButtonLabel', e.target.value)} placeholder="Começar" />
        </Field>
      </EditorSection>

      <EditorSection title="Vídeo de apresentação (VSL)" hint="Aparece abaixo do título, antes do botão. Deixe em branco pra não usar vídeo.">
        <VideoField label="Link do YouTube" value={design.welcomeVideoUrl} onChange={(v) => set('welcomeVideoUrl', v)} />
      </EditorSection>

      <EditorSection title="Imagens" hint="O banner e a foto também aparecem na tela final (a menos que ela tenha as próprias).">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ImageUploadField label="Banner (topo)" url={design.bannerUrl} formId={formId} assetKey="banner" sizeHint="banner" canUpload={canUpload} onChange={(url) => set('bannerUrl', url)} />
          <ImageUploadField label="Foto / logo" url={design.logoUrl} formId={formId} assetKey="logo" sizeHint="logo" canUpload={canUpload} onChange={(url) => set('logoUrl', url)} />
        </div>
      </EditorSection>
    </div>
  )
}

/** Cores do formulário inteiro — valem pra todas as telas (a tela final pode
 *  trocar só o fundo). */
export function ThemeEditor({ design, onDesignChange }: Pick<DesignEditorProps, 'design' | 'onDesignChange'>) {
  const set = <K extends keyof LeadFormDesign>(key: K, v: LeadFormDesign[K]) => onDesignChange({ ...design, [key]: v })
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">Cores e tema</p>
        <p className="text-xs text-slate-400">Valem pra todas as telas do formulário.</p>
      </div>
      <EditorSection title="Modelos prontos" hint="Clique pra aplicar e depois ajuste as cores abaixo se quiser.">
        <ColorPresetPicker design={design} onDesignChange={onDesignChange} />
      </EditorSection>
      <EditorSection title="Personalizar">
        <ColorField label="Cor de destaque" hint="Botões e barra de progresso" value={design.primaryColor} fallback="#2563EB" onChange={(v) => set('primaryColor', v)} />
        <ColorField label="Cor de fundo" hint="Fundo da página" value={design.backgroundColor} fallback="#F8FAFC" onChange={(v) => set('backgroundColor', v)} />
      </EditorSection>
    </div>
  )
}

/** Editor de tela final. `outcome == null` = a tela única (mensagem de
 *  agradecimento) quando o formulário não separa por qualificação; com
 *  `outcome`, edita uma das telas roteadas pela resposta. */
export function EndScreenEditor({
  outcome,
  outcomes,
  design,
  onDesignChange,
  thankYouMessage,
  onThankYouMessageChange,
  choiceQuestions,
  qualificationQuestion,
  onQualificationChange,
  onOutcomeChange,
  onSetDefault,
  onRemoveOutcome,
  formId,
  canUpload,
}: {
  outcome: LeadFormOutcome | null
  outcomes: LeadFormOutcome[]
  design: LeadFormDesign
  onDesignChange: (next: LeadFormDesign) => void
  thankYouMessage: string
  onThankYouMessageChange: (v: string) => void
  choiceQuestions: LeadFormQuestion[]
  qualificationQuestion?: LeadFormQuestion
  onQualificationChange: (questionId: string) => void
  onOutcomeChange: (patch: Partial<LeadFormOutcome>) => void
  onSetDefault: () => void
  onRemoveOutcome: () => void
  formId: string
  canUpload: boolean
}) {
  const setForm = <K extends keyof LeadFormDesign>(key: K, v: LeadFormDesign[K]) => onDesignChange({ ...design, [key]: v })
  const od = outcome?.design ?? {}
  const setOutcomeDesign = <K extends keyof LeadFormDesign>(key: K, v: LeadFormDesign[K]) => onOutcomeChange({ design: { ...od, [key]: v } })

  const qualificationCard = (
    <EditorSection
      title="Telas finais diferentes por resposta"
      hint="Ex: quem escolheu um serviço que você atende vê uma tela com o botão do WhatsApp; quem escolheu outro vê uma mensagem educada de despedida."
    >
      {choiceQuestions.length === 0 ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 p-2.5 text-xs leading-relaxed text-slate-500">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>Adicione uma pergunta de <strong>escolha única</strong> (ex: "Qual serviço você precisa?") pra poder separar as telas finais pela resposta.</span>
        </p>
      ) : (
        <Field label="Decidir a tela final pela resposta de">
          <Select value={qualificationQuestion?.id ?? ''} onChange={(e) => onQualificationChange(e.target.value)}>
            <option value="">Nenhuma — uma tela final só pra todos</option>
            {choiceQuestions.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </EditorSection>
  )

  if (!outcome) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Flag size={15} className="text-brand-600" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Tela final</p>
            <p className="text-xs text-slate-400">O que o lead vê depois de enviar.</p>
          </div>
        </div>
        <EditorSection title="Mensagem">
          <Textarea rows={3} value={thankYouMessage} onChange={(e) => onThankYouMessageChange(e.target.value)} />
        </EditorSection>
        <EditorSection title="Vídeo (opcional)" hint="Aparece abaixo da mensagem — bom pra explicar os próximos passos.">
          <VideoField label="Link do YouTube" value={design.resultVideoUrl} onChange={(v) => setForm('resultVideoUrl', v)} />
        </EditorSection>
        {qualificationCard}
      </div>
    )
  }

  const matchOptions = qualificationQuestion ? visibleOptions(qualificationQuestion) : []
  const toggleMatch = (optId: string) =>
    onOutcomeChange({ matchValues: outcome.matchValues.includes(optId) ? outcome.matchValues.filter((v) => v !== optId) : [...outcome.matchValues, optId] })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Flag size={15} className="text-brand-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">Tela final: {outcome.label || 'sem nome'}</p>
          <p className="text-xs text-slate-400">O que o lead vê depois de enviar.</p>
        </div>
        {outcomes.length > 1 && (
          <button type="button" onClick={onRemoveOutcome} title="Excluir esta tela" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <EditorSection title="Quando mostrar">
        <Field label="Nome da tela (só você vê)">
          <Input value={outcome.label} onChange={(e) => onOutcomeChange({ label: e.target.value })} placeholder="Ex: Lead qualificado" />
        </Field>
        {outcome.isDefault ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-brand-50 p-2.5 text-xs leading-relaxed text-brand-700">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>Essa é a tela <strong>padrão</strong>: aparece pra todo mundo que não se encaixar em nenhuma das outras telas.</span>
          </p>
        ) : (
          <div>
            <span className="mb-1.5 block text-xs font-medium text-slate-500">
              Mostrar quando a resposta de "{qualificationQuestion?.label}" for (marque uma ou mais)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {matchOptions.map((opt) => {
                const checked = outcome.matchValues.includes(opt.id)
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleMatch(opt.id)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      checked ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            {outcome.matchValues.length === 0 && <p className="mt-1.5 text-xs text-amber-600">Marque pelo menos uma resposta, senão essa tela nunca aparece.</p>}
            <button type="button" onClick={onSetDefault} className="mt-2 text-xs font-medium text-slate-400 underline hover:text-slate-600">
              Tornar essa a tela padrão
            </button>
          </div>
        )}
      </EditorSection>

      <EditorSection title="Mensagem">
        <Textarea rows={3} value={outcome.message} onChange={(e) => onOutcomeChange({ message: e.target.value })} placeholder="Mensagem mostrada pra quem cai nessa tela" />
        <Field label="Ou mandar direto pra um link (no lugar da mensagem)">
          <Input value={outcome.redirectUrl ?? ''} onChange={(e) => onOutcomeChange({ redirectUrl: e.target.value || undefined })} placeholder="https://wa.me/5511999999999" />
        </Field>
      </EditorSection>

      <EditorSection title="Vídeo (opcional)" hint="Em branco = usa o vídeo da tela final geral, se houver.">
        <VideoField label="Link do YouTube" value={od.resultVideoUrl} onChange={(v) => setOutcomeDesign('resultVideoUrl', v)} />
      </EditorSection>

      <EditorSection title="Visual só desta tela (opcional)" hint="Em branco = herda o título, imagens e cor de fundo do formulário.">
        <Field label="Título">
          <Input value={od.title ?? ''} onChange={(e) => setOutcomeDesign('title', e.target.value)} placeholder="Usa o título do formulário se deixar em branco" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ImageUploadField label="Banner" url={od.bannerUrl} formId={formId} assetKey={`outcome-${outcome.id}-banner`} sizeHint="banner" canUpload={canUpload} onChange={(url) => setOutcomeDesign('bannerUrl', url)} />
          <ImageUploadField label="Foto / logo" url={od.logoUrl} formId={formId} assetKey={`outcome-${outcome.id}-logo`} sizeHint="logo" canUpload={canUpload} onChange={(url) => setOutcomeDesign('logoUrl', url)} />
        </div>
        <ColorField label="Cor de fundo" hint="Só nesta tela" value={od.backgroundColor} fallback={design.backgroundColor || '#F8FAFC'} onChange={(v) => setOutcomeDesign('backgroundColor', v)} />
      </EditorSection>

      {qualificationCard}
    </div>
  )
}

import { Trash2, Info, Flag, Plus, ArrowUp, ArrowDown, GitBranch, X as XIcon } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { ColorField, ColorPresetPicker, EditorSection, ImageUploadField, VideoField } from './LeadFormBuilderParts'
import { AlignControl, LeadFormBlocksEditor } from './LeadFormBlocksEditor'
import { isChoiceType, visibleOptions } from './leadFormMeta'
import { outcomeRules } from './leadFormUtils'
import type { LeadFormBlock, LeadFormDesign, LeadFormOutcome, LeadFormOutcomeRule, LeadFormQuestion } from '../../types/leadForm'

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

      <EditorSection title="Alinhamento" hint="Vale pro título, descrição, botão e perguntas.">
        <AlignControl label="Alinhar textos" value={design.textAlign ?? 'left'} onChange={(v) => set('textAlign', v)} />
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
      <EditorSection title="Alinhamento dos textos" hint="Tela de início e perguntas. Nas telas finais cada bloco tem o seu.">
        <AlignControl label="Alinhar textos" value={design.textAlign ?? 'left'} onChange={(v) => set('textAlign', v)} />
      </EditorSection>
      <EditorSection title="Personalizar">
        <ColorField label="Cor de destaque" hint="Botões e barra de progresso" value={design.primaryColor} fallback="#2563EB" onChange={(v) => set('primaryColor', v)} />
        <ColorField label="Cor de fundo" hint="Fundo da página" value={design.backgroundColor} fallback="#F8FAFC" onChange={(v) => set('backgroundColor', v)} />
      </EditorSection>
    </div>
  )
}

/** Editor de tela final. `outcome == null` = a tela única (quando o
 *  formulário não separa por resposta); com `outcome`, edita uma das telas
 *  que são escolhidas pelas respostas do lead (ex: "Lead qualificado" x
 *  "Lead desqualificado") — cada uma tem as próprias regras, e cada regra
 *  olha UMA pergunta de escolha, então dá pra combinar várias perguntas. */
export function EndScreenEditor({
  outcome,
  outcomes,
  design,
  blocks,
  onBlocksChange,
  questions,
  onEnableRouting,
  onDisableRouting,
  onOutcomeChange,
  onSetDefault,
  onMoveOutcome,
  onRemoveOutcome,
  formId,
  canUpload,
}: {
  outcome: LeadFormOutcome | null
  outcomes: LeadFormOutcome[]
  design: LeadFormDesign
  blocks: LeadFormBlock[]
  onBlocksChange: (next: LeadFormBlock[]) => void
  questions: LeadFormQuestion[]
  onEnableRouting: () => void
  onDisableRouting: () => void
  onOutcomeChange: (patch: Partial<LeadFormOutcome>) => void
  onSetDefault: () => void
  onMoveOutcome: (dir: -1 | 1) => void
  onRemoveOutcome: () => void
  formId: string
  canUpload: boolean
}) {
  const od = outcome?.design ?? {}
  const setOutcomeDesign = <K extends keyof LeadFormDesign>(key: K, v: LeadFormDesign[K]) => onOutcomeChange({ design: { ...od, [key]: v } })
  // Qualquer pergunta de escolha (única ou múltipla) com texto pode virar regra.
  const ruleQuestions = questions.filter((q) => isChoiceType(q.type) && q.label.trim())

  const contentSection = (
    <EditorSection title="Conteúdo da tela" hint="Monte a tela bloco a bloco: títulos, textos com quebra de linha, imagens, vídeo e botão com link.">
      <LeadFormBlocksEditor blocks={blocks} onChange={onBlocksChange} formId={formId} canUpload={canUpload} />
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
        {contentSection}
        <EditorSection
          title="Telas finais diferentes por resposta"
          hint={'Ex: "Lead qualificado" vê o botão do WhatsApp e "Lead desqualificado" vê uma mensagem de despedida. Você escolhe quais perguntas e respostas levam a cada tela.'}
        >
          {ruleQuestions.length === 0 ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 p-2.5 text-xs leading-relaxed text-slate-500">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>Adicione pelo menos uma pergunta de <strong>escolha única</strong> ou <strong>múltipla escolha</strong> (com texto) pra poder separar as telas pela resposta.</span>
            </p>
          ) : (
            <button type="button" onClick={onEnableRouting} className="flex w-fit items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700">
              <Plus size={13} /> Criar telas por resposta
            </button>
          )}
        </EditorSection>
      </div>
    )
  }

  const rules = outcomeRules({ qualificationQuestionId: null }, outcome)
  const setRules = (next: LeadFormOutcomeRule[]) => onOutcomeChange({ rules: next, matchValues: [] })
  const updateRule = (i: number, patch: Partial<LeadFormOutcomeRule>) => setRules(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRule = () => {
    const unused = ruleQuestions.find((q) => !rules.some((r) => r.questionId === q.id)) ?? ruleQuestions[0]
    if (unused) setRules([...rules, { questionId: unused.id, values: [] }])
  }
  const toggleRuleValue = (i: number, optId: string) => {
    const r = rules[i]
    updateRule(i, { values: r.values.includes(optId) ? r.values.filter((v) => v !== optId) : [...r.values, optId] })
  }
  const position = outcomes.findIndex((o) => o.id === outcome.id)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <Flag size={15} className="mr-1 shrink-0 text-brand-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">Tela final: {outcome.label || 'sem nome'}</p>
          <p className="text-xs text-slate-400">O que o lead vê depois de enviar.</p>
        </div>
        <button type="button" title="Subir na lista (tem prioridade)" disabled={position <= 0} onClick={() => onMoveOutcome(-1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
          <ArrowUp size={14} />
        </button>
        <button type="button" title="Descer na lista" disabled={position >= outcomes.length - 1} onClick={() => onMoveOutcome(1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
          <ArrowDown size={14} />
        </button>
        {outcomes.length > 1 && (
          <button type="button" onClick={onRemoveOutcome} title="Excluir esta tela" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <EditorSection title="Quando mostrar essa tela">
        <Field label="Nome da tela (só você vê)">
          <Input value={outcome.label} onChange={(e) => onOutcomeChange({ label: e.target.value })} placeholder="Ex: Lead qualificado" />
        </Field>

        {outcome.isDefault ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-brand-50 p-2.5 text-xs leading-relaxed text-brand-700">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>Essa é a tela <strong>padrão</strong>: aparece pra todo mundo que não se encaixar em nenhuma das outras telas. Por isso ela não tem regras.</span>
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <p className="text-xs leading-relaxed text-slate-500">
              Escolha <strong>qual pergunta</strong> e <strong>quais respostas</strong> levam o lead pra essa tela. Dá pra usar várias perguntas.
            </p>

            {rules.map((r, i) => {
              const q = questions.find((x) => x.id === r.questionId)
              const options = q ? visibleOptions(q) : []
              return (
                <div key={i} className="rounded-lg border border-brand-100 bg-brand-50/40 p-2.5">
                  <div className="mb-2 flex items-center gap-1.5">
                    <GitBranch size={13} className="shrink-0 text-brand-600" />
                    <span className="flex-1 text-xs font-semibold text-slate-600">Regra {i + 1}</span>
                    <button type="button" title="Remover regra" onClick={() => setRules(rules.filter((_, idx) => idx !== i))} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500">
                      <XIcon size={13} />
                    </button>
                  </div>
                  <Field label="Olhar a resposta de">
                    <Select value={r.questionId} onChange={(e) => updateRule(i, { questionId: e.target.value, values: [] })}>
                      {!q && (
                        <option value={r.questionId} disabled>
                          ⚠ pergunta removida
                        </option>
                      )}
                      {ruleQuestions.map((rq) => (
                        <option key={rq.id} value={rq.id}>
                          {questions.indexOf(rq) + 1}. {rq.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <span className="mb-1.5 mt-2.5 block text-xs font-medium text-slate-500">Se a resposta for (marque uma ou mais)</span>
                  <div className="flex flex-wrap gap-1.5">
                    {options.map((opt) => {
                      const checked = r.values.includes(opt.id)
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleRuleValue(i, opt.id)}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                            checked ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                  {r.values.length === 0 && <p className="mt-1.5 text-xs text-amber-600">Marque pelo menos uma resposta.</p>}
                </div>
              )
            })}

            <button type="button" onClick={addRule} className="flex w-fit items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
              <Plus size={12} /> {rules.length === 0 ? 'Adicionar regra' : 'Adicionar outra pergunta'}
            </button>

            {rules.length > 1 && (
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-400">Combinar as regras</span>
                <div className="flex rounded-lg bg-slate-100 p-0.5">
                  {(
                    [
                      [false, 'Qualquer uma delas'],
                      [true, 'Todas ao mesmo tempo'],
                    ] as const
                  ).map(([all, label]) => (
                    <button
                      key={String(all)}
                      type="button"
                      onClick={() => onOutcomeChange({ matchAll: all })}
                      className={`h-7 flex-1 rounded-md px-2 text-xs font-semibold transition-colors ${
                        !!outcome.matchAll === all ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  {outcome.matchAll
                    ? 'O lead só vê essa tela se responder como marcado em todas as perguntas.'
                    : 'O lead vê essa tela se responder como marcado em pelo menos uma das perguntas.'}
                </p>
              </div>
            )}

            <p className="text-xs leading-relaxed text-slate-400">
              Se o lead se encaixar em mais de uma tela, vale a que estiver mais acima na lista (use as setinhas). Se não se encaixar em nenhuma, ele vê a tela padrão.
            </p>
            <button type="button" onClick={onSetDefault} className="w-fit text-xs font-medium text-slate-400 underline hover:text-slate-600">
              Tornar essa a tela padrão
            </button>
          </div>
        )}
      </EditorSection>

      {contentSection}

      <EditorSection
        title="Redirecionar automaticamente (opcional)"
        hint="Leva o lead pra outro endereço sozinho. Com 'na hora' o conteúdo acima nem aparece; com um tempo, ele aparece e depois redireciona."
        collapsible
        defaultOpen={!!outcome.redirectUrl}
      >
        <Input value={outcome.redirectUrl ?? ''} onChange={(e) => onOutcomeChange({ redirectUrl: e.target.value || undefined })} placeholder="https://wa.me/5511999999999" />
        {outcome.redirectUrl && (
          <Field label="Quando redirecionar">
            <Select value={String(outcome.redirectDelay ?? 0)} onChange={(e) => onOutcomeChange({ redirectDelay: Number(e.target.value) })}>
              <option value="0">Na hora (sem mostrar o conteúdo)</option>
              <option value="3">Depois de 3 segundos</option>
              <option value="5">Depois de 5 segundos</option>
              <option value="10">Depois de 10 segundos</option>
              <option value="15">Depois de 15 segundos</option>
            </Select>
          </Field>
        )}
      </EditorSection>

      <EditorSection title="Visual só desta tela (opcional)" hint="Em branco = herda as imagens e a cor de fundo do formulário." collapsible>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ImageUploadField label="Banner" url={od.bannerUrl} formId={formId} assetKey={`outcome-${outcome.id}-banner`} sizeHint="banner" canUpload={canUpload} onChange={(url) => setOutcomeDesign('bannerUrl', url)} />
          <ImageUploadField label="Foto / logo" url={od.logoUrl} formId={formId} assetKey={`outcome-${outcome.id}-logo`} sizeHint="logo" canUpload={canUpload} onChange={(url) => setOutcomeDesign('logoUrl', url)} />
        </div>
        <ColorField label="Cor de fundo" hint="Só nesta tela" value={od.backgroundColor} fallback={design.backgroundColor || '#F8FAFC'} onChange={(v) => setOutcomeDesign('backgroundColor', v)} />
      </EditorSection>

      <button type="button" onClick={onDisableRouting} className="w-fit text-xs font-medium text-slate-400 underline hover:text-slate-600">
        Voltar pra uma tela final só, igual pra todo mundo
      </button>
    </div>
  )
}

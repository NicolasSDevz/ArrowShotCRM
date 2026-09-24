import { useState } from 'react'
import { Trash2, Info, Flag, Plus, ArrowUp, ArrowDown, GitBranch } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { ColorField, ColorPresetPicker, EditorSection, ImageUploadField, VideoField } from './LeadFormBuilderParts'
import { AlignControl, LeadFormBlocksEditor } from './LeadFormBlocksEditor'
import { parseMetaPixelId } from '../../utils/metaPixel'
import { isChoiceType, visibleOptions } from './leadFormMeta'
import { outcomeRules } from './leadFormUtils'
import type { LeadFormBlock, LeadFormDesign, LeadFormImageFormat, LeadFormOutcome, LeadFormColors, LeadFormQuestion, LeadFormScreenKey } from '../../types/leadForm'

interface DesignEditorProps {
  design: LeadFormDesign
  onDesignChange: (next: LeadFormDesign) => void
  formId: string
  canUpload: boolean
}

const IMAGE_FORMATS: { key: LeadFormImageFormat; label: string; hint: string; box: string }[] = [
  { key: 'banner', label: 'Banner', hint: 'Faixa larga no topo (3:1)', box: 'h-3 w-9' },
  { key: 'square', label: 'Quadrado', hint: '1:1, no meio da tela', box: 'h-6 w-6' },
  { key: 'post', label: 'Post', hint: '4:5, estilo Instagram', box: 'h-7 w-[22px]' },
  { key: 'original', label: 'Original', hint: 'Do jeito que a imagem é, sem cortar', box: 'h-5 w-8 border-dashed' },
]

/** Escolha do formato da imagem de destaque (+ qual parte aparece quando corta). */
function ImageFormatPicker({ design, onChange }: { design: LeadFormDesign; onChange: (patch: Partial<LeadFormDesign>) => void }) {
  const format = design.bannerFormat ?? 'banner'
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-xs font-medium text-slate-500">Formato da imagem</span>
      <div className="grid grid-cols-4 gap-1.5">
        {IMAGE_FORMATS.map((f) => (
          <button
            key={f.key}
            type="button"
            title={f.hint}
            onClick={() => onChange({ bannerFormat: f.key })}
            className={`flex flex-col items-center gap-1.5 rounded-lg border px-1 py-2 text-[11px] font-medium transition-colors ${
              format === f.key ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            <span className="flex h-7 items-center">
              <span className={`block rounded-sm border-2 ${format === f.key ? 'border-brand-500' : 'border-slate-400'} ${f.box}`} />
            </span>
            {f.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-400">{IMAGE_FORMATS.find((f) => f.key === format)?.hint}</p>
      {format !== 'original' && (
        <AlignControlVertical value={design.bannerFocus ?? 'center'} onChange={(v) => onChange({ bannerFocus: v })} />
      )}
    </div>
  )
}

function AlignControlVertical({ value, onChange }: { value: 'top' | 'center' | 'bottom'; onChange: (v: 'top' | 'center' | 'bottom') => void }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium text-slate-400">Parte da imagem que aparece</span>
      <div className="flex rounded-lg bg-slate-100 p-0.5">
        {(
          [
            ['top', 'Topo'],
            ['center', 'Centro'],
            ['bottom', 'Baixo'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={`h-7 flex-1 rounded-md text-xs font-semibold transition-colors ${value === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  )
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

      <EditorSection title="Alinhamento" hint="Só desta tela de início. As perguntas têm o alinhamento próprio em Cores e tema.">
        <div className="grid grid-cols-2 gap-2">
          <AlignControl label="Textos" value={design.textAlign ?? 'left'} onChange={(v) => set('textAlign', v)} />
          <AlignControl label="Botão" value={design.welcomeButtonAlign ?? design.textAlign ?? 'left'} onChange={(v) => set('welcomeButtonAlign', v)} />
        </div>
      </EditorSection>

      <EditorSection title="Vídeo de apresentação (VSL)" hint="Aparece abaixo do título, antes do botão. Deixe em branco pra não usar vídeo.">
        <VideoField label="Link do YouTube" value={design.welcomeVideoUrl} onChange={(v) => set('welcomeVideoUrl', v)} />
      </EditorSection>

      <EditorSection title="Imagens" hint="O banner e a foto também aparecem na tela final (a menos que ela tenha as próprias).">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ImageUploadField label="Imagem de destaque" url={design.bannerUrl} formId={formId} assetKey="banner" sizeHint="banner" canUpload={canUpload} onChange={(url) => set('bannerUrl', url)} />
          <ImageUploadField label="Foto / logo" url={design.logoUrl} formId={formId} assetKey="logo" sizeHint="logo" canUpload={canUpload} onChange={(url) => set('logoUrl', url)} />
        </div>
        {design.bannerUrl && <ImageFormatPicker design={design} onChange={(patch) => onDesignChange({ ...design, ...patch })} />}
      </EditorSection>
    </div>
  )
}

const COLOR_FIELDS: { key: keyof LeadFormColors; label: string; hint: string; fallback: string }[] = [
  { key: 'backgroundColor', label: 'Fundo da página', hint: 'Atrás do cartão', fallback: '#F8FAFC' },
  { key: 'cardColor', label: 'Fundo do cartão', hint: 'Onde ficam o texto e as perguntas', fallback: '#FFFFFF' },
  { key: 'primaryColor', label: 'Cor dos botões', hint: 'Botões, barra de progresso e opção marcada', fallback: '#2563EB' },
  { key: 'buttonTextColor', label: 'Texto dos botões', hint: 'A cor das letras dentro do botão', fallback: '#FFFFFF' },
  { key: 'textColor', label: 'Cor dos textos', hint: 'Títulos, perguntas e mensagens', fallback: '#0F172A' },
]

const SCREEN_TABS: { key: LeadFormScreenKey; label: string }[] = [
  { key: 'welcome', label: 'Início' },
  { key: 'question', label: 'Perguntas' },
  { key: 'end', label: 'Final' },
]

/** Uma cor que pode "herdar" a geral: mostra a cor em uso e, se não foi
 *  personalizada nesta tela, um botão pra personalizar. */
function OverrideColorField({
  label,
  value,
  inherited,
  onChange,
}: {
  label: string
  value?: string
  inherited: string
  onChange: (v: string | undefined) => void
}) {
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="color"
        value={value || inherited}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 w-11 shrink-0 cursor-pointer rounded border bg-white ${value ? 'border-brand-400' : 'border-slate-200 opacity-60'}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">{value ? 'Personalizada nesta tela' : 'Usando a cor geral — clique na cor pra trocar só aqui'}</p>
      </div>
      {value && (
        <button type="button" onClick={() => onChange(undefined)} className="shrink-0 text-xs font-medium text-slate-400 underline hover:text-slate-600">
          Usar a geral
        </button>
      )}
    </div>
  )
}

/** Cores e tema do formulário: cores gerais (valem pra todas as telas) e,
 *  por cima delas, cores só do Início, das Perguntas ou do Final. Trocar a
 *  aba de tela aqui também muda o preview pra essa tela. */
export function ThemeEditor({
  design,
  onDesignChange,
  onPreviewScreen,
}: Pick<DesignEditorProps, 'design' | 'onDesignChange'> & { onPreviewScreen?: (screen: LeadFormScreenKey) => void }) {
  const set = <K extends keyof LeadFormDesign>(key: K, v: LeadFormDesign[K]) => onDesignChange({ ...design, [key]: v })
  const [screen, setScreen] = useState<LeadFormScreenKey>('welcome')
  const screenColors = design.screenColors?.[screen] ?? {}
  const setScreenColor = (key: keyof LeadFormColors, v: string | undefined) => {
    const next = { ...screenColors, [key]: v }
    if (!v) delete next[key]
    onDesignChange({ ...design, screenColors: { ...design.screenColors, [screen]: next } })
  }
  const customizedCount = (k: LeadFormScreenKey) => Object.values(design.screenColors?.[k] ?? {}).filter(Boolean).length
  const pickScreen = (k: LeadFormScreenKey) => {
    setScreen(k)
    onPreviewScreen?.(k)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">Cores e tema</p>
        <p className="text-xs text-slate-400">Cores gerais do formulário e, se quiser, cores diferentes no início, nas perguntas e no final.</p>
      </div>
      <EditorSection title="Layout" hint="Tela inteira: o formulário ocupa a página toda, sem quadrado (estilo Typeform). Cartão: dentro de um quadro no meio da página.">
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {(
            [
              ['full', 'Tela inteira'],
              ['card', 'Cartão no meio'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => set('layout', k)}
              className={`h-8 flex-1 rounded-md text-xs font-semibold transition-colors ${
                (design.layout ?? 'full') === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </EditorSection>
      <EditorSection title="Modelos prontos" hint="Troca todas as cores de uma vez (e limpa as cores por tela). Depois ajuste o que quiser.">
        <ColorPresetPicker design={design} onDesignChange={onDesignChange} />
      </EditorSection>
      <EditorSection title="Cores gerais" hint="Valem pra todas as telas.">
        {COLOR_FIELDS.filter((f) => f.key !== 'cardColor' || design.layout === 'card').map((f) => (
          <ColorField key={f.key} label={f.label} hint={f.hint} value={design[f.key]} fallback={f.fallback} onChange={(v) => set(f.key, v)} />
        ))}
      </EditorSection>
      <EditorSection title="Cores por tela" hint="Escolha a tela e troque só o que quiser — o resto continua com a cor geral. O preview mostra a tela escolhida.">
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {SCREEN_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => pickScreen(t.key)}
              className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors ${
                screen === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
              {customizedCount(t.key) > 0 && <span className="rounded-full bg-brand-100 px-1.5 text-[10px] text-brand-700">{customizedCount(t.key)}</span>}
            </button>
          ))}
        </div>
        {COLOR_FIELDS.filter((f) => f.key !== 'cardColor' || design.layout === 'card').map((f) => (
          <OverrideColorField
            key={`${screen}-${f.key}`}
            label={f.label}
            value={screenColors[f.key]}
            inherited={design[f.key] || f.fallback}
            onChange={(v) => setScreenColor(f.key, v)}
          />
        ))}
        {screen === 'end' && (
          <p className="text-xs text-slate-400">Cada tela final ainda pode ter a própria cor de fundo em "Visual só desta tela".</p>
        )}
      </EditorSection>
      <EditorSection title="Alinhamento das perguntas" hint="Só das telas de pergunta. A tela de início tem o próprio (em Tela de início) e nas telas finais cada bloco tem o seu.">
        <AlignControl label="Alinhar perguntas" value={design.questionAlign ?? design.textAlign ?? 'left'} onChange={(v) => set('questionAlign', v)} />
      </EditorSection>
    </div>
  )
}

/** Pixel do Meta do formulário: aceita o número ou o código inteiro que o
 *  Meta entrega (a gente extrai o id). */
export function TrackingEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = parseMetaPixelId(value)
  const filled = !!value.trim()
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">Pixel do Meta</p>
        <p className="text-xs text-slate-400">Mede as visitas e os leads deste formulário no Gerenciador de Anúncios do Meta.</p>
      </div>
      <EditorSection title="Código do pixel" hint="Cole o código inteiro que o Meta entrega (o bloco <!-- Meta Pixel Code -->) ou só o número do pixel.">
        <Textarea rows={5} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ex: 1612198150248366 — ou cole o código completo" className="font-mono text-xs" />
        {filled &&
          (id ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">✓ Pixel reconhecido: {id}</p>
          ) : (
            <p className="text-xs font-medium text-amber-600">Não achei o número do pixel nesse texto.</p>
          ))}
        {filled && (
          <button type="button" onClick={() => onChange('')} className="w-fit text-xs font-medium text-slate-400 underline hover:text-slate-600">
            Remover pixel
          </button>
        )}
      </EditorSection>
      <EditorSection title="O que é enviado pro Meta">
        <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-slate-500">
          <li>
            <strong>PageView</strong> quando alguém abre o formulário.
          </li>
          <li>
            <strong>Lead</strong> quando a pessoa envia as respostas — dá pra usar como conversão nas campanhas.
          </li>
          <li>Nada é enviado no preview daqui do construtor, só na página pública.</li>
        </ul>
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
  onOpenRouting,
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
  onOpenRouting: () => void
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
  const questionsInRules = new Set(rules.map((r) => r.questionId))
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

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-slate-500">Respostas que trazem o lead pra cá</span>
          {rules.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">
              {outcome.isDefault ? 'Nenhuma resposta específica.' : 'Nenhuma ainda — essa tela não vai aparecer pra ninguém.'}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {rules.map((r) => {
                const q = questions.find((x) => x.id === r.questionId)
                const opts = q ? visibleOptions(q).filter((o) => r.values.includes(o.id)) : []
                return (
                  <div key={r.questionId} className="rounded-lg border border-slate-200 p-2 text-xs">
                    <p className="mb-1 truncate font-medium text-slate-600">
                      {q ? `${questions.indexOf(q) + 1}. ${q.label}` : 'Pergunta removida'}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {opts.map((o) => (
                        <span key={o.id} className="rounded-full bg-brand-600 px-2 py-0.5 font-medium text-white">
                          {o.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {outcome.isDefault && (
            <p className="flex items-start gap-1.5 rounded-lg bg-brand-50 p-2.5 text-xs leading-relaxed text-brand-700">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>Essa é a tela <strong>padrão</strong>: além das respostas acima, recebe todo mundo que não se encaixar em nenhuma outra tela.</span>
            </p>
          )}
          {questionsInRules.size > 1 && (
            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-400">Quando usa mais de uma pergunta</span>
              <div className="flex rounded-lg bg-slate-100 p-0.5">
                {(
                  [
                    [false, 'Basta uma bater'],
                    [true, 'Todas precisam bater'],
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
            </div>
          )}
          <button type="button" onClick={onOpenRouting} className="flex w-fit items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700">
            <GitBranch size={13} /> Escolher qual resposta vai pra qual tela
          </button>
          {!outcome.isDefault && (
            <button type="button" onClick={onSetDefault} className="w-fit text-xs font-medium text-slate-400 underline hover:text-slate-600">
              Tornar essa a tela padrão
            </button>
          )}
        </div>
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

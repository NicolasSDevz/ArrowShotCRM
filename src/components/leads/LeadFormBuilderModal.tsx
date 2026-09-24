import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { X, Eye, EyeOff, Monitor, Smartphone, RotateCcw, Copy } from 'lucide-react'
import { Input } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { createLeadForm, updateLeadForm, slugifyFormName } from '../../services/leadFormService'
import { parseYouTubeId } from '../../utils/youtube'
import { LeadFormStructureRail } from './LeadFormStructureRail'
import { LeadFormQuestionEditor } from './LeadFormQuestionEditor'
import { EndScreenEditor, ThemeEditor, TrackingEditor, WelcomeScreenEditor } from './LeadFormScreenEditors'
import { parseMetaPixelId } from '../../utils/metaPixel'
import { LeadFormRenderer } from './LeadFormRenderer'
import { FIELD_GROUP_PRESETS } from './leadFormFieldGroups'
import { Toggle } from './LeadFormBuilderParts'
import { conditionProblem, isChoiceType, newQuestion, visibleOptions } from './leadFormMeta'
import { effectiveEndBlocks, normalizeUrl, outcomeRules, setDestination, type BuilderSelection, type LeadFormPreviewScreen } from './leadFormUtils'
import { RoutingEditor } from './LeadFormRoutingEditor'
import type { LeadForm, LeadFormBlock, LeadFormQuestion, LeadFormDesign, LeadFormOutcome, LeadFormFieldRole } from '../../types/leadForm'

const DEFAULT_THANK_YOU = 'Obrigado! Recebemos suas informações e vamos entrar em contato em breve.'

function newOutcome(label: string, message: string, isDefault = false): LeadFormOutcome {
  return { id: crypto.randomUUID(), label, message, matchValues: [], isDefault }
}

/** Telas de formulários antigos guardavam só `matchValues` da pergunta de
 *  qualificação; ao abrir no construtor viram `rules` (uma regra por tela). */
function migrateOutcomes(list: LeadFormOutcome[], legacyQuestionId: string | null): LeadFormOutcome[] {
  return list.map((o) =>
    o.rules
      ? o
      : { ...o, rules: legacyQuestionId && o.matchValues.length > 0 ? [{ questionId: legacyQuestionId, values: o.matchValues }] : [], matchValues: [] }
  )
}

function cloneBlocks(blocks: LeadFormBlock[]): LeadFormBlock[] {
  return blocks.map((b) => ({ ...b, id: crypto.randomUUID() }))
}

/** Tira das regras das telas finais qualquer referência a uma pergunta. */
function pruneRules(list: LeadFormOutcome[], questionId: string): LeadFormOutcome[] {
  return list.map((o) => (o.rules?.some((r) => r.questionId === questionId) ? { ...o, rules: o.rules.filter((r) => r.questionId !== questionId) } : o))
}

function snapshotOf(v: {
  name: string
  active: boolean
  thankYouMessage: string
  questions: LeadFormQuestion[]
  design: LeadFormDesign
  outcomes: LeadFormOutcome[]
  endBlocks?: LeadFormBlock[]
  metaPixelId?: string | null
}) {
  return JSON.stringify(v)
}

/** Construtor de um formulário de captura de leads no estilo YayForms: à
 *  esquerda a lista de telas (início, perguntas, finais, cores), no meio o
 *  preview da tela selecionada e à direita o painel de edição dela. Usado
 *  tanto pra criar (form == null) quanto pra editar um formulário existente.
 *  O preview usa o mesmo componente da página pública (LeadFormRenderer). */
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
  const [thankYouMessage, setThankYouMessage] = useState(DEFAULT_THANK_YOU)
  const [questions, setQuestions] = useState<LeadFormQuestion[]>([])
  const [design, setDesign] = useState<LeadFormDesign>({})
  const [outcomes, setOutcomes] = useState<LeadFormOutcome[]>([])
  const [endBlocks, setEndBlocks] = useState<LeadFormBlock[] | undefined>(undefined)
  const [metaPixelId, setMetaPixelId] = useState('')
  const [saving, setSaving] = useState(false)

  const [selection, setSelection] = useState<BuilderSelection>({ kind: 'welcome' })
  const [showPreview, setShowPreview] = useState(true)
  const [previewMode, setPreviewMode] = useState<'screen' | 'test'>('screen')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [testRun, setTestRun] = useState(0)
  // Tela mostrada no preview enquanto se edita 'Cores e tema' (acompanha a aba Início/Perguntas/Final).
  const [themePreview, setThemePreview] = useState<'welcome' | 'question' | 'end'>('welcome')
  const initialSnapshot = useRef('')
  const editorScrollRef = useRef<HTMLDivElement>(null)
  const selectionKey = selection.kind === 'question' || selection.kind === 'end' ? `${selection.kind}-${selection.id}` : selection.kind

  // Trocar de tela começa o painel de edição sempre do topo.
  useEffect(() => {
    editorScrollRef.current?.scrollTo(0, 0)
    // Ao abrir "Cores e tema" o editor começa na aba Início; o preview acompanha.
    setThemePreview('welcome')
  }, [selectionKey])

  useEffect(() => {
    if (!open) return
    const initial = form
      ? {
          name: form.name,
          active: form.active,
          thankYouMessage: form.thankYouMessage,
          questions: form.questions,
          design: form.design ?? {},
          outcomes: migrateOutcomes(form.outcomes ?? [], form.qualificationQuestionId ?? null),
          endBlocks: form.endBlocks,
          metaPixelId: form.metaPixelId ?? '',
        }
      : { name: '', active: true, thankYouMessage: DEFAULT_THANK_YOU, questions: [], design: {}, outcomes: [], endBlocks: undefined, metaPixelId: '' }
    setName(initial.name)
    setSlug(form ? form.id : '')
    setSlugTouched(!!form)
    setActive(initial.active)
    setThankYouMessage(initial.thankYouMessage)
    setQuestions(initial.questions)
    setDesign(initial.design)
    setOutcomes(initial.outcomes)
    setEndBlocks(initial.endBlocks)
    setMetaPixelId(initial.metaPixelId ?? '')
    setSelection({ kind: 'welcome' })
    setPreviewMode('screen')
    initialSnapshot.current = snapshotOf(initial)
  }, [open, form])

  const dirty =
    open &&
    snapshotOf({ name, active, thankYouMessage, questions, design, outcomes, endBlocks, metaPixelId }) !== initialSnapshot.current

  const requestClose = () => {
    if (dirty && !confirm('Você tem alterações não salvas. Fechar mesmo assim?')) return
    onClose()
  }

  const handleNameChange = (v: string) => {
    setName(v)
    if (!slugTouched) setSlug(slugifyFormName(v))
  }

  // ---------- perguntas ----------

  const collapseToSingleEnd = () => {
    const def = outcomes.find((o) => o.isDefault) ?? outcomes[0]
    if (def?.message.trim()) setThankYouMessage(def.message)
    if (def) setEndBlocks(effectiveEndBlocks({ thankYouMessage: def.message || thankYouMessage, design, endBlocks }, def))
    setOutcomes([])
  }

  const addQuestion = (q: LeadFormQuestion) => {
    setQuestions((prev) => [...prev, q])
    setSelection({ kind: 'question', id: q.id })
  }

  const updateQuestion = (id: string, patch: Partial<LeadFormQuestion>) => {
    setQuestions((prev) => {
      let next = prev.map((q) => (q.id === id ? { ...q, ...patch } : q))
      // Deixou de ser pergunta de escolha: nada mais pode depender das opções dela.
      if (patch.type && !isChoiceType(patch.type)) next = next.map((q) => (q.condition?.questionId === id ? { ...q, condition: null } : q))
      return next
    })
    if (patch.type && !isChoiceType(patch.type)) setOutcomes((prev) => pruneRules(prev, id))
  }

  const removeQuestion = (id: string) => {
    const index = questions.findIndex((q) => q.id === id)
    const rest = questions.filter((q) => q.id !== id).map((q) => (q.condition?.questionId === id ? { ...q, condition: null } : q))
    setQuestions(rest)
    setOutcomes((prev) => pruneRules(prev, id))
    const neighbor = rest[Math.min(index, rest.length - 1)]
    setSelection(neighbor ? { kind: 'question', id: neighbor.id } : { kind: 'welcome' })
  }

  const duplicateQuestion = (id: string) => {
    const index = questions.findIndex((q) => q.id === id)
    if (index === -1) return
    const src = questions[index]
    const copy: LeadFormQuestion = {
      ...src,
      id: crypto.randomUUID(),
      role: null,
      options: src.options?.map((o) => ({ ...o, id: crypto.randomUUID() })),
    }
    setQuestions([...questions.slice(0, index + 1), copy, ...questions.slice(index + 1)])
    setSelection({ kind: 'question', id: copy.id })
  }

  const reorderQuestions = (from: number, to: number) => {
    if (from === to || to < 0 || to >= questions.length) return
    const next = [...questions]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setQuestions(next)
  }

  // ---------- telas finais ----------

  /** Passa de "uma tela final só" pra "telas escolhidas pelas respostas": a
   *  tela única vira a tela Padrão e já nasce uma segunda pra configurar. */
  const enableRouting = () => {
    const def = { ...newOutcome('Padrão', thankYouMessage, true), blocks: effectiveEndBlocks({ thankYouMessage, design, endBlocks }, null), rules: [] }
    // Nasce com o mesmo conteúdo da tela atual (copiado) pra não abrir vazia.
    const extra = { ...newOutcome('Lead qualificado', ''), blocks: cloneBlocks(def.blocks), rules: [] }
    setOutcomes([extra, def])
    setSelection({ kind: 'routing' })
  }

  const disableRouting = () => {
    if (outcomes.length > 1 && !confirm('Isso apaga as telas finais separadas e deixa só uma tela pra todo mundo (fica o conteúdo da tela padrão). Continuar?')) return
    collapseToSingleEnd()
    setSelection({ kind: 'end', id: null })
  }

  const moveOutcome = (id: string, dir: -1 | 1) => {
    const from = outcomes.findIndex((o) => o.id === id)
    const to = from + dir
    if (from < 0 || to < 0 || to >= outcomes.length) return
    const next = [...outcomes]
    ;[next[from], next[to]] = [next[to], next[from]]
    setOutcomes(next)
  }

  const updateOutcome = (id: string, patch: Partial<LeadFormOutcome>) => setOutcomes((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))

  const addOutcome = () => {
    const base = outcomes.find((x) => x.isDefault) ?? outcomes[0]
    const o = { ...newOutcome('Nova tela', ''), blocks: cloneBlocks(effectiveEndBlocks({ thankYouMessage, design, endBlocks }, base ?? null)), rules: [] }
    setOutcomes((prev) => [...prev, o])
    setSelection({ kind: 'end', id: o.id })
  }

  const setDefaultOutcome = (id: string) => setOutcomes((prev) => prev.map((o) => ({ ...o, isDefault: o.id === id })))

  const removeOutcome = (id: string) => {
    const rest = outcomes.filter((o) => o.id !== id)
    // Sempre precisa sobrar uma tela padrão pra cair de volta.
    if (rest.length > 0 && !rest.some((o) => o.isDefault)) rest[0] = { ...rest[0], isDefault: true }
    setOutcomes(rest)
    setSelection({ kind: 'end', id: (rest.find((o) => o.isDefault) ?? rest[0])?.id ?? null })
  }

  // ---------- salvar ----------

  const usedRoles = new Set(questions.map((q) => q.role).filter((r): r is NonNullable<LeadFormFieldRole> => !!r))

  const handleSave = async () => {
    if (!profile) return
    const fail = (message: string, sel?: BuilderSelection) => {
      toast.error(message)
      if (sel) setSelection(sel)
    }
    if (!name.trim()) return fail('Dê um nome ao formulário')
    if (!slug.trim()) return fail('Defina o link do formulário')
    if (!/^[a-z0-9-]+$/.test(slug)) return fail('O link só pode ter letras minúsculas, números e hífen')
    if (questions.length === 0) return fail('Adicione pelo menos uma pergunta')

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const sel: BuilderSelection = { kind: 'question', id: q.id }
      if (!q.label.trim()) return fail(`A pergunta ${i + 1} está sem texto`, sel)
      if (isChoiceType(q.type) && visibleOptions(q).length < 2) return fail(`A pergunta ${i + 1} precisa de pelo menos 2 opções (o "Outro" conta)`, sel)
      if (q.type === 'fields' && ((q.subfields ?? []).length === 0 || (q.subfields ?? []).some((f) => !f.label.trim())))
        return fail(`A pergunta ${i + 1} precisa de pelo menos 1 campo, e todo campo precisa de um nome`, sel)
      const problem = conditionProblem(q, i, questions)
      if (problem) return fail(`Pergunta ${i + 1}: ${problem}`, sel)
    }
    if (metaPixelId.trim() && !parseMetaPixelId(metaPixelId)) return fail('Não reconheci o pixel do Meta — cole o número do pixel ou o código inteiro', { kind: 'tracking' })
    if (!usedRoles.has('name')) return fail('Marque uma pergunta como "Nome do lead" — sem isso o lead chega sem nome')
    if (!usedRoles.has('whatsapp')) return fail('Marque uma pergunta como "WhatsApp do lead" — é como o time entra em contato')

    const badVideo = (url?: string) => !!url?.trim() && !parseYouTubeId(url)
    if (badVideo(design.welcomeVideoUrl)) return fail('O link do vídeo da tela de início não é um link válido do YouTube', { kind: 'welcome' })
    if (badVideo(design.resultVideoUrl)) return fail('O link do vídeo da tela final não é um link válido do YouTube', { kind: 'end', id: null })

    if (outcomes.length > 0) {
      for (const o of outcomes) {
        const sel: BuilderSelection = { kind: 'end', id: o.id }
        const name = o.label || 'sem nome'
        const rules = outcomeRules({ qualificationQuestionId: null }, o)
        if (!o.isDefault) {
          if (rules.length === 0) return fail(`Nenhuma resposta leva pra tela final "${name}" — escolha em "Qual resposta vai pra qual tela"`, { kind: 'routing' })
        }
        for (const r of rules) {
          const rq = questions.find((q) => q.id === r.questionId)
          if (!rq || !isChoiceType(rq.type)) return fail(`A tela final "${name}" usa uma pergunta que não existe mais`, { kind: 'routing' })
        }
        if (badVideo(o.design?.resultVideoUrl)) return fail(`O link do vídeo da tela final "${name}" não é válido`, sel)
      }
      if (!outcomes.some((o) => o.isDefault)) return fail('Uma das telas finais precisa ser a padrão')
    }

    const checkBlocks = (blocks: LeadFormBlock[] | undefined, sel: BuilderSelection, where: string) => {
      for (const b of blocks ?? []) {
        if (b.type === 'button' && (!b.label?.trim() || !normalizeUrl(b.url))) return fail(`${where}: o botão precisa de um texto e de um link válido`, sel)
        if (b.type === 'image' && !b.url) return fail(`${where}: tem um bloco de imagem sem imagem`, sel)
        if (b.type === 'video' && !parseYouTubeId(b.url)) return fail(`${where}: o bloco de vídeo precisa de um link válido do YouTube`, sel)
      }
      return null
    }
    if (outcomes.length === 0 && checkBlocks(endBlocks, { kind: 'end', id: null }, 'Tela final') !== null) return
    for (const o of outcomes) {
      if (checkBlocks(o.blocks, { kind: 'end', id: o.id }, `Tela final "${o.label || 'sem nome'}"`) !== null) return
    }

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        active,
        questions: questions.map((q) =>
          isChoiceType(q.type)
            ? { ...q, label: q.label.trim(), options: (q.options ?? []).filter((o) => o.label.trim()) }
            : {
                ...q,
                label: q.label.trim(),
                options: undefined,
                allowOther: undefined,
                otherLabel: undefined,
                otherPrompt: undefined,
                subfields: q.type === 'fields' ? (q.subfields ?? []).map((f) => ({ ...f, label: f.label.trim() })) : undefined,
              }
        ),
        thankYouMessage: thankYouMessage.trim() || DEFAULT_THANK_YOU,
        design,
        // Legado: as regras agora ficam em cada tela final (outcome.rules).
        qualificationQuestionId: null,
        outcomes,
        endBlocks: outcomes.length > 0 ? undefined : endBlocks,
        metaPixelId: parseMetaPixelId(metaPixelId),
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
      initialSnapshot.current = snapshotOf({ name, active, thankYouMessage, questions, design, outcomes, endBlocks, metaPixelId })
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar o formulário')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  // ---------- seleção normalizada (nunca aponta pra algo que não existe mais) ----------

  const sel: BuilderSelection = (() => {
    if (selection.kind === 'question') return questions.some((q) => q.id === selection.id) ? selection : { kind: 'welcome' }
    if (selection.kind === 'end') {
      if (outcomes.length === 0) return { kind: 'end', id: null }
      const found = outcomes.find((o) => o.id === selection.id) ?? outcomes.find((o) => o.isDefault) ?? outcomes[0]
      return { kind: 'end', id: found?.id ?? null }
    }
    return selection
  })()

  const selectedQuestionIndex = sel.kind === 'question' ? questions.findIndex((q) => q.id === sel.id) : -1
  const selectedOutcome = sel.kind === 'end' && sel.id ? outcomes.find((o) => o.id === sel.id) ?? null : null
  const canUpload = !!slug

  const previewScreen: LeadFormPreviewScreen | null =
    previewMode === 'test'
      ? null
      : sel.kind === 'question'
        ? { kind: 'question', questionId: sel.id }
        : sel.kind === 'end'
          ? { kind: 'end', outcomeId: sel.id }
          : sel.kind === 'theme' && themePreview === 'question' && questions.length > 0
            ? { kind: 'question', questionId: questions[0].id }
            : sel.kind === 'theme' && themePreview === 'end'
              ? { kind: 'end', outcomeId: null }
              : { kind: 'welcome' }

  const publicUrl = slug ? `${window.location.origin}/captura/${slug}` : ''
  const previewForm = {
    name: name || 'Formulário',
    questions,
    thankYouMessage: thankYouMessage || DEFAULT_THANK_YOU,
    design,
    outcomes,
    qualificationQuestionId: null,
    endBlocks,
  }

  const copyLink = () =>
    navigator.clipboard.writeText(publicUrl).then(
      () => toast.success('Link copiado'),
      () => toast.error('Não foi possível copiar')
    )

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/30" onClick={requestClose} />
      <div className="relative z-50 flex h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Topo: identificação do formulário + salvar, sempre visível */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3">
          <div className="shrink-0 text-sm font-semibold text-slate-800">{isEditing ? 'Editar formulário' : 'Novo formulário'}</div>
          <div className="w-[230px] max-w-full">
            <Input value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Nome interno (ex: Campanha Black Friday)" aria-label="Nome interno" />
          </div>
          <div className="flex w-[290px] max-w-full items-center gap-1.5">
            <span className="shrink-0 text-xs text-slate-400">/captura/</span>
            <Input
              value={slug}
              disabled={isEditing}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(slugifyFormName(e.target.value))
              }}
              placeholder="campanha-black-friday"
              aria-label="Link público"
              title={isEditing ? 'O link não pode ser alterado depois de criado' : undefined}
            />
            {isEditing && (
              <button type="button" onClick={copyLink} title="Copiar link" className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <Copy size={14} />
              </button>
            )}
          </div>
          <div className="w-[190px] shrink-0">
            <Toggle checked={active} onChange={setActive} label={active ? 'Ativo' : 'Pausado'} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              title={showPreview ? 'Esconder o preview pra ter mais espaço' : 'Mostrar o preview'}
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 lg:flex"
            >
              {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
              {showPreview ? 'Esconder preview' : 'Mostrar preview'}
            </button>
            <Button variant="secondary" onClick={requestClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {isEditing ? 'Salvar alterações' : 'Criar formulário'}
            </Button>
            <button onClick={requestClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar">
              <X size={18} />
            </button>
          </div>
        </div>
        {!isEditing && slug && <p className="border-b border-slate-100 bg-slate-50 px-4 py-1 text-[11px] text-slate-400">Link do formulário: {publicUrl}</p>}

        <div className="flex min-h-0 flex-1">
          <aside className="w-[210px] shrink-0 border-r border-slate-100 bg-slate-50/70 lg:w-[250px]">
            <LeadFormStructureRail
              questions={questions}
              outcomes={outcomes}
              hasRouting={outcomes.length > 0}
              onEnableRouting={enableRouting}
              selection={sel}
              onSelect={setSelection}
              onAddQuestion={(type) => addQuestion(newQuestion(type))}
              onAddFieldsPreset={(key) => {
                const preset = FIELD_GROUP_PRESETS.find((p) => p.key === key)
                if (preset) addQuestion(newQuestion('fields', { label: preset.question, subfields: preset.make() }))
              }}
              onAddLeadField={(p) => addQuestion(newQuestion(p.type, { label: p.label, role: p.role, required: p.required }))}
              onReorder={reorderQuestions}
              onAddOutcome={addOutcome}
            />
          </aside>

          {showPreview && (
            <div className="hidden min-w-0 flex-1 flex-col bg-slate-100 lg:flex">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
                <div className="flex rounded-lg bg-white p-0.5 text-xs font-medium shadow-sm ring-1 ring-slate-200">
                  {(
                    [
                      ['screen', 'Tela selecionada'],
                      ['test', 'Testar o formulário'],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setPreviewMode(mode)
                        setTestRun((n) => n + 1)
                      }}
                      className={`rounded-md px-2.5 py-1 transition-colors ${previewMode === mode ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {previewMode === 'test' && (
                  <button type="button" onClick={() => setTestRun((n) => n + 1)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white">
                    <RotateCcw size={12} /> Recomeçar
                  </button>
                )}
                <div className="ml-auto flex rounded-lg bg-white p-0.5 shadow-sm ring-1 ring-slate-200">
                  {(
                    [
                      ['desktop', <Monitor key="d" size={14} />, 'Computador'],
                      ['mobile', <Smartphone key="m" size={14} />, 'Celular'],
                    ] as const
                  ).map(([d, icon, title]) => (
                    <button
                      key={d}
                      type="button"
                      title={title}
                      onClick={() => setDevice(d)}
                      className={`rounded-md px-2 py-1 transition-colors ${device === d ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col p-3">
                <div className={`mx-auto min-h-0 w-full flex-1 overflow-y-auto rounded-xl shadow-md ring-1 ring-slate-300 ${device === 'mobile' ? 'max-w-[390px]' : ''}`}>
                  <LeadFormRenderer key={`${previewMode}-${testRun}`} form={previewForm} previewScreen={previewScreen} />
                </div>
              </div>
            </div>
          )}

          <div ref={editorScrollRef} className={`min-w-0 overflow-y-auto border-l border-slate-100 bg-white ${showPreview ? 'flex-1 lg:w-[400px] lg:flex-none' : 'flex-1'}`}>
            <div className={`p-4 ${showPreview ? '' : 'mx-auto max-w-2xl'}`}>
              {sel.kind === 'welcome' && <WelcomeScreenEditor design={design} onDesignChange={setDesign} formId={slug || 'preview'} canUpload={canUpload} />}
              {sel.kind === 'tracking' && <TrackingEditor value={metaPixelId} onChange={setMetaPixelId} />}
              {sel.kind === 'theme' && <ThemeEditor design={design} onDesignChange={setDesign} onPreviewScreen={setThemePreview} />}
              {sel.kind === 'question' && selectedQuestionIndex >= 0 && (
                <LeadFormQuestionEditor
                  key={sel.id}
                  question={questions[selectedQuestionIndex]}
                  index={selectedQuestionIndex}
                  questions={questions}
                  formId={slug || 'preview'}
                  canUpload={canUpload}
                  onChange={(patch) => updateQuestion(sel.id, patch)}
                  onDelete={() => removeQuestion(sel.id)}
                  onDuplicate={() => duplicateQuestion(sel.id)}
                />
              )}
              {sel.kind === 'routing' && (
                <RoutingEditor
                  questions={questions}
                  outcomes={outcomes}
                  onSetDestination={(qid, optId, outcomeId) => setOutcomes((prev) => setDestination(prev, qid, optId, outcomeId))}
                  onMoveOutcome={moveOutcome}
                  onSetDefault={setDefaultOutcome}
                  onOpenOutcome={(id) => setSelection({ kind: 'end', id })}
                  onEnableRouting={enableRouting}
                />
              )}
              {sel.kind === 'end' && (
                <EndScreenEditor
                  key={sel.id ?? 'single'}
                  outcome={selectedOutcome}
                  outcomes={outcomes}
                  design={design}
                  blocks={effectiveEndBlocks({ thankYouMessage, design, endBlocks }, selectedOutcome)}
                  onBlocksChange={(next) => (selectedOutcome ? updateOutcome(selectedOutcome.id, { blocks: next }) : setEndBlocks(next))}
                  questions={questions}
                  onEnableRouting={enableRouting}
                  onDisableRouting={disableRouting}
                  onMoveOutcome={(dir) => selectedOutcome && moveOutcome(selectedOutcome.id, dir)}
                  onOutcomeChange={(patch) => selectedOutcome && updateOutcome(selectedOutcome.id, patch)}
                  onSetDefault={() => selectedOutcome && setDefaultOutcome(selectedOutcome.id)}
                  onRemoveOutcome={() => selectedOutcome && removeOutcome(selectedOutcome.id)}
                  onOpenRouting={() => setSelection({ kind: 'routing' })}
                  formId={slug || 'preview'}
                  canUpload={canUpload}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

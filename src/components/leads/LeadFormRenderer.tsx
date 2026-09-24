import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Send } from 'lucide-react'
import { Spinner } from '../ui/FullPageSpinner'
import { trackLeadFormEvent } from '../../services/leadFormAnalyticsService'
import { ADDRESS_PARTS, ADDRESS_REQUIRED_PARTS, OTHER_OPTION_ID, type AddressPart, type LeadFormAlign, type LeadFormQuestion } from '../../types/leadForm'
import { AddressQuestionField } from './AddressQuestionField'
import { FieldGroupQuestionField } from './FieldGroupQuestionField'
import { invalidSubfields, missingSubfields } from './leadFormFieldGroups'
import { contactError, type ContactKind } from '../../utils/validation'
import { maskPhone } from '../../utils/masks'
import { JUSTIFY_CLASS, LeadFormBlocksView, TEXT_ALIGN_CLASS, VideoEmbed } from './LeadFormBlocksView'
import {
  effectiveEndBlocks,
  visibleQuestionsOf,
  mergeDesign,
  normalizeUrl,
  resolveTheme,
  type LeadFormTheme,
  resolveOutcome,
  type LeadFormAnswers,
  type LeadFormContent,
  type LeadFormPreviewScreen,
} from './leadFormUtils'

type Phase = 'welcome' | 'question' | 'submitting' | 'done'
type FieldError = 'required' | 'other' | 'invalid'

/** Renderiza a página de um formulário de captura no estilo Typeform/
 *  YayForms — uma tela de boas-vindas, depois uma pergunta por tela (com
 *  barra de progresso, voltar/avançar, avanço automático em escolha única e
 *  Enter pra avançar em campos de texto), e por fim a tela de resultado
 *  (thankYouMessage ou uma das `outcomes`). Componente único usado tanto
 *  pela página pública real (LeadCapturePage, com `formId`+`onSubmitted`
 *  gravando no Firestore e registrando analytics) quanto pelo preview ao
 *  vivo do construtor (sem `onSubmitted` — nada é salvo nem rastreado) —
 *  garante que o preview nunca fique visualmente diferente do que o lead
 *  realmente vê. No construtor, `previewScreen` fixa a tela mostrada (a que
 *  está selecionada na lista); sem ele o fluxo roda normalmente. */
export function LeadFormRenderer({
  form,
  formId,
  onSubmitted,
  fillViewport = false,
  previewScreen = null,
}: {
  form: LeadFormContent
  /** Id real do formulário (slug da URL) — só usado pra registrar
   *  analytics; ausente no preview do construtor (formulário ainda não
   *  salvo), o que já basta pra desligar o rastreamento ali. */
  formId?: string
  onSubmitted?: (answers: LeadFormAnswers, otherTexts: Record<string, string>) => Promise<void>
  /** true na página pública real (ocupa a tela toda via 100vh); false (padrão)
   *  no preview do construtor, onde o componente pai já define a altura. */
  fillViewport?: boolean
  previewScreen?: LeadFormPreviewScreen | null
}) {
  const isTracking = !!onSubmitted && !!formId
  const forced = previewScreen
  const [sessionId] = useState(() => crypto.randomUUID())
  const [phase, setPhase] = useState<Phase>('welcome')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<LeadFormAnswers>({})
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, FieldError | undefined>>({})
  const startedAtRef = useRef<number | null>(null)
  const seenQuestionsRef = useRef<Set<string>>(new Set())
  // Trava contra envio duplicado (duplo clique, Enter + clique, avanço automático).
  const submittingRef = useRef(false)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [submitError, setSubmitError] = useState(false)

  useEffect(() => {
    if (isTracking) trackLeadFormEvent(formId!, sessionId, 'view')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // No preview fixado todas as perguntas contam (a lógica condicional depende
  // de respostas que ainda não existem), no fluxo real só as visíveis.
  const visibleQuestions = forced ? form.questions : visibleQuestionsOf(form.questions, answers)
  const shownPhase: Phase = forced ? (forced.kind === 'welcome' ? 'welcome' : forced.kind === 'question' ? 'question' : 'done') : phase
  const questionIndex =
    forced?.kind === 'question' ? Math.max(0, form.questions.findIndex((q) => q.id === forced.questionId)) : currentIndex
  const currentQuestion = shownPhase === 'question' || shownPhase === 'submitting' ? visibleQuestions[questionIndex] : undefined

  useEffect(() => {
    if (!currentQuestion || !isTracking) return
    if (seenQuestionsRef.current.has(currentQuestion.id)) return
    seenQuestionsRef.current.add(currentQuestion.id)
    trackLeadFormEvent(formId!, sessionId, 'question_view', { questionId: currentQuestion.id, stepIndex: currentIndex })
  }, [currentQuestion, currentIndex, isTracking, formId, sessionId])

  const setAnswer = (id: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [id]: value }))
    setErrors((prev) => ({ ...prev, [id]: undefined }))
  }

  const toggleMultiOption = (q: LeadFormQuestion, optId: string) => {
    const current = (answers[q.id] as string[] | undefined) ?? []
    setAnswer(q.id, current.includes(optId) ? current.filter((v) => v !== optId) : [...current, optId])
  }

  const handleSubmit = async () => {
    if (!onSubmitted) {
      // Preview do construtor — sem gravação nenhuma.
      setPhase('done')
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitError(false)
    setPhase('submitting')
    try {
      const visibleIds = new Set(visibleQuestions.map((q) => q.id))
      const payload: LeadFormAnswers = {}
      for (const [id, value] of Object.entries(answers)) {
        if (visibleIds.has(id)) payload[id] = value
      }
      await onSubmitted(payload, otherTexts)
      if (isTracking) {
        const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : undefined
        trackLeadFormEvent(formId!, sessionId, 'submit', { durationMs })
      }
      setPhase('done')
    } catch (err) {
      console.error(err)
      submittingRef.current = false
      setSubmitError(true)
      setPhase('question')
    }
  }

  const handleNextRef = useRef<() => void>(() => {})
  const goNext = () => {
    if (forced || submittingRef.current) return
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
    const q = currentQuestion
    if (q) {
      const v = answers[q.id]
      const empty =
        q.type === 'fields'
          ? missingSubfields(q, Array.isArray(v) ? v : []).length > 0
          : q.type === 'address'
          ? !Array.isArray(v) || ADDRESS_REQUIRED_PARTS.some((p) => !(v[ADDRESS_PARTS.indexOf(p as AddressPart)] ?? '').trim())
          : v === undefined || (Array.isArray(v) ? v.length === 0 : !v.trim())
      if ((q.required || q.type === 'fields') && empty) {
        setErrors((prev) => ({ ...prev, [q.id]: 'required' }))
        return
      }
      // WhatsApp/e-mail preenchido errado (pela pergunta ou pelo campo do lead que ela alimenta).
      const kind = contactKindOf(q)
      if (kind && typeof v === 'string' && contactError(kind, v)) {
        setErrors((prev) => ({ ...prev, [q.id]: 'invalid' }))
        return
      }
      if (q.type === 'fields' && invalidSubfields(q, Array.isArray(v) ? v : []).length > 0) {
        setErrors((prev) => ({ ...prev, [q.id]: 'invalid' }))
        return
      }
      // Marcou "Outro" mas não disse o quê — sem isso o time não tem como
      // saber se o lead ainda se enquadra.
      const pickedOther = Array.isArray(v) ? v.includes(OTHER_OPTION_ID) : v === OTHER_OPTION_ID
      if (pickedOther && !otherTexts[q.id]?.trim()) {
        setErrors((prev) => ({ ...prev, [q.id]: 'other' }))
        return
      }
    }
    if (currentIndex >= visibleQuestions.length - 1) {
      void handleSubmit()
    } else {
      setCurrentIndex((i) => i + 1)
    }
  }
  handleNextRef.current = goNext

  const goBack = () => {
    if (forced) return
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
    setCurrentIndex((i) => Math.max(0, i - 1))
  }

  useEffect(() => () => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
  }, [])

  const handleStart = () => {
    if (forced) return
    startedAtRef.current = Date.now()
    if (isTracking) trackLeadFormEvent(formId!, sessionId, 'start')
    setPhase('question')
    setCurrentIndex(0)
  }

  const handleAnswerChange = (q: LeadFormQuestion, v: string | string[]) => {
    setAnswer(q.id, v)
    if (q.type === 'single_choice' && !forced && v !== OTHER_OPTION_ID && form.design?.autoAdvance) {
      // Avanço automático estilo Typeform — dá um respiro visual pra
      // mostrar a opção marcada antes de trocar de tela.
      // Clicou em outra opção logo em seguida: só um avanço (senão pula a próxima pergunta).
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = setTimeout(() => {
        advanceTimerRef.current = null
        handleNextRef.current()
      }, 300)
    }
  }

  const handleOtherText = (q: LeadFormQuestion, text: string) => {
    setOtherTexts((prev) => ({ ...prev, [q.id]: text }))
    setErrors((prev) => ({ ...prev, [q.id]: undefined }))
  }

  const formDesign = form.design ?? {}
  // Resposta de pergunta que acabou pulada (lógica condicional) não conta.
  const visibleAnswers = Object.fromEntries(Object.entries(answers).filter(([id]) => visibleQuestions.some((q) => q.id === id)))
  const matchedOutcome =
    shownPhase !== 'done'
      ? null
      : forced?.kind === 'end' && forced.outcomeId
        ? (form.outcomes ?? []).find((o) => o.id === forced.outcomeId) ?? resolveOutcome(form, {})
        : resolveOutcome(form, forced ? {} : visibleAnswers)
  // A tela de resultado herda o Design do formulário e só sobrescreve o que
  // a tela em si define — assim ela não precisa repetir banner/cor se não
  // quiser mudar nada.
  const design = shownPhase === 'done' ? mergeDesign(formDesign, matchedOutcome?.design) : formDesign
  // O conteúdo da tela final é uma pilha de blocos própria dela — nunca herda
  // o título da tela de início (senão a frase de abertura reaparece no fim).
  const endBlocks = shownPhase === 'done' ? effectiveEndBlocks({ thankYouMessage: form.thankYouMessage, design: form.design, endBlocks: form.endBlocks }, matchedOutcome) : []
  const theme = resolveTheme(
    formDesign,
    shownPhase === 'welcome' ? 'welcome' : shownPhase === 'done' ? 'end' : 'question',
    shownPhase === 'done' ? matchedOutcome?.design : undefined
  )
  const primaryColor = theme.primary
  const backgroundColor = theme.page
  // Texto principal e secundário (o secundário é o mesmo com transparência).
  const textStyle = theme.text ? { color: theme.text } : undefined
  const mutedStyle = theme.text ? { color: theme.text, opacity: 0.7 } : undefined
  const isLast = questionIndex >= visibleQuestions.length - 1
  // Cada parte com o seu alinhamento: textos do início, botão do início e perguntas.
  const welcomeAlign: LeadFormAlign = formDesign.textAlign ?? 'left'
  const align: LeadFormAlign = formDesign.questionAlign ?? welcomeAlign
  const alignText = TEXT_ALIGN_CLASS[welcomeAlign]
  const alignFlex = JUSTIFY_CLASS[welcomeAlign]
  const buttonFlex = JUSTIFY_CLASS[formDesign.welcomeButtonAlign ?? welcomeAlign]

  // Redireciona de verdade só na página pública real (onSubmitted definido)
  // — no preview do construtor isso só mostraria uma nota, pra não navegar
  // pra fora do construtor sem querer. Sem atraso = na hora (comportamento
  // antigo, o conteúdo nem aparece); com atraso mostra o conteúdo antes.
  const redirectTarget = normalizeUrl(matchedOutcome?.redirectUrl)
  const redirectDelay = Math.max(0, matchedOutcome?.redirectDelay ?? 0)
  useEffect(() => {
    if (phase !== 'done' || !onSubmitted || !redirectTarget) return
    const timer = setTimeout(() => {
      window.location.href = redirectTarget
    }, redirectDelay * 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Tela inteira (padrão): sem cartão, o conteúdo fica solto na página e o
  // banner ocupa a largura toda. Cartão: o layout antigo, num quadro no meio.
  const fullScreen = (formDesign.layout ?? 'full') === 'full'
  const showBanner = (shownPhase === 'welcome' || shownPhase === 'done') && !!design.bannerUrl
  // Banner sempre inteiro (nunca cortado): largura total, altura natural,
  // limitada pra não empurrar o conteúdo pra fora da tela.
  const imageFormat = design.bannerFormat ?? 'banner'
  const objectPosition = { top: 'center top', center: 'center center', bottom: 'center bottom' }[design.bannerFocus ?? 'center']
  // Banner e Original ficam no topo, largura total. Quadrado e Post ficam no
  // meio do conteúdo, acima do título (como a imagem de um post).
  const topImage = imageFormat === 'banner' || imageFormat === 'original'
  const banner =
    showBanner && topImage ? (
      imageFormat === 'banner' ? (
        <img
          src={design.bannerUrl!}
          alt=""
          className={`block aspect-[3/1] w-full object-cover ${fullScreen ? 'max-h-[42vh]' : ''}`}
          style={{ objectPosition }}
        />
      ) : (
        <img src={design.bannerUrl!} alt="" className={fullScreen ? 'block h-auto max-h-[45vh] w-full object-contain' : 'block h-auto max-h-72 w-full object-contain'} />
      )
    ) : null
  const inlineImage =
    showBanner && !topImage ? (
      <div className={`mb-5 flex ${shownPhase === 'welcome' ? alignFlex : 'justify-center'}`}>
        <img
          src={design.bannerUrl!}
          alt=""
          className={`w-full max-w-[340px] rounded-2xl object-cover shadow-sm ${imageFormat === 'square' ? 'aspect-square' : 'aspect-[4/5]'}`}
          style={{ objectPosition }}
        />
      </div>
    ) : null

  return (
    <div className={`flex ${fillViewport ? 'min-h-screen' : 'min-h-full'} flex-col`} style={{ background: backgroundColor }}>
      {fullScreen && banner}
      <div className={`flex flex-1 items-center justify-center ${fullScreen ? 'px-5 py-10 sm:px-8' : 'px-4 py-8'}`}>
      <div
        className={fullScreen ? 'w-full max-w-2xl' : 'w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 shadow-sm'}
        style={fullScreen ? undefined : { background: theme.card }}
      >
        {!fullScreen && banner}
        <div className={fullScreen ? '' : 'p-6 sm:p-8'}>
          {inlineImage}
          {(shownPhase === 'welcome' || shownPhase === 'done') && design.logoUrl && (
            <div className={`mb-4 flex ${shownPhase === 'welcome' ? alignFlex : 'justify-center'}`}>
              <img src={design.logoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
            </div>
          )}

          {shownPhase === 'welcome' && (
            <>
              <h1 className={`mb-1 whitespace-pre-wrap font-bold text-slate-900 ${fullScreen ? 'text-2xl sm:text-3xl' : 'text-xl'} ${alignText}`} style={textStyle}>{design.title || form.name}</h1>
              {design.subtitle && <p className={`whitespace-pre-wrap text-sm text-slate-500 ${alignText}`} style={mutedStyle}>{design.subtitle}</p>}
              <VideoEmbed url={design.welcomeVideoUrl} />
              <div className={`mt-5 flex ${buttonFlex}`}>
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={visibleQuestions.length === 0}
                  style={{ background: primaryColor, color: theme.buttonText }}
                  className="flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {design.welcomeButtonLabel || 'Começar'} <ArrowRight size={14} />
                </button>
              </div>
            </>
          )}

          {(shownPhase === 'question' || shownPhase === 'submitting') && currentQuestion && (
            <div>
              <div className="mb-5 h-1 w-full overflow-hidden rounded-full bg-slate-100" style={theme.text ? { background: `${theme.text}26` } : undefined}>
                <div
                  className="h-full rounded-full transition-all duration-300 ease-in-out"
                  style={{ width: `${((questionIndex + 1) / Math.max(visibleQuestions.length, 1)) * 100}%`, background: primaryColor }}
                />
              </div>
              <p className="mb-3 text-xs font-medium text-slate-400" style={mutedStyle}>
                {questionIndex + 1} de {visibleQuestions.length}
              </p>

              {currentQuestion.imageUrl && (
                <img src={currentQuestion.imageUrl} alt="" className="mb-4 max-h-56 w-full rounded-xl object-cover" />
              )}

              <QuestionField
                question={currentQuestion}
                value={answers[currentQuestion.id]}
                otherText={otherTexts[currentQuestion.id] ?? ''}
                error={errors[currentQuestion.id]}
                autoFocus={!forced}
                align={align}
                theme={theme}
                onChange={(v) => handleAnswerChange(currentQuestion, v)}
                onToggleOption={(optId) => toggleMultiOption(currentQuestion, optId)}
                onOtherTextChange={(t) => handleOtherText(currentQuestion, t)}
                onEnter={goNext}
              />

              {submitError && isLast && (
                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">Não foi possível enviar. Verifique sua internet e toque em Enviar de novo.</p>
              )}
              <div className="mt-5 flex items-center gap-2">
                {questionIndex > 0 && (
                  <button type="button" onClick={goBack} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100" style={mutedStyle}>
                    <ArrowLeft size={14} /> Voltar
                  </button>
                )}
                <button
                  type="button"
                  onClick={goNext}
                  disabled={shownPhase === 'submitting'}
                  style={{ background: primaryColor, color: theme.buttonText }}
                  className="ml-auto flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {shownPhase === 'submitting' ? (
                    <Spinner className="h-4 w-4 border-white/30 border-t-white" />
                  ) : isLast ? (
                    <Send size={14} />
                  ) : (
                    <ArrowRight size={14} />
                  )}
                  {isLast ? 'Enviar' : 'Continuar'}
                </button>
              </div>
            </div>
          )}

          {shownPhase === 'done' &&
            (redirectTarget && redirectDelay === 0 ? (
              <p className="text-center text-sm text-slate-400">
                {onSubmitted ? 'Redirecionando…' : `Preview: essa tela redirecionaria para ${redirectTarget}`}
              </p>
            ) : (
              <>
                <LeadFormBlocksView blocks={endBlocks} primaryColor={primaryColor} buttonTextColor={theme.buttonText} textColor={theme.text} interactive={!!onSubmitted} />
                {redirectTarget && !onSubmitted && (
                  <p className="mt-4 text-center text-xs text-slate-400">
                    Preview: depois de {redirectDelay}s o lead seria levado para {redirectTarget}
                  </p>
                )}
              </>
            ))}
        </div>
      </div>
      </div>
    </div>
  )
}

function QuestionField({
  question,
  value,
  otherText,
  error,
  autoFocus,
  align,
  theme,
  onChange,
  onToggleOption,
  onOtherTextChange,
  onEnter,
}: {
  question: LeadFormQuestion
  value: string | string[] | undefined
  otherText: string
  error?: FieldError
  autoFocus: boolean
  align: LeadFormAlign
  theme: LeadFormTheme
  onChange: (v: string | string[]) => void
  onToggleOption: (optionId: string) => void
  onOtherTextChange: (text: string) => void
  onEnter: () => void
}) {
  const heading = (
    <>
      <span className={`mb-1.5 block text-base font-medium text-slate-800 ${TEXT_ALIGN_CLASS[align]}`} style={theme.text ? { color: theme.text } : undefined}>
        {question.label || <span className="text-slate-300">Texto da pergunta</span>}
        {question.required && <span className="text-red-400"> *</span>}
      </span>
      {question.description && <span className={`mb-2.5 block whitespace-pre-wrap text-sm text-slate-500 ${TEXT_ALIGN_CLASS[align]}`} style={theme.text ? { color: theme.text, opacity: 0.7 } : undefined}>{question.description}</span>}
    </>
  )
  const inputClass = `w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${
    error === 'required' ? 'border-red-300' : 'border-slate-200'
  }`
  const handleEnterKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onEnter()
    }
  }

  if (question.type === 'long_text') {
    return (
      <label className="block">
        {heading}
        <textarea rows={4} autoFocus={autoFocus} className={`${inputClass} resize-none`} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
        {error === 'required' && <p className="mt-1 text-xs text-red-500">Campo obrigatório</p>}
      </label>
    )
  }

  if (question.type === 'single_choice' || question.type === 'multi_choice') {
    const isMulti = question.type === 'multi_choice'
    const selected = isMulti ? ((value as string[] | undefined) ?? []) : value ? [value as string] : []
    const options = [
      ...(question.options ?? []).filter((o) => o.label.trim()),
      ...(question.allowOther ? [{ id: OTHER_OPTION_ID, label: question.otherLabel?.trim() || 'Outro' }] : []),
    ]
    const otherPicked = selected.includes(OTHER_OPTION_ID)
    return (
      <div>
        {heading}
        <div className="flex flex-col gap-2">
          {options.map((opt) => {
            const checked = selected.includes(opt.id)
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => (isMulti ? onToggleOption(opt.id) : onChange(opt.id))}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  checked ? '' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                style={checked ? { borderColor: theme.primary, background: `${theme.primary}1A`, color: theme.primary } : theme.text ? { color: theme.text } : undefined}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center border ${isMulti ? 'rounded' : 'rounded-full'} ${checked ? '' : 'border-slate-300'}`}
                  style={checked ? { borderColor: theme.primary, background: theme.primary } : undefined}
                >
                  {checked && <span className={`h-1.5 w-1.5 bg-white ${isMulti ? 'rounded-sm' : 'rounded-full'}`} />}
                </span>
                {opt.label}
              </button>
            )
          })}
        </div>
        {otherPicked && (
          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{question.otherPrompt?.trim() || 'Qual?'}</span>
            <input
              autoFocus={autoFocus}
              className={`${inputClass} ${error === 'other' ? 'border-red-300' : ''}`}
              value={otherText}
              onChange={(e) => onOtherTextChange(e.target.value)}
              onKeyDown={handleEnterKey}
              placeholder="Escreva aqui"
            />
          </label>
        )}
        {error === 'required' && <p className="mt-1 text-xs text-red-500">{isMulti ? 'Escolha ao menos uma opção' : 'Escolha uma opção'}</p>}
        {error === 'other' && <p className="mt-1 text-xs text-red-500">Conte pra gente o que é</p>}
      </div>
    )
  }

  if (question.type === 'fields') {
    const values = Array.isArray(value) ? value : []
    const missing = new Set(
      error === 'required'
        ? missingSubfields(question, values).map((f) => f.id)
        : error === 'invalid'
          ? invalidSubfields(question, values).map((f) => f.id)
          : []
    )
    return (
      <div>
        {heading}
        <FieldGroupQuestionField
          subfields={question.subfields ?? []}
          value={values}
          onChange={onChange as unknown as (v: string[]) => void}
          autoFocus={autoFocus}
          missingIds={missing}
        />
        {error === 'required' && <p className="mt-1 text-xs text-red-500">Preencha os campos marcados</p>}
        {error === 'invalid' && <p className="mt-1 text-xs text-red-500">Confira os campos marcados: WhatsApp com DDD e e-mail no formato nome@empresa.com</p>}
      </div>
    )
  }

  if (question.type === 'address') {
    return (
      <div>
        {heading}
        <AddressQuestionField value={Array.isArray(value) ? value : []} onChange={onChange as unknown as (v: string[]) => void} autoFocus={autoFocus} invalid={error === 'required'} />
        {error === 'required' && <p className="mt-1 text-xs text-red-500">Preencha CEP, rua, número, bairro e cidade</p>}
      </div>
    )
  }

  const inputType = question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'text'
  const kind = contactKindOf(question)
  return (
    <label className="block">
      {heading}
      <input
        autoFocus={autoFocus}
        type={inputType}
        inputMode={kind === 'phone' ? 'tel' : kind === 'email' ? 'email' : undefined}
        placeholder={kind === 'phone' ? '(00) 00000-0000' : kind === 'email' ? 'nome@empresa.com' : undefined}
        className={`${inputClass} ${error === 'invalid' ? 'border-red-300' : ''}`}
        value={(value as string) ?? ''}
        onChange={(e) => onChange(kind === 'phone' ? maskPhone(e.target.value) : e.target.value)}
        onKeyDown={handleEnterKey}
      />
      {error === 'required' && <p className="mt-1 text-xs text-red-500">Campo obrigatório</p>}
      {error === 'invalid' && kind && <p className="mt-1 text-xs text-red-500">{contactError(kind, value as string)}</p>}
    </label>
  )
}

/** Pergunta que deve ser validada como WhatsApp ou e-mail: pelo tipo ou pelo
 *  campo do lead que ela alimenta. */
function contactKindOf(q: LeadFormQuestion): ContactKind | null {
  if (q.type === 'phone' || q.role === 'whatsapp') return 'phone'
  if (q.type === 'email' || q.role === 'email') return 'email'
  return null
}

import { Fragment, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarCheck, ChevronRight, RefreshCw, ScanSearch, X } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { Composer, DayDivider, MessageBubble, Switch, authorLabel, displayName } from './WaParts'
import { SDR_FIELDS, SDR_FIELD_LABEL, SDR_FLOW, SDR_STAGE, SDR_TEMP } from './waSdr'
import { SdrChip } from './SdrChip'
import { analyzeWaConversation, listenMessages, updateWaConversation } from '../../services/whatsappService'
import type { WaConversation, WaMessage, WaTemplate } from '../../types/whatsapp'
import { useLeadPipelines } from '../../hooks/useLeadPipelines'
import { isQuestionnaireLead, locateLead, type Lead } from '../../types'

export { SdrChip }

/* ------------------------------ raio-x do SDR ------------------------------ */

export function SdrPanel({ conv, onClose }: { conv: WaConversation; onClose?: () => void }) {
  const [busy, setBusy] = useState(false)
  const sdr = conv.sdr
  const refresh = async () => {
    setBusy(true)
    try {
      await analyzeWaConversation(conv.waId)
      toast.success('Raio-x atualizado')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const t = sdr ? SDR_TEMP[sdr.temperature] ?? SDR_TEMP.morno : null
  const flowIdx = sdr ? SDR_FLOW.indexOf(sdr.stage) : -1
  const offFlow = sdr && flowIdx < 0 ? SDR_STAGE[sdr.stage] : null
  const known = sdr ? SDR_FIELDS.filter((k) => sdr.profile?.[k]).length : 0

  return (
    <section className="flex h-full flex-col" aria-labelledby={`sdr-${conv.waId}`}>
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-3">
        <ScanSearch size={17} className="text-violet-400" aria-hidden="true" />
        <h3 id={`sdr-${conv.waId}`} className="flex-1 text-sm font-semibold text-slate-800">
          Raio-x do SDR
        </h3>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
        >
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} aria-hidden="true" />
          {busy ? 'Analisando…' : 'Atualizar'}
        </button>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar o raio-x do SDR">
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {!sdr || !t ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center">
            <p className="text-sm font-medium text-slate-600">Sem raio-x ainda</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">A IA monta sozinha quando responde. Para conversas antigas, clique em Atualizar.</p>
          </div>
        ) : (
          <>
            {/* Temperatura e nota */}
            <div className="rounded-2xl border border-slate-200 p-4" style={{ background: `linear-gradient(135deg, ${t.bg}, transparent 70%)` }}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Temperatura</p>
                  <p className="mt-0.5 text-lg font-bold" style={{ color: t.color }}>
                    {t.label}
                  </p>
                </div>
                <p className="text-right">
                  <span className="text-3xl font-bold tabular-nums text-slate-800">{sdr.score}</span>
                  <span className="text-sm text-slate-400"> de 100</span>
                </p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                <div className="h-full rounded-full transition-all" style={{ width: `${sdr.score}%`, background: t.color }} />
              </div>
            </div>

            {/* Etapa */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Etapa</p>
              {offFlow ? (
                <p className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: `${offFlow.color}1f`, color: offFlow.color }}>
                  {offFlow.label}
                  <span className="block text-xs font-normal text-slate-500">{offFlow.hint}</span>
                </p>
              ) : (
                <>
                  <ol className="flex items-center gap-1" aria-label={`Etapa ${flowIdx + 1} de ${SDR_FLOW.length}: ${SDR_STAGE[sdr.stage].label}`}>
                    {SDR_FLOW.map((s, i) => (
                      <li key={s} className="h-1.5 flex-1 rounded-full" style={{ background: i <= flowIdx ? SDR_STAGE[sdr.stage].color : 'var(--dk-surface-4, #2a2a2e)' }} aria-hidden="true" />
                    ))}
                  </ol>
                  <p className="mt-2 text-sm font-semibold" style={{ color: SDR_STAGE[sdr.stage].color }}>
                    {SDR_STAGE[sdr.stage].label}
                  </p>
                  <p className="text-xs text-slate-500">{SDR_STAGE[sdr.stage].hint}</p>
                </>
              )}
            </div>

            {sdr.meeting?.agreed && (
              <p className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-slate-700">
                <CalendarCheck size={16} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>
                  <strong className="font-semibold">Reunião combinada</strong>
                  {sdr.meeting.when ? `: ${sdr.meeting.when}` : ''}. Confirme na agenda.
                  {sdr.meeting.at && conv.meetingReminderFor === sdr.meeting.at && !conv.meetingReminderError && <span className="block text-xs text-emerald-500">Lembrete enviado.</span>}
                  {sdr.meeting.at && conv.meetingReminderFor !== sdr.meeting.at && <span className="block text-xs text-slate-500">O lembrete sai sozinho antes da reunião.</span>}
                  {!sdr.meeting.at && <span className="block text-xs text-slate-500">Sem horário exato: não vai ter lembrete automático.</span>}
                  {conv.meetingReminderError && <span className="block text-xs text-amber-500">Lembrete não enviado: {conv.meetingReminderError}</span>}
                </span>
              </p>
            )}

            {sdr.summary && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Resumo</p>
                <p className="text-sm leading-relaxed text-slate-700">{sdr.summary}</p>
              </div>
            )}

            {sdr.nextStep && (
              <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                <ArrowRight size={15} className="mt-0.5 shrink-0 text-violet-400" aria-hidden="true" />
                <span>
                  <span className="sr-only">Próximo passo: </span>
                  {sdr.nextStep}
                </span>
              </p>
            )}

            {/* Perfil: só o que já foi descoberto; o resto vira uma linha. */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">O que já sabemos</p>
              {known > 0 ? (
                <dl className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                  {SDR_FIELDS.filter((k) => sdr.profile?.[k]).map((k) => (
                    <div key={k} className="flex gap-3 px-3 py-2 text-sm">
                      <dt className="w-24 shrink-0 text-xs font-medium text-slate-400">{SDR_FIELD_LABEL[k]}</dt>
                      <dd className="min-w-0 flex-1 break-words text-slate-700">{sdr.profile?.[k]}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-slate-400">Nada ainda.</p>
              )}
              {known < SDR_FIELDS.length && (
                <p className="mt-2 text-xs text-slate-400">
                  Falta: {SDR_FIELDS.filter((k) => !sdr.profile?.[k]).map((k) => SDR_FIELD_LABEL[k].toLowerCase()).join(', ')}.
                </p>
              )}
            </div>

            <p className="text-[11px] text-slate-400">Atualizado {new Date(sdr.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
          </>
        )}
      </div>
    </section>
  )
}

/* ------------------------------ conversa ------------------------------ */

export function WaThread({
  conv,
  templates,
  lead,
  onOpenLead,
  onBack,
  context,
  dockedPanel = true,
}: {
  conv: WaConversation
  templates: WaTemplate[]
  lead: Lead | null
  onOpenLead?: (id: string) => void
  /** Botão de voltar (lista de conversas no celular). */
  onBack?: () => void
  /** Linha extra embaixo do nome (ex.: "Comprou Curso X"). */
  context?: string
  /** true = em tela larga o raio-x fica fixo ao lado; false = sempre por cima (painéis estreitos). */
  dockedPanel?: boolean
}) {
  const { pipelines } = useLeadPipelines()
  const where = lead ? locateLead(pipelines, lead) : null
  const [messages, setMessages] = useState<WaMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const [panel, setPanel] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const lastCount = useRef(0)

  useEffect(() => {
    lastCount.current = 0
    setLoaded(false)
    return listenMessages(conv.waId, (rows) => (setMessages(rows), setLoaded(true)), () => toast.error('Não consegui carregar as mensagens.'))
  }, [conv.waId])

  // Mensagem nova: anuncia no leitor de tela e rola até o fim.
  useEffect(() => {
    if (messages.length > lastCount.current && lastCount.current > 0) {
      const last = messages[messages.length - 1]
      if (last) setAnnounce(`${authorLabel(last, conv)} disse: ${last.text}`)
    }
    lastCount.current = messages.length
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages]) // eslint-disable-line react-hooks/exhaustive-deps

  // Abriu a conversa: zera as não lidas (e marca como lida no WhatsApp do contato).
  useEffect(() => {
    if (conv.unread > 0) updateWaConversation(conv.waId, { read: true }).catch(() => {})
  }, [conv.waId, conv.unread])

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      setAnnounce(ok)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const aiOn = conv.aiMode !== 'off'
  const followOn = !conv.followUpStopped
  const sub = [conv.phone, conv.kind === 'cart' && conv.productName ? `Carrinho de ${conv.productName}` : '', context].filter(Boolean).join(' · ')

  return (
    <div className="relative flex h-full min-h-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={`Conversa com ${displayName(conv)}`}>
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          {onBack && (
            <button type="button" onClick={onBack} className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Voltar para a lista de conversas">
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
          )}
          <span className="relative shrink-0">
            <Avatar name={displayName(conv)} size="lg" />
            <span
              className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[var(--dk-surface)] ${conv.kind === 'cart' ? 'bg-amber-500' : aiOn ? 'bg-violet-500' : 'bg-emerald-500'}`}
              aria-hidden="true"
            />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 truncate text-[15px] font-semibold text-slate-800">
              <span className="truncate">{displayName(conv)}</span>
            </h2>
            {lead && where && onOpenLead ? (
              <button
                type="button"
                onClick={() => onOpenLead(lead.id)}
                className="flex max-w-full items-center gap-1.5 truncate text-left text-xs text-slate-500 transition hover:text-slate-700"
                aria-label={`${conv.phone}. Abrir a ficha do lead ${lead.contactName}${lead.companyName ? `, ${lead.companyName}` : ''}. ${isQuestionnaireLead(lead) ? 'Na aba Questionários' : `Etapa ${where.stage.label}`}. ${aiOn ? 'IA atendendo' : 'Com a equipe'}`}
              >
                <span className="truncate">
                  {conv.phone}
                  {lead.companyName ? ` · ${lead.companyName}` : ''}
                </span>
                <span
                  className="shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold"
                  style={isQuestionnaireLead(lead) ? undefined : { backgroundColor: `${where.stage.color}26`, color: where.stage.color }}
                >
                  {isQuestionnaireLead(lead) ? 'Questionário' : where.stage.label}
                </span>
                <span className="flex shrink-0 items-center font-semibold text-brand-600">
                  Ficha <ChevronRight size={13} aria-hidden="true" />
                </span>
              </button>
            ) : (
              <p className="truncate text-xs text-slate-500">
                {sub}
                {conv.kind === 'lead' && !lead && <span className="text-slate-400"> · sem lead no CRM</span>}
                <span className="sr-only">. {aiOn ? 'IA atendendo' : 'Com a equipe'}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Switch checked={aiOn} busy={busy === 'ai'} label="IA" onChange={() => run('ai', () => updateWaConversation(conv.waId, { aiMode: aiOn ? 'off' : 'auto' }), aiOn ? 'IA desligada nesta conversa' : 'IA ligada nesta conversa')} />
            <Switch checked={followOn} busy={busy === 'fu'} label="Follow-up" onChange={() => run('fu', () => updateWaConversation(conv.waId, { followUpStopped: followOn }), followOn ? 'Follow-up parado' : 'Follow-up ligado')} />
            {conv.kind !== 'cart' && (
              <button
                type="button"
                aria-pressed={panel}
                onClick={() => setPanel((v) => !v)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${panel ? 'border-violet-400/40 bg-violet-500/15 text-violet-300' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
              >
                <ScanSearch size={14} aria-hidden="true" /> Raio-x
              </button>
            )}
          </div>
        </header>

        {conv.aiMode === 'off' && conv.handoffReason && !/celular/i.test(conv.handoffReason) && (
          <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-slate-700" role="status">
            <AlertTriangle size={15} className="shrink-0 text-amber-500" aria-hidden="true" />
            <span className="flex-1">A IA passou para a equipe: {conv.handoffReason}</span>
            <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-amber-500 hover:bg-amber-500/15" onClick={() => run('ai', () => updateWaConversation(conv.waId, { aiMode: 'auto' }), 'Conversa devolvida para a IA')}>
              Devolver para a IA
            </button>
          </div>
        )}
        {conv.followUpError && (
          <div className="flex shrink-0 items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
            Último follow-up falhou: {conv.followUpError}
          </div>
        )}

        <div ref={listRef} className="wa-wall min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-6">
          {messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">{loaded ? 'Ainda não há mensagens nesta conversa.' : 'Carregando mensagens…'}</p>
          ) : (
            <ol className="mx-auto flex max-w-5xl flex-col pb-2" aria-label="Mensagens">
              {messages.map((m, i) => {
                const prev = messages[i - 1]
                const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString()
                const first = newDay || !prev || prev.direction !== m.direction || authorLabel(prev, conv) !== authorLabel(m, conv)
                return (
                  <Fragment key={m.id}>
                    {newDay && <DayDivider iso={m.at} />}
                    <MessageBubble m={m} conv={conv} first={first} />
                  </Fragment>
                )
              })}
            </ol>
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
        <Composer conv={conv} templates={templates} />
      </section>

      {panel && conv.kind !== 'cart' && (
        <aside
          className={`absolute inset-y-0 right-0 z-10 w-[min(320px,92%)] border-l border-slate-200 bg-white shadow-2xl ${dockedPanel ? 'xl:static xl:z-auto xl:w-[300px] xl:shrink-0 xl:shadow-none' : ''}`}
          aria-label="Raio-x do SDR"
        >
          <SdrPanel conv={conv} onClose={() => setPanel(false)} />
        </aside>
      )}
    </div>
  )
}

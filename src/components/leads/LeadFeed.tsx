import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { AlertTriangle, ClipboardList, History, Mail, MessageCircle, MoreHorizontal, NotebookPen, Phone, Video } from 'lucide-react'
import { Button } from '../ui/Button'
import { Select } from '../ui/Field'
import { FormAnswersList } from './FormAnswerValue'
import { Composer, MessageBubble, Switch, TemplateComposer, authorLabel, dayLabel, hhmm } from '../whatsapp/WaParts'
import { SdrChip } from '../whatsapp/SdrChip'
import { SDR_STAGE } from '../whatsapp/waSdr'
import { useAuth } from '../../context/AuthContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { useActivities } from '../../hooks/useActivities'
import { useLeadForms } from '../../hooks/useLeadForms'
import { useWaConversations, useWaTemplates, buildLeadConversationMap, waPhoneKey } from '../../hooks/useWaConversations'
import { addLeadContact } from '../../services/leadService'
import { listenMessages, updateWaConversation } from '../../services/whatsappService'
import { LEAD_CONTACT_OUTCOME_LABEL, LEAD_CONTACT_TYPE_LABEL, type Lead, type LeadContactEntry, type LeadContactOutcome, type LeadContactType } from '../../types'
import type { Activity } from '../../types'
import type { WaMessage } from '../../types/whatsapp'

/** Linha do tempo única do lead (estilo Kommo): mensagens do WhatsApp,
 *  contatos registrados, formulário respondido e mudanças no CRM, em ordem,
 *  com a caixa de escrever embaixo. */

type Item =
  | { kind: 'msg'; at: number; id: string; m: WaMessage }
  | { kind: 'note'; at: number; id: string; e: LeadContactEntry }
  | { kind: 'event'; at: number; id: string; a: Activity }
  | { kind: 'form'; at: number; id: string }

type FeedFilter = 'all' | 'msg' | 'note' | 'event'

const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'msg', label: 'WhatsApp' },
  { id: 'note', label: 'Contatos' },
  { id: 'event', label: 'Histórico' },
]

const CONTACT_ICON: Record<LeadContactType, typeof Phone> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: Video,
  other: MoreHorizontal,
}

const OUTCOME_CLASS: Record<LeadContactOutcome, string> = {
  positive: 'text-emerald-500',
  neutral: 'text-slate-400',
  negative: 'text-red-500',
}

const toMs = (t: Timestamp | null | undefined) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0)

/* ------------------------------ nota / contato ------------------------------ */

function NoteComposer({ lead }: { lead: Lead }) {
  const { profile } = useAuth()
  const [type, setType] = useState<LeadContactType>('call')
  const [outcome, setOutcome] = useState<LeadContactOutcome>('neutral')
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!profile || !summary.trim()) return
    setSaving(true)
    try {
      await addLeadContact(lead, { type, date: Timestamp.now(), summary: summary.trim(), outcome }, profile.id, profile.name)
      setSummary('')
      toast.success('Contato registrado')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao registrar contato')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-slate-200 bg-white p-3">
      <div className="flex flex-wrap gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Tipo de contato</span>
          <Select value={type} onChange={(e) => setType(e.target.value as LeadContactType)}>
            {(Object.entries(LEAD_CONTACT_TYPE_LABEL) as [LeadContactType, string][]).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </label>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Resultado do contato</span>
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value as LeadContactOutcome)}>
            {(Object.entries(LEAD_CONTACT_OUTCOME_LABEL) as [LeadContactOutcome, string][]).map(([v, l]) => (
              <option key={v} value={v}>
                Resultado: {l}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <label>
        <span className="sr-only">Resumo do contato. Ctrl + Enter salva.</span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              save()
            }
          }}
          rows={2}
          placeholder="O que foi conversado? (fica salvo no histórico do lead)"
          className="block w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-400"
        />
      </label>
      <div className="flex justify-end">
        <Button size="sm" onClick={save} loading={saving} disabled={!summary.trim()}>
          Salvar contato
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------ itens ------------------------------ */

function NoteCard({ e }: { e: LeadContactEntry }) {
  const Icon = CONTACT_ICON[e.type] ?? MoreHorizontal
  return (
    <li className="mt-3 flex justify-center">
      <div className="w-full max-w-[92%] rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
        <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Icon size={13} className="text-amber-500" aria-hidden="true" />
          Contato registrado: {LEAD_CONTACT_TYPE_LABEL[e.type]}
          <span className={`font-medium ${OUTCOME_CLASS[e.outcome]}`}>, resultado {LEAD_CONTACT_OUTCOME_LABEL[e.outcome].toLowerCase()}</span>
          <span className="ml-auto font-normal text-slate-400">{hhmm(e.date.toDate())}</span>
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{e.summary}</p>
      </div>
    </li>
  )
}

function EventLine({ a }: { a: Activity }) {
  return (
    <li className="mt-3 flex justify-center">
      <p className="flex max-w-[92%] items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-center text-[11.5px] text-slate-500">
        <History size={12} className="shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-semibold text-slate-600">{a.userName}</strong> {a.message}
          <span className="text-slate-400"> às {hhmm(a.createdAt.toDate())}</span>
        </span>
      </p>
    </li>
  )
}

function FormEvent({ lead }: { lead: Lead }) {
  const { data: forms } = useLeadForms()
  const { isPrivacyMode } = usePrivacy()
  const [open, setOpen] = useState(false)
  const form = forms.find((f) => f.id === lead.sourceFormId)
  return (
    <li className="mt-3 flex justify-center">
      <div className="w-full max-w-[92%] rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2">
        <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-700">
          <ClipboardList size={13} className="text-sky-500" aria-hidden="true" />
          Respondeu o formulário{form ? ` ${form.name}` : ''}
          {lead.origin && <span className="font-normal text-slate-500">, veio de {[lead.origin.source, lead.origin.campaign].filter(Boolean).join(', ')}</span>}
          <span className="ml-auto font-normal text-slate-400">{lead.createdAt ? hhmm(lead.createdAt.toDate()) : ''}</span>
        </p>
        {lead.formAnswers?.length ? (
          <>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1 text-xs font-semibold text-sky-500 hover:underline">
              {open ? 'Esconder respostas' : `Ver as ${lead.formAnswers.length} respostas`}
            </button>
            {open && (
              <div className="mt-2">
                <FormAnswersList answers={lead.formAnswers} questions={form?.questions} hidden={isPrivacyMode} />
              </div>
            )}
          </>
        ) : null}
      </div>
    </li>
  )
}

/* ------------------------------ feed ------------------------------ */

export function LeadFeed({ lead, active = true }: { lead: Lead; active?: boolean }) {
  const { data: convs } = useWaConversations()
  const templates = useWaTemplates()
  const conv = useMemo(() => buildLeadConversationMap([lead], convs).get(lead.id) ?? null, [lead, convs])
  const { data: activities } = useActivities('lead', lead.id)
  const [messages, setMessages] = useState<WaMessage[]>([])
  const [filter, setFilter] = useState<FeedFilter>('all')
  const [mode, setMode] = useState<'wa' | 'note'>(waPhoneKey(lead.whatsapp) ? 'wa' : 'note')
  const [busy, setBusy] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const lastCount = useRef(0)
  const waId = conv?.waId

  useEffect(() => {
    lastCount.current = 0
    setMessages([])
    if (!waId) return
    return listenMessages(waId, setMessages, () => toast.error('Não consegui carregar as mensagens do WhatsApp.'))
  }, [waId])

  // Achou a conversa pelo telefone: grava o vínculo pra caixa de entrada também saber.
  useEffect(() => {
    if (conv && !conv.leadId) updateWaConversation(conv.waId, { leadId: lead.id }).catch(() => {})
  }, [conv, lead.id])

  // Ficha aberta na conversa: zera as não lidas.
  useEffect(() => {
    if (active && conv && conv.unread > 0) updateWaConversation(conv.waId, { read: true }).catch(() => {})
  }, [active, conv])

  const items = useMemo(() => {
    const out: Item[] = []
    for (const m of messages) out.push({ kind: 'msg', at: new Date(m.at).getTime(), id: `m-${m.id}`, m })
    for (const e of lead.contactHistory ?? []) out.push({ kind: 'note', at: toMs(e.date) || toMs(e.createdAt), id: `n-${e.id}`, e })
    for (const a of activities) if (a.createdAt) out.push({ kind: 'event', at: toMs(a.createdAt), id: `a-${a.id}`, a })
    if (lead.sourceFormId && lead.createdAt) out.push({ kind: 'form', at: toMs(lead.createdAt), id: 'form' })
    return out.sort((x, y) => x.at - y.at)
  }, [messages, lead.contactHistory, lead.sourceFormId, lead.createdAt, activities])

  const visible = items.filter((i) => filter === 'all' || i.kind === filter || (filter === 'note' && i.kind === 'form') || (filter === 'event' && i.kind === 'form'))
  const counts: Record<FeedFilter, number> = {
    all: items.length,
    msg: messages.length,
    note: (lead.contactHistory ?? []).length,
    event: activities.length,
  }

  // Item novo: anuncia no leitor de tela e desce até o fim.
  useEffect(() => {
    if (messages.length > lastCount.current && lastCount.current > 0 && conv) {
      const last = messages[messages.length - 1]
      if (last) setAnnounce(`Nova mensagem no WhatsApp. ${authorLabel(last, conv)} disse: ${last.text}`)
    }
    lastCount.current = messages.length
  }, [messages, conv])
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visible.length, filter])

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

  const aiOn = conv ? conv.aiMode !== 'off' : false
  const followOn = conv ? !conv.followUpStopped : false
  const hasPhone = Boolean(waPhoneKey(lead.whatsapp))

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={`Conversa e histórico de ${lead.contactName}`}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Mostrar na linha do tempo">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              aria-label={`${f.label}: ${counts[f.id]}`}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${filter === f.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {f.label}
              {f.id !== 'all' && counts[f.id] > 0 && <span className="ml-1 opacity-70">{counts[f.id]}</span>}
            </button>
          ))}
        </div>
        {conv && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Switch checked={aiOn} busy={busy === 'ai'} label="IA" onChange={() => run('ai', () => updateWaConversation(conv.waId, { aiMode: aiOn ? 'off' : 'auto' }), aiOn ? 'IA desligada nesta conversa' : 'IA ligada nesta conversa')} />
            <Switch checked={followOn} busy={busy === 'fu'} label="Follow-up" onChange={() => run('fu', () => updateWaConversation(conv.waId, { followUpStopped: followOn }), followOn ? 'Follow-up parado' : 'Follow-up ligado')} />
          </div>
        )}
      </div>

      {conv?.sdr && (
        <div className="flex shrink-0 items-start gap-3 border-b border-slate-200 bg-white px-4 py-2.5" role="note" aria-label="Resumo do SDR do WhatsApp">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
              SDR do WhatsApp <SdrChip sdr={conv.sdr} size="xs" />
              <span className="font-normal text-slate-400">nota {conv.sdr.score} de 100</span>
            </p>
            {conv.sdr.summary && <p className="mt-1 text-sm leading-snug text-slate-700">{conv.sdr.summary}</p>}
            {(conv.sdr.meeting?.agreed || conv.sdr.nextStep) && (
              <p className="mt-0.5 text-xs" style={{ color: conv.sdr.meeting?.agreed ? SDR_STAGE.agendado.color : undefined }}>
                {conv.sdr.meeting?.agreed ? `Reunião combinada${conv.sdr.meeting.when ? `: ${conv.sdr.meeting.when}` : ''}` : <span className="text-slate-500">Próximo passo: {conv.sdr.nextStep}</span>}
              </p>
            )}
          </div>
        </div>
      )}

      {conv?.aiMode === 'off' && conv.handoffReason && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800" role="status">
          <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
          <span className="flex-1">A IA passou para a equipe: {conv.handoffReason}</span>
          <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold hover:bg-amber-100" onClick={() => run('ai', () => updateWaConversation(conv.waId, { aiMode: 'auto' }), 'Conversa devolvida para a IA')}>
            Devolver para a IA
          </button>
        </div>
      )}

      <div ref={listRef} className="wa-wall min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <MessageCircle size={26} className="text-slate-300" aria-hidden="true" />
            <p className="max-w-xs text-sm text-slate-400">
              {filter === 'msg' || (filter === 'all' && !items.length)
                ? hasPhone
                  ? 'Nenhuma mensagem de WhatsApp com esse lead ainda. Mande a primeira aqui embaixo.'
                  : 'Esse lead não tem WhatsApp cadastrado. Coloque o número nos dados do lead pra conversar por aqui.'
                : 'Nada nesse filtro.'}
            </p>
          </div>
        ) : (
          <ol className="flex flex-col" aria-label="Linha do tempo do lead">
            {visible.map((it, i) => {
              const prev = visible[i - 1]
              const newDay = !prev || new Date(prev.at).toDateString() !== new Date(it.at).toDateString()
              const sameAuthor =
                !newDay && it.kind === 'msg' && prev?.kind === 'msg' && conv != null && prev.m.direction === it.m.direction && authorLabel(prev.m, conv) === authorLabel(it.m, conv)
              return (
                <Fragment key={it.id}>
                  {newDay && (
                    <li className="my-2 flex justify-center" aria-hidden="true">
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium capitalize text-slate-500 shadow-sm">{dayLabel(new Date(it.at).toISOString())}</span>
                    </li>
                  )}
                  {it.kind === 'msg' && conv && <MessageBubble m={it.m} conv={conv} first={!sameAuthor} srPrefix="WhatsApp, " />}
                  {it.kind === 'note' && <NoteCard e={it.e} />}
                  {it.kind === 'event' && <EventLine a={it.a} />}
                  {it.kind === 'form' && <FormEvent lead={lead} />}
                </Fragment>
              )
            })}
          </ol>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <div className="shrink-0">
        <div className="flex items-center gap-1 border-t border-slate-200 bg-white px-3 pt-2" role="group" aria-label="O que escrever">
          <button
            type="button"
            aria-pressed={mode === 'wa'}
            onClick={() => setMode('wa')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${mode === 'wa' ? 'bg-emerald-500/15 text-emerald-500' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <MessageCircle size={14} aria-hidden="true" /> WhatsApp
          </button>
          <button
            type="button"
            aria-pressed={mode === 'note'}
            onClick={() => setMode('note')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${mode === 'note' ? 'bg-amber-500/15 text-amber-500' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <NotebookPen size={14} aria-hidden="true" /> Registrar contato
          </button>
          {conv && (
            <Link to={`/leads?aba=conversas&c=${conv.waId}`} className="ml-auto rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              Abrir na caixa de conversas
            </Link>
          )}
        </div>
        {mode === 'note' ? (
          <NoteComposer lead={lead} />
        ) : conv ? (
          <Composer conv={conv} templates={templates} />
        ) : hasPhone ? (
          <div className="flex flex-col gap-3 bg-white p-4">
            <p className="text-sm text-slate-500">Ainda não tem conversa com esse lead. A primeira mensagem precisa ser um modelo aprovado no Meta; quando ele responder, dá pra escrever livre.</p>
            <TemplateComposer to={lead.whatsapp} name={lead.contactName} templates={templates} onSent={(id) => updateWaConversation(id, { leadId: lead.id }).catch(() => {})} />
          </div>
        ) : (
          <p className="bg-white p-4 text-sm text-slate-500">Sem WhatsApp cadastrado. Coloque o número nos dados do lead para conversar por aqui.</p>
        )}
      </div>
    </section>
  )
}

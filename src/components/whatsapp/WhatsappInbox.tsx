import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertTriangle, ArrowLeft, Bot, Check, CheckCheck, ChevronRight, Clock, MessageCircle, Plus, Search, Send, ShoppingCart, Sparkles, UserRound, X } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Field, Input, Select } from '../ui/Field'
import { listenMessages, replyWithAi, sendWaTemplate, sendWaText, updateWaConversation } from '../../services/whatsappService'
import { waInWindow, type WaConversation, type WaMessage, type WaTemplate } from '../../types/whatsapp'
import { useLeads } from '../../hooks/useLeads'
import { useLeadPipelines } from '../../hooks/useLeadPipelines'
import { findConversationLead, useWaConversations } from '../../hooks/useWaConversations'
import { isQuestionnaireLead, locateLead, type Lead } from '../../types'

type Filter = 'all' | 'unread' | 'new' | 'crm' | 'ai' | 'human' | 'cart'

const FILTERS: { id: Filter; label: string; long: string }[] = [
  { id: 'all', label: 'Todas', long: 'Todas as conversas' },
  { id: 'unread', label: 'Não lidas', long: 'Só não lidas' },
  { id: 'new', label: 'Leads novos', long: 'Leads novos, que chegaram pelo WhatsApp' },
  { id: 'crm', label: 'Já no CRM', long: 'Quem já estava no CRM e voltou a chamar' },
  { id: 'ai', label: 'IA', long: 'IA atendendo' },
  { id: 'human', label: 'Equipe', long: 'Com a equipe' },
  { id: 'cart', label: 'Carrinho', long: 'Carrinho abandonado' },
]

export const STATUS_LABEL: Record<string, string> = {
  received: 'recebida',
  sent: 'enviada',
  delivered: 'entregue',
  read: 'lida',
  failed: 'não enviada',
}

export const AUTO = new Set(['ai', 'followup', 'cart'])

export const hhmm = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function listTime(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return hhmm(d)
  if (new Date(now.getTime() - 86400_000).toDateString() === d.toDateString()) return 'ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function dayLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Hoje'
  if (new Date(now.getTime() - 86400_000).toDateString() === d.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

export function authorLabel(m: WaMessage, conv: WaConversation) {
  if (m.direction === 'in') return conv.name || 'Contato'
  if (m.by === 'ai') return 'IA'
  if (m.by === 'followup') return m.byName || 'Follow-up automático'
  if (m.by === 'cart') return 'Carrinho abandonado'
  return m.byName || 'Equipe'
}

const displayName = (c: WaConversation) => c.name || c.phone

/* ------------------------------ peças ------------------------------ */

/** Chave liga/desliga acessível (role="switch"). */
export function Switch({ checked, onChange, label, busy }: { checked: boolean; onChange: () => void; label: string; busy?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={busy}
      onClick={onChange}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
    >
      <span className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  )
}

function EmptyPane({ title, text }: { title: string; text: string }) {
  return (
    <div className="m-auto flex max-w-xs flex-col items-center gap-3 p-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400" aria-hidden="true">
        <MessageCircle size={26} />
      </span>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  )
}

/* ------------------------------ modelo ------------------------------ */

export function TemplateComposer({ to, name, templates, onSent }: { to: string; name?: string; templates: WaTemplate[]; onSent: (waId: string) => void }) {
  const approved = templates.filter((t) => t.status === 'APPROVED')
  const [tplKey, setTplKey] = useState('')
  const [params, setParams] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const tpl = approved.find((t) => `${t.name}|${t.language}` === tplKey)

  const pick = (key: string) => {
    setTplKey(key)
    const next = approved.find((t) => `${t.name}|${t.language}` === key)
    const first = (name || '').trim().split(/\s+/)[0] || ''
    setParams(next ? Array.from({ length: next.vars }, (_, i) => (i === 0 ? first : '')) : [])
  }

  const preview = tpl ? tpl.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`) : ''

  const send = async () => {
    if (!tpl) return
    if (params.some((p) => !p.trim())) return toast.error('Preencha todas as variáveis do modelo.')
    setSending(true)
    try {
      const out = await sendWaTemplate(to, { name: tpl.name, lang: tpl.language, params }, name)
      toast.success('Mensagem de modelo enviada')
      pick('')
      onSent(out.waId)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  if (!approved.length) {
    return <p className="text-sm text-slate-500">Nenhum modelo aprovado ainda. Crie um no Gerenciador do WhatsApp do Meta e espere a aprovação.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      <Field label="Mensagem de modelo">
        <Select value={tplKey} onChange={(e) => pick(e.target.value)}>
          <option value="">Escolha um modelo</option>
          {approved.map((t) => (
            <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
              {t.name} ({t.language})
            </option>
          ))}
        </Select>
      </Field>
      {tpl && params.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {params.map((p, i) => (
            <Field key={i} label={`Variável ${i + 1}`}>
              <Input value={p} onChange={(e) => setParams((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))} />
            </Field>
          ))}
        </div>
      )}
      {tpl && (
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-500">Prévia</span>
          <p className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-600 px-3 py-2 text-sm text-white">{preview}</p>
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={send} loading={sending} disabled={!tpl} icon={<Send size={15} aria-hidden="true" />}>
          Enviar modelo
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------ caixa de texto ------------------------------ */

export function Composer({ conv, templates }: { conv: WaConversation; templates: WaTemplate[] }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [, tick] = useState(0)
  const taRef = useRef<HTMLTextAreaElement>(null)
  // A janela de 24h fecha com o tempo: reavalia a cada minuto.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  const open = waInWindow(conv)

  const grow = () => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }

  const send = async () => {
    const clean = text.trim()
    if (!clean || sending) return
    setSending(true)
    try {
      await sendWaText(conv.waId, clean)
      setText('')
      requestAnimationFrame(grow)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const aiReply = async () => {
    setAiBusy(true)
    try {
      const out = await replyWithAi(conv.waId)
      if (out.replied) toast.success('A IA respondeu')
      else toast(out.skipped ? `A IA não respondeu: ${out.skipped}` : 'A IA não respondeu')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAiBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-3 border-t border-slate-200 bg-white p-4">
        <p className="flex items-start gap-2 text-sm text-slate-600">
          <Clock size={16} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
          {conv.lastInboundAt
            ? 'Passou de 24 horas desde a última mensagem do contato. Até ele responder, o WhatsApp só deixa mandar mensagem de modelo.'
            : 'O contato ainda não mandou mensagem. Para começar, use uma mensagem de modelo.'}
        </p>
        <TemplateComposer to={conv.waId} name={conv.name} templates={templates} onSent={() => {}} />
      </div>
    )
  }
  return (
    <div className="border-t border-slate-200 bg-white p-3">
      <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 pl-3 focus-within:border-brand-400">
        <label className="flex-1">
          <span className="sr-only">Mensagem para {displayName(conv)}. Enter envia, Shift + Enter pula linha.</span>
          <textarea
            ref={taRef}
            value={text}
            rows={1}
            placeholder="Escreva uma mensagem"
            onChange={(e) => {
              setText(e.target.value)
              grow()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
            className="block max-h-[140px] w-full resize-none border-0 bg-transparent py-1.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
            style={{ background: 'transparent', border: 0 }}
          />
        </label>
        {conv.lastDirection === 'in' && (
          <button
            type="button"
            onClick={aiReply}
            disabled={aiBusy}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-violet-600 hover:bg-violet-50 disabled:opacity-60"
          >
            <Sparkles size={15} aria-hidden="true" className={aiBusy ? 'animate-pulse' : ''} />
            {aiBusy ? 'Pensando…' : 'Responder com IA'}
          </button>
        )}
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || sending}
          aria-label="Enviar mensagem"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          <Send size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

/* ------------------------------ conversa ------------------------------ */

export function StatusTicks({ status }: { status: string }) {
  if (status === 'read') return <CheckCheck size={14} className="text-sky-300" aria-hidden="true" />
  if (status === 'delivered') return <CheckCheck size={14} aria-hidden="true" />
  if (status === 'failed') return <AlertTriangle size={13} className="text-red-200" aria-hidden="true" />
  return <Check size={14} aria-hidden="true" />
}

function Thread({ conv, templates, onBack, lead, onOpenLead }: { conv: WaConversation; templates: WaTemplate[]; onBack: () => void; lead: Lead | null; onOpenLead: (id: string) => void }) {
  const { pipelines } = useLeadPipelines()
  const where = lead ? locateLead(pipelines, lead) : null
  const [messages, setMessages] = useState<WaMessage[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const lastCount = useRef(0)

  useEffect(() => {
    lastCount.current = 0
    return listenMessages(conv.waId, setMessages, () => toast.error('Não consegui carregar as mensagens.'))
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

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col" aria-label={`Conversa com ${displayName(conv)}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button type="button" onClick={onBack} className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Voltar para a lista de conversas">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <Avatar name={displayName(conv)} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold text-slate-800">{displayName(conv)}</h2>
          <p className="truncate text-xs text-slate-500">
            {conv.phone}
            {conv.kind === 'cart' && conv.productName ? ` · Carrinho de ${conv.productName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Switch checked={aiOn} busy={busy === 'ai'} label="IA" onChange={() => run('ai', () => updateWaConversation(conv.waId, { aiMode: aiOn ? 'off' : 'auto' }), aiOn ? 'IA desligada nesta conversa' : 'IA ligada nesta conversa')} />
          <Switch checked={followOn} busy={busy === 'fu'} label="Follow-up" onChange={() => run('fu', () => updateWaConversation(conv.waId, { followUpStopped: followOn }), followOn ? 'Follow-up parado' : 'Follow-up ligado')} />
        </div>
      </header>

      {/* Ficha do lead ligada à conversa (estilo Kommo): etapa e atalho pra abrir. */}
      {lead && where ? (
        <button
          type="button"
          onClick={() => onOpenLead(lead.id)}
          className="flex w-full items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-left text-sm hover:bg-slate-50"
          aria-label={`Abrir a ficha do lead ${lead.contactName}${lead.companyName ? `, ${lead.companyName}` : ''}. ${isQuestionnaireLead(lead) ? 'Na aba Questionários' : `Pipeline ${where.pipeline.name}, etapa ${where.stage.label}`}`}
        >
          <UserRound size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
          <span className="min-w-0 truncate font-medium text-slate-700">
            {lead.contactName}
            {lead.companyName ? <span className="font-normal text-slate-400">, {lead.companyName}</span> : null}
          </span>
          {isQuestionnaireLead(lead) ? (
            <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Questionário</span>
          ) : (
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${where.stage.color}26`, color: where.stage.color }}>
              {where.pipeline.name}: {where.stage.label}
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-0.5 text-xs font-semibold text-brand-600">
            Abrir ficha <ChevronRight size={14} aria-hidden="true" />
          </span>
        </button>
      ) : (
        <p className="border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-400">Esse número ainda não está ligado a nenhum lead do CRM.</p>
      )}

      {conv.aiMode === 'off' && conv.handoffReason && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800" role="status">
          <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
          <span className="flex-1">A IA passou para a equipe: {conv.handoffReason}</span>
          <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold hover:bg-amber-100" onClick={() => run('ai', () => updateWaConversation(conv.waId, { aiMode: 'auto' }), 'Conversa devolvida para a IA')}>
            Devolver para a IA
          </button>
        </div>
      )}
      {conv.followUpError && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
          Último follow-up falhou: {conv.followUpError}
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Ainda não há mensagens nesta conversa.</p>
        ) : (
          <ol className="mx-auto flex max-w-3xl flex-col" aria-label="Mensagens">
            {messages.map((m, i) => {
              const prev = messages[i - 1]
              const mine = m.direction === 'out'
              const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString()
              const author = authorLabel(m, conv)
              const sameAuthor = prev && !newDay && prev.direction === m.direction && authorLabel(prev, conv) === author
              const showAuthor = !sameAuthor && mine
              const auto = AUTO.has(m.by)
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <li className="my-3 flex justify-center" aria-hidden="true">
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium capitalize text-slate-500 shadow-sm">{dayLabel(m.at)}</span>
                    </li>
                  )}
                  <li className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${sameAuthor ? 'mt-1' : 'mt-3'}`}>
                    {showAuthor && (
                      <span className={`mb-1 flex items-center gap-1 px-1 text-[11px] font-medium ${auto ? 'text-violet-600' : 'text-slate-500'}`}>
                        {auto && <Bot size={12} aria-hidden="true" />}
                        {author}
                      </span>
                    )}
                    <div
                      className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                        mine ? `rounded-br-md text-white ${m.status === 'failed' ? 'bg-red-600' : 'bg-brand-600'}` : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
                      }`}
                    >
                      <span className="sr-only">{author}: </span>
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10.5px] ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                        {hhmm(new Date(m.at))}
                        {mine && (
                          <>
                            <StatusTicks status={m.status} />
                            <span className="sr-only">, {STATUS_LABEL[m.status] || m.status}</span>
                          </>
                        )}
                      </p>
                    </div>
                    {m.status === 'failed' && m.error && <span className="mt-1 px-1 text-xs text-red-600">Não enviada: {m.error}</span>}
                  </li>
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
  )
}

/* ------------------------------ nova conversa ------------------------------ */

function NewConversation({ templates, onDone }: { templates: WaTemplate[]; onDone: (waId: string | null) => void }) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const ok = phone.replace(/\D/g, '').length >= 10
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Nova conversa">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <h2 className="flex-1 text-[15px] font-semibold text-slate-800">Nova conversa</h2>
        <button type="button" onClick={() => onDone(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cancelar nova conversa">
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
        <div className="mx-auto flex max-w-lg flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Para quem ainda não chamou, a primeira mensagem precisa ser um modelo aprovado no Meta. Quando a pessoa responder, dá para escrever livre.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="WhatsApp com DDD" required>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 98765-4321" inputMode="tel" />
            </Field>
            <Field label="Nome">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          {ok ? <TemplateComposer to={phone} name={name} templates={templates} onSent={(waId) => onDone(waId)} /> : <p className="text-sm text-slate-400">Digite o número para escolher o modelo.</p>}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------ caixa de entrada ------------------------------ */

export function WhatsappInbox({ templates, onCount, onOpenLead }: { templates: WaTemplate[]; onCount?: (n: number) => void; onOpenLead?: (leadId: string) => void }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { data: convData, loading: convLoading, error: convError } = useWaConversations()
  const rows: WaConversation[] | null = convLoading ? null : convData
  const { data: leads } = useLeads()
  const { pipelines } = useLeadPipelines()
  const openLead = onOpenLead ?? ((id: string) => navigate(`/leads?lead=${id}`))
  const leadOf = (c: WaConversation) => findConversationLead(c, leads)
  /** 'crm' = o número já estava no CRM quando chamou; 'new' = virou lead agora. */
  const originOf = (c: WaConversation): 'crm' | 'new' | null => {
    if (c.leadMatch === 'existing') return 'crm'
    if (c.leadMatch === 'created') return 'new'
    if (c.kind !== 'lead') return null
    const l = leadOf(c)
    if (!l) return null
    return l.createdBy === 'whatsapp' ? 'new' : 'crm'
  }
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(false)
  const selected = params.get('c')

  useEffect(() => {
    if (convError) toast.error('Não consegui carregar as conversas.')
  }, [convError])

  const select = (waId: string | null) => {
    const next = new URLSearchParams(params)
    if (waId) next.set('c', waId)
    else next.delete('c')
    setParams(next, { replace: true })
  }

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    return (rows || []).filter((c) => {
      if (filter === 'unread' && !(c.unread > 0)) return false
      if (filter === 'new' && originOf(c) !== 'new') return false
      if (filter === 'crm' && originOf(c) !== 'crm') return false
      if (filter === 'ai' && c.aiMode === 'off') return false
      if (filter === 'human' && c.aiMode !== 'off') return false
      if (filter === 'cart' && c.kind !== 'cart') return false
      if (!q) return true
      return (c.name || '').toLowerCase().includes(q) || (qDigits.length >= 3 && c.waId.includes(qDigits)) || (c.lastMessageText || '').toLowerCase().includes(q)
    })
  }, [rows, search, filter, leads]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rows) onCount?.(rows.length)
  }, [rows, onCount])

  const counts = useMemo(() => {
    const r = rows || []
    return {
      all: r.length,
      unread: r.filter((c) => c.unread > 0).length,
      new: r.filter((c) => originOf(c) === 'new').length,
      crm: r.filter((c) => originOf(c) === 'crm').length,
      ai: r.filter((c) => c.aiMode !== 'off').length,
      human: r.filter((c) => c.aiMode === 'off').length,
      cart: r.filter((c) => c.kind === 'cart').length,
    } as Record<Filter, number>
  }, [rows, leads]) // eslint-disable-line react-hooks/exhaustive-deps

  const current = (rows || []).find((c) => c.waId === selected) || null
  const unreadTotal = (rows || []).filter((c) => c.unread > 0).length
  const showThread = Boolean(current) || creating

  // Nenhuma conversa ainda: só uma faixa com o botão de começar (o guia fica em cima).
  if (rows && rows.length === 0 && !creating) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-4">
        <MessageCircle size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-slate-500">Nenhuma conversa ainda. Quer chamar alguém primeiro? Precisa de um modelo aprovado.</p>
        <Button size="sm" variant="secondary" icon={<Plus size={14} aria-hidden="true" />} onClick={() => setCreating(true)}>
          Nova conversa
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-230px)] min-h-[480px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <aside className={`w-full shrink-0 flex-col border-r border-slate-200 md:flex md:w-[340px] ${showThread ? 'hidden' : 'flex'}`} aria-label="Lista de conversas">
        <div className="flex shrink-0 flex-col gap-3 border-b border-slate-200 p-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 className="text-[15px] font-semibold text-slate-800">
              Conversas
              {unreadTotal > 0 && <span className="ml-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white">{unreadTotal} não lidas</span>}
            </h2>
            <button
              type="button"
              onClick={() => {
                select(null)
                setCreating(true)
              }}
              className="flex h-8 items-center gap-1 rounded-lg bg-brand-600 px-2.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              <Plus size={14} aria-hidden="true" /> Nova
            </button>
          </div>
          <label className="relative block">
            <span className="sr-only">Buscar conversa por nome, número ou mensagem</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome, número ou mensagem"
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-400"
            />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar conversas">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                aria-label={`${f.long}: ${counts[f.id]}`}
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${filter === f.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {f.label}
                {f.id !== 'all' && counts[f.id] > 0 && <span className="ml-1 opacity-70">{counts[f.id]}</span>}
              </button>
            ))}
          </div>
        </div>
        {rows === null ? (
          <p className="p-6 text-center text-sm text-slate-400">Carregando conversas…</p>
        ) : list.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">{rows.length ? 'Nenhuma conversa nesse filtro.' : 'Nenhuma conversa ainda. Quando alguém chamar no WhatsApp, aparece aqui.'}</p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {list.map((c) => {
              const active = c.waId === selected
              const status = c.aiMode === 'off' ? 'com a equipe' : 'IA atendendo'
              const unread = c.unread > 0
              const lead = leadOf(c)
              const where = lead && !isQuestionnaireLead(lead) ? locateLead(pipelines, lead) : null
              const origin = originOf(c)
              return (
                <li key={c.waId}>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false)
                      select(c.waId)
                    }}
                    aria-current={active ? 'true' : undefined}
                    aria-label={`${displayName(c)}. ${origin === 'crm' ? 'Já estava no CRM. ' : origin === 'new' ? 'Lead novo. ' : ''}${where ? `Etapa ${where.stage.label}. ` : ''}${unread ? `${c.unread} não lidas. ` : ''}${status}${c.kind === 'cart' ? ', carrinho abandonado' : ''}. Última mensagem ${c.lastDirection === 'in' ? 'do contato' : 'nossa'}: ${c.lastMessageText || 'sem mensagem'}. ${listTime(c.lastMessageAt)}`}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${active ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                  >
                    <Avatar name={displayName(c)} size="lg" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`flex-1 truncate text-sm ${unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>{displayName(c)}</span>
                        <span className={`shrink-0 text-[11px] ${unread ? 'font-semibold text-emerald-600' : 'text-slate-400'}`}>{listTime(c.lastMessageAt)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        {c.kind === 'cart' ? (
                          <ShoppingCart size={13} className="shrink-0 text-amber-500" aria-hidden="true" />
                        ) : c.aiMode === 'off' ? (
                          <UserRound size={13} className="shrink-0 text-amber-500" aria-hidden="true" />
                        ) : (
                          <Bot size={13} className="shrink-0 text-violet-500" aria-hidden="true" />
                        )}
                        <span className={`flex-1 truncate text-xs ${unread ? 'text-slate-700' : 'text-slate-500'}`}>
                          {c.lastDirection === 'out' ? 'Você: ' : ''}
                          {c.lastMessageText}
                        </span>
                        {unread && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}
                      </span>
                      {(origin || where) && (
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          {origin === 'crm' && <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-sky-500">Já no CRM</span>}
                          {origin === 'new' && <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-500">Lead novo</span>}
                          {where && (
                            <span className="max-w-full truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ backgroundColor: `${where.stage.color}26`, color: where.stage.color }}>
                              {where.stage.label}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </aside>
      <div className={`min-h-0 min-w-0 flex-1 flex-col ${showThread ? 'flex' : 'hidden md:flex'}`}>
        {creating ? (
          <NewConversation
            templates={templates}
            onDone={(waId) => {
              setCreating(false)
              if (waId) select(waId)
            }}
          />
        ) : current ? (
          <Thread key={current.waId} conv={current} templates={templates} onBack={() => select(null)} lead={leadOf(current)} onOpenLead={openLead} />
        ) : (
          <div className="flex flex-1 bg-slate-50">
            <EmptyPane title="Nenhuma conversa aberta" text="Escolha uma conversa na lista ou comece uma nova. A IA continua respondendo enquanto isso." />
          </div>
        )}
      </div>
    </div>
  )
}

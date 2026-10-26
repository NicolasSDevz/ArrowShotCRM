import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, Bot, BellOff, BellRing, MessageSquarePlus, Search, Send, Sparkles, UserRound } from 'lucide-react'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { listenConversations, listenMessages, replyWithAi, sendWaTemplate, sendWaText, updateWaConversation } from '../../services/whatsappService'
import { waInWindow, type WaConversation, type WaMessage, type WaTemplate } from '../../types/whatsapp'

type Filter = 'all' | 'unread' | 'ai' | 'human' | 'cart'

const FILTER_LABEL: Record<Filter, string> = {
  all: 'Todas',
  unread: 'Não lidas',
  ai: 'IA atendendo',
  human: 'Com a equipe',
  cart: 'Carrinho abandonado',
}

const STATUS_LABEL: Record<string, string> = {
  received: 'recebida',
  sent: 'enviada',
  delivered: 'entregue',
  read: 'lida',
  failed: 'não enviada',
}

function timeLabel(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const yesterday = new Date(now.getTime() - 86400_000).toDateString() === d.toDateString()
  if (yesterday) return `ontem ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function authorLabel(m: WaMessage, conv: WaConversation) {
  if (m.direction === 'in') return conv.name || 'Contato'
  if (m.by === 'ai') return 'IA'
  if (m.by === 'followup') return m.byName || 'Follow-up automático'
  if (m.by === 'cart') return 'Carrinho abandonado (automático)'
  return m.byName || 'Equipe'
}

const displayName = (c: WaConversation) => c.name || c.phone

/* ------------------------------ composer ------------------------------ */

function TemplateComposer({
  to,
  name,
  templates,
  onSent,
}: {
  to: string
  name?: string
  templates: WaTemplate[]
  onSent: (waId: string) => void
}) {
  const approved = templates.filter((t) => t.status === 'APPROVED')
  const [tplKey, setTplKey] = useState('')
  const [params, setParams] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const tpl = approved.find((t) => `${t.name}|${t.language}` === tplKey)

  useEffect(() => {
    if (!tpl) return setParams([])
    const first = (name || '').trim().split(/\s+/)[0] || ''
    setParams(Array.from({ length: tpl.vars }, (_, i) => (i === 0 ? first : '')))
  }, [tplKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const preview = tpl ? tpl.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`) : ''

  const send = async () => {
    if (!tpl) return
    if (params.some((p) => !p.trim())) return toast.error('Preencha todas as variáveis do modelo.')
    setSending(true)
    try {
      const out = await sendWaTemplate(to, { name: tpl.name, lang: tpl.language, params }, name)
      toast.success('Mensagem de modelo enviada')
      setTplKey('')
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
    <div className="flex flex-col gap-2">
      <Field label="Mensagem de modelo">
        <Select value={tplKey} onChange={(e) => setTplKey(e.target.value)}>
          <option value="">Escolha um modelo</option>
          {approved.map((t) => (
            <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
              {t.name} ({t.language})
            </option>
          ))}
        </Select>
      </Field>
      {tpl &&
        params.map((p, i) => (
          <Field key={i} label={`Variável ${i + 1}`}>
            <Input value={p} onChange={(e) => setParams((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))} />
          </Field>
        ))}
      {tpl && (
        <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-slate-600" aria-label="Prévia da mensagem">
          {preview}
        </p>
      )}
      <Button onClick={send} loading={sending} disabled={!tpl} icon={<Send size={15} aria-hidden="true" />}>
        Enviar modelo
      </Button>
    </div>
  )
}

function Composer({ conv, templates }: { conv: WaConversation; templates: WaTemplate[] }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [, tick] = useState(0)
  // A janela de 24h fecha com o tempo: reavalia a cada minuto.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  const open = waInWindow(conv)

  const send = async () => {
    const clean = text.trim()
    if (!clean) return
    setSending(true)
    try {
      await sendWaText(conv.waId, clean)
      setText('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2 border-t border-slate-200 p-3">
        <p className="text-sm text-amber-700">
          {conv.lastInboundAt
            ? 'Passou de 24 horas desde a última mensagem do contato. O WhatsApp só deixa mandar mensagem de modelo até ele responder.'
            : 'O contato ainda não mandou mensagem. Para começar, use uma mensagem de modelo.'}
        </p>
        <TemplateComposer to={conv.waId} name={conv.name} templates={templates} onSent={() => {}} />
      </div>
    )
  }
  return (
    <div className="flex items-end gap-2 border-t border-slate-200 p-3">
      <label className="flex-1">
        <span className="sr-only">Mensagem para {displayName(conv)}</span>
        <Textarea
          value={text}
          rows={2}
          placeholder="Escreva a mensagem. Ctrl + Enter envia."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              send()
            }
          }}
        />
      </label>
      <Button onClick={send} loading={sending} disabled={!text.trim()} icon={<Send size={15} aria-hidden="true" />}>
        Enviar
      </Button>
    </div>
  )
}

/* ------------------------------ conversa ------------------------------ */

function Thread({ conv, templates, onBack }: { conv: WaConversation; templates: WaTemplate[]; onBack: () => void }) {
  const [messages, setMessages] = useState<WaMessage[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  const lastCount = useRef(0)

  useEffect(() => {
    lastCount.current = 0
    return listenMessages(conv.waId, setMessages, () => toast.error('Não consegui carregar as mensagens.'))
  }, [conv.waId])

  // Mensagem nova do contato: anuncia no leitor de tela e rola até o fim.
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
      toast.success(ok)
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
    <section className="flex h-full min-h-0 flex-col" aria-label={`Conversa com ${displayName(conv)}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
        <button type="button" onClick={onBack} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Voltar para a lista de conversas">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-slate-800">{displayName(conv)}</h2>
          <p className="text-xs text-slate-500">
            {conv.phone}
            {conv.kind === 'cart' && conv.productName ? `. Carrinho abandonado de ${conv.productName}` : ''}
          </p>
        </div>
        {conv.leadId && (
          <Link to="/leads" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <UserRound size={14} aria-hidden="true" /> Ver nos Leads
          </Link>
        )}
        <Button
          size="sm"
          variant={aiOn ? 'primary' : 'secondary'}
          aria-pressed={aiOn}
          loading={busy === 'ai'}
          icon={<Bot size={14} aria-hidden="true" />}
          onClick={() => run('ai', () => updateWaConversation(conv.waId, { aiMode: aiOn ? 'off' : 'auto' }), aiOn ? 'IA desligada nesta conversa' : 'IA ligada nesta conversa')}
        >
          {aiOn ? 'IA respondendo: ligada' : 'IA respondendo: desligada'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          aria-pressed={followOn}
          loading={busy === 'fu'}
          icon={followOn ? <BellRing size={14} aria-hidden="true" /> : <BellOff size={14} aria-hidden="true" />}
          onClick={() => run('fu', () => updateWaConversation(conv.waId, { followUpStopped: followOn }), followOn ? 'Follow-up parado' : 'Follow-up ligado')}
        >
          {followOn ? 'Follow-up: ligado' : 'Follow-up: parado'}
        </Button>
        {conv.lastDirection === 'in' && waInWindow(conv) && (
          <Button size="sm" variant="secondary" loading={busy === 'reply'} icon={<Sparkles size={14} aria-hidden="true" />} onClick={() => run('reply', () => replyWithAi(conv.waId), 'A IA respondeu')}>
            Responder com IA
          </Button>
        )}
      </div>

      {conv.aiMode === 'off' && conv.handoffReason && (
        <p className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          A IA passou para a equipe. Motivo: {conv.handoffReason}
        </p>
      )}
      {conv.followUpError && <p className="border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Último follow-up falhou: {conv.followUpError}</p>}

      <ol ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3" aria-label="Mensagens">
        {messages.map((m) => {
          const mine = m.direction === 'out'
          return (
            <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${mine ? (m.by === 'ai' || m.by === 'followup' || m.by === 'cart' ? 'bg-violet-50 text-slate-800' : 'bg-emerald-50 text-slate-800') : 'border border-slate-200 bg-white text-slate-800'}`}>
                <p className="mb-0.5 text-[11px] font-semibold text-slate-500">{authorLabel(m, conv)}</p>
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p className="mt-1 text-right text-[11px] text-slate-400">
                  {timeLabel(m.at)}
                  {mine && `. ${STATUS_LABEL[m.status] || m.status}`}
                </p>
                {m.status === 'failed' && m.error && <p className="mt-1 text-xs text-red-600">Motivo: {m.error}</p>}
              </div>
            </li>
          )
        })}
      </ol>
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
    <section className="flex flex-col gap-3 p-4" aria-label="Nova conversa">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onDone(null)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cancelar nova conversa">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <h2 className="text-base font-semibold text-slate-800">Nova conversa</h2>
      </div>
      <p className="text-sm text-slate-500">A primeira mensagem para quem ainda não chamou precisa ser um modelo aprovado no Meta. Depois que a pessoa responder, dá para escrever livre.</p>
      <Field label="WhatsApp com DDD" required>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 98765-4321" inputMode="tel" />
      </Field>
      <Field label="Nome">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {ok ? <TemplateComposer to={phone} name={name} templates={templates} onSent={(waId) => onDone(waId)} /> : <p className="text-sm text-slate-400">Digite o número para escolher o modelo.</p>}
    </section>
  )
}

/* ------------------------------ caixa de entrada ------------------------------ */

export function WhatsappInbox({ templates }: { templates: WaTemplate[] }) {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<WaConversation[] | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(false)
  const selected = params.get('c')

  useEffect(() => listenConversations(setRows, () => toast.error('Não consegui carregar as conversas.')), [])

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
      if (filter === 'ai' && c.aiMode === 'off') return false
      if (filter === 'human' && c.aiMode !== 'off') return false
      if (filter === 'cart' && c.kind !== 'cart') return false
      if (!q) return true
      return (c.name || '').toLowerCase().includes(q) || (qDigits.length >= 3 && c.waId.includes(qDigits)) || (c.lastMessageText || '').toLowerCase().includes(q)
    })
  }, [rows, search, filter])

  const current = (rows || []).find((c) => c.waId === selected) || null
  const unreadTotal = (rows || []).reduce((s, c) => s + (c.unread > 0 ? 1 : 0), 0)
  const showThread = Boolean(current) || creating

  return (
    <div className="grid h-[calc(100vh-220px)] min-h-[480px] grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white md:grid-cols-[320px_1fr]">
      <aside className={`flex min-h-0 flex-col border-r border-slate-200 ${showThread ? 'hidden md:flex' : 'flex'}`} aria-label="Lista de conversas">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <label className="relative flex-1">
              <span className="sr-only">Buscar conversa por nome, número ou mensagem</span>
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" className="pl-8" />
            </label>
            <Button
              size="md"
              variant="secondary"
              aria-label="Nova conversa"
              icon={<MessageSquarePlus size={16} aria-hidden="true" />}
              onClick={() => {
                select(null)
                setCreating(true)
              }}
            />
          </div>
          <label>
            <span className="sr-only">Filtrar conversas</span>
            <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
                <option key={f} value={f}>
                  {FILTER_LABEL[f]}
                  {f === 'unread' && unreadTotal ? ` (${unreadTotal})` : ''}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {rows === null ? (
          <p className="p-4 text-sm text-slate-400">Carregando conversas…</p>
        ) : list.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">{rows.length ? 'Nenhuma conversa nesse filtro.' : 'Nenhuma conversa ainda. Quando alguém chamar no WhatsApp, aparece aqui.'}</p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {list.map((c) => {
              const active = c.waId === selected
              const status = c.aiMode === 'off' ? 'com a equipe' : 'IA atendendo'
              return (
                <li key={c.waId}>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false)
                      select(c.waId)
                    }}
                    aria-current={active ? 'true' : undefined}
                    aria-label={`${displayName(c)}. ${c.unread > 0 ? `${c.unread} não lidas. ` : ''}${status}. Última mensagem ${c.lastDirection === 'in' ? 'do contato' : 'nossa'}: ${c.lastMessageText || 'sem mensagem'}. ${timeLabel(c.lastMessageAt)}`}
                    className={`flex w-full flex-col gap-0.5 border-b border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50 ${active ? 'bg-brand-50' : ''}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`flex-1 truncate text-sm ${c.unread > 0 ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{displayName(c)}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">{timeLabel(c.lastMessageAt)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="flex-1 truncate text-xs text-slate-500">
                        {c.lastDirection === 'out' ? 'Você: ' : ''}
                        {c.lastMessageText}
                      </span>
                      {c.unread > 0 && <span className="shrink-0 rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}
                    </span>
                    <span className={`text-[11px] ${c.aiMode === 'off' ? 'text-amber-600' : 'text-violet-600'}`}>
                      {status}
                      {c.kind === 'cart' ? '. Carrinho' : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </aside>
      <div className={`min-h-0 ${showThread ? 'flex' : 'hidden md:flex'} flex-col`}>
        {creating ? (
          <NewConversation
            templates={templates}
            onDone={(waId) => {
              setCreating(false)
              if (waId) select(waId)
            }}
          />
        ) : current ? (
          <Thread conv={current} templates={templates} onBack={() => select(null)} />
        ) : (
          <p className="m-auto p-6 text-center text-sm text-slate-400">Escolha uma conversa na lista.</p>
        )}
      </div>
    </div>
  )
}

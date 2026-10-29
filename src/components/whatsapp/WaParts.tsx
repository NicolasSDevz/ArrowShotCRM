import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, Bot, Check, CheckCheck, Clock, MessageCircle, Send, Sparkles } from 'lucide-react'
import { Button } from '../ui/Button'
import { Field, Input, Select } from '../ui/Field'
import { replyWithAi, sendWaTemplate, sendWaText } from '../../services/whatsappService'
import { waInWindow, type WaConversation, type WaMessage, type WaTemplate } from '../../types/whatsapp'

/* Peças do WhatsApp usadas na caixa de conversas, na ficha do lead e nas Vendas. */

export const STATUS_LABEL: Record<string, string> = {
  received: 'recebida',
  sent: 'enviada',
  delivered: 'entregue',
  read: 'lida',
  failed: 'não enviada',
}

export const AUTO = new Set(['ai', 'followup', 'cart', 'reminder'])

export const hhmm = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export function listTime(iso: string) {
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

export function authorLabel(m: WaMessage, conv: Pick<WaConversation, 'name'>) {
  if (m.direction === 'in') return conv.name || 'Contato'
  if (m.by === 'ai') return m.byName || 'IA'
  if (m.by === 'followup') return m.byName || 'Follow-up automático'
  if (m.by === 'reminder') return m.byName || 'Lembrete da reunião'
  if (m.by === 'cart') return 'Carrinho abandonado'
  return m.byName || 'Equipe'
}

export const displayName = (c: Pick<WaConversation, 'name' | 'phone'>) => c.name || c.phone

/** Chave liga/desliga acessível (role="switch"). */
export function Switch({ checked, onChange, label, busy }: { checked: boolean; onChange: () => void; label: string; busy?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={busy}
      onClick={onChange}
      className={`inline-flex h-8 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition disabled:opacity-60 ${
        checked ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
      }`}
    >
      <span className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  )
}

export function EmptyPane({ title, text }: { title: string; text: string }) {
  return (
    <div className="m-auto flex max-w-xs flex-col items-center gap-3 p-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400 ring-8 ring-emerald-500/5" aria-hidden="true">
        <MessageCircle size={28} />
      </span>
      <p className="text-[15px] font-semibold text-slate-700">{title}</p>
      <p className="text-sm leading-relaxed text-slate-400">{text}</p>
    </div>
  )
}

export function DayDivider({ iso }: { iso: string }) {
  return (
    <li className="sticky top-1 z-[1] my-3 flex justify-center" aria-hidden="true">
      <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold capitalize text-slate-500 shadow-sm backdrop-blur">{dayLabel(iso)}</span>
    </li>
  )
}

export function StatusTicks({ status }: { status: string }) {
  if (status === 'read') return <CheckCheck size={14} className="text-sky-300" aria-hidden="true" />
  if (status === 'delivered') return <CheckCheck size={14} aria-hidden="true" />
  if (status === 'failed') return <AlertTriangle size={13} className="text-red-200" aria-hidden="true" />
  return <Check size={14} aria-hidden="true" />
}

/** Balão no estilo WhatsApp. Nossas: verde (equipe) ou roxo (IA e automáticas). */
export function MessageBubble({ m, conv, first, srPrefix = '' }: { m: WaMessage; conv: Pick<WaConversation, 'name'>; first: boolean; srPrefix?: string }) {
  const mine = m.direction === 'out'
  const auto = AUTO.has(m.by)
  const author = authorLabel(m, conv)
  const tone = !mine
    ? 'bg-[var(--dk-surface-3)] text-slate-800 border border-white/5'
    : m.status === 'failed'
      ? 'bg-red-600/90 text-white'
      : auto
        ? 'bg-[#2f2659] text-white border border-violet-400/20'
        : 'bg-[#0b5d4a] text-white'
  const corner = first ? (mine ? 'rounded-tr-md' : 'rounded-tl-md') : ''
  return (
    <li className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${first ? 'mt-3' : 'mt-0.5'}`}>
      <div className={`max-w-[82%] rounded-2xl px-3 pb-1.5 pt-1.5 text-[14px] leading-relaxed shadow-sm sm:max-w-[72%] ${tone} ${corner}`}>
        <span className="sr-only">
          {srPrefix}
          {author}:{' '}
        </span>
        {first && mine && (
          <span className={`mb-0.5 flex items-center gap-1 text-[11px] font-semibold ${auto ? 'text-violet-200' : 'text-emerald-200'}`} aria-hidden="true">
            {auto && <Bot size={12} />}
            {author}
          </span>
        )}
        <p className="whitespace-pre-wrap break-words">{m.text}</p>
        <p className={`-mb-0.5 mt-0.5 flex items-center justify-end gap-1 text-[10.5px] ${mine ? 'text-white/65' : 'text-slate-400'}`}>
          {hhmm(new Date(m.at))}
          {mine && (
            <>
              <StatusTicks status={m.status} />
              <span className="sr-only">, {STATUS_LABEL[m.status] || m.status}</span>
            </>
          )}
        </p>
      </div>
      {m.status === 'failed' && m.error && <span className="mt-1 px-1 text-xs text-red-400">Não enviada: {m.error}</span>}
    </li>
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
        <div className="wa-wall rounded-xl p-3">
          <span className="mb-1.5 block text-xs font-semibold text-slate-400">Prévia</span>
          <p className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-[#0b5d4a] px-3 py-2 text-sm text-white shadow-sm">{preview}</p>
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
  const leftMs = conv.lastInboundAt ? new Date(conv.lastInboundAt).getTime() + 24 * 3600_000 - Date.now() : 0
  const leftH = Math.max(0, Math.floor(leftMs / 3600_000))

  const grow = () => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
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
        <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-slate-600">
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
    <div className="border-t border-slate-200 bg-white px-3 pb-2 pt-3">
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 items-end rounded-2xl border border-slate-200 bg-slate-50 pl-3.5 pr-1.5 transition focus-within:border-emerald-500/60 focus-within:ring-2 focus-within:ring-emerald-500/15">
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
              className="block max-h-[160px] w-full resize-none border-0 bg-transparent py-2.5 text-[14px] text-slate-800 outline-none placeholder:text-slate-400"
              style={{ background: 'transparent', border: 0 }}
            />
          </label>
          {conv.lastDirection === 'in' && (
            <button
              type="button"
              onClick={aiReply}
              disabled={aiBusy}
              className="mb-1 flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-violet-400 transition hover:bg-violet-500/10 disabled:opacity-60"
            >
              <Sparkles size={15} aria-hidden="true" className={aiBusy ? 'animate-pulse' : ''} />
              <span className="hidden sm:inline">{aiBusy ? 'Pensando…' : 'Responder com IA'}</span>
              <span className="sr-only sm:hidden">{aiBusy ? 'A IA está pensando' : 'Responder com IA'}</span>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || sending}
          aria-label="Enviar mensagem"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-40"
        >
          <Send size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-3 px-1 text-[11px] text-slate-400">
        <span>Enter envia, Shift + Enter pula linha</span>
        {conv.aiMode !== 'off' && <span>Se você responder, a IA para nesta conversa</span>}
        {leftH < 4 && <span className="text-amber-500">Janela de 24h fecha em {leftH < 1 ? 'menos de 1 hora' : `${leftH}h`}</span>}
      </p>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Bot, CalendarCheck, MessageCircle, Plus, Search, ShoppingCart, UserRound, X } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import { EmptyPane, TemplateComposer, displayName, listTime } from './WaParts'
import { SdrChip, WaThread } from './WaThread'
import { hasMeeting, isHot } from './waSdr'
import type { WaConversation, WaTemplate } from '../../types/whatsapp'
import { useLeads } from '../../hooks/useLeads'
import { useLeadPipelines } from '../../hooks/useLeadPipelines'
import { findConversationLead, useWaConversations } from '../../hooks/useWaConversations'
import { isQuestionnaireLead, locateLead } from '../../types'

// Peças antigas importadas daqui por outras telas.
export { AUTO, Composer, STATUS_LABEL, StatusTicks, Switch, TemplateComposer, authorLabel, dayLabel, hhmm } from './WaParts'

export type WaFilter = 'all' | 'unread' | 'hot' | 'meeting' | 'new' | 'crm' | 'ai' | 'human' | 'cart'

const FILTERS: { id: WaFilter; label: string; long: string }[] = [
  { id: 'all', label: 'Todas', long: 'Todas as conversas' },
  { id: 'unread', label: 'Não lidas', long: 'Só não lidas' },
  { id: 'hot', label: 'Quentes', long: 'Leads quentes, segundo o SDR' },
  { id: 'meeting', label: 'Reunião', long: 'Reunião combinada pelo SDR' },
  { id: 'new', label: 'Leads novos', long: 'Leads novos, que chegaram pelo WhatsApp' },
  { id: 'crm', label: 'Já no CRM', long: 'Quem já estava no CRM e voltou a chamar' },
  { id: 'ai', label: 'IA', long: 'IA atendendo' },
  { id: 'human', label: 'Equipe', long: 'Com a equipe' },
  { id: 'cart', label: 'Carrinho', long: 'Carrinho abandonado' },
]

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
      <div className="wa-wall min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-lg flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Para quem ainda não chamou, a primeira mensagem precisa ser um modelo aprovado no Meta. Quando a pessoa responder, dá para escrever livre e a IA assume como SDR.</p>
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

export function WhatsappInbox({
  templates,
  onCount,
  onOpenLead,
  heightClass = 'h-[calc(100dvh-230px)]',
}: {
  templates: WaTemplate[]
  onCount?: (n: number) => void
  onOpenLead?: (leadId: string) => void
  /** Altura da caixa (cada coluna rola por dentro). */
  heightClass?: string
}) {
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
  const [creating, setCreating] = useState(false)
  const selected = params.get('c')
  // Filtro na URL (?f=hot): os números do topo de Conversas também filtram.
  const filter = (FILTERS.some((f) => f.id === params.get('f')) ? params.get('f') : 'all') as WaFilter
  const setFilter = (f: WaFilter) => {
    const next = new URLSearchParams(params)
    if (f === 'all') next.delete('f')
    else next.set('f', f)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    if (convError) toast.error('Não consegui carregar as conversas.')
  }, [convError])

  const select = (waId: string | null) => {
    const next = new URLSearchParams(params)
    if (waId) next.set('c', waId)
    else next.delete('c')
    setParams(next, { replace: true })
  }

  const matches = (c: WaConversation, f: WaFilter) => {
    if (f === 'unread') return c.unread > 0
    if (f === 'hot') return isHot(c)
    if (f === 'meeting') return hasMeeting(c)
    if (f === 'new') return originOf(c) === 'new'
    if (f === 'crm') return originOf(c) === 'crm'
    if (f === 'ai') return c.aiMode !== 'off'
    if (f === 'human') return c.aiMode === 'off'
    if (f === 'cart') return c.kind === 'cart'
    return true
  }

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    return (rows || []).filter((c) => {
      if (!matches(c, filter)) return false
      if (!q) return true
      return (
        (c.name || '').toLowerCase().includes(q) ||
        (qDigits.length >= 3 && c.waId.includes(qDigits)) ||
        (c.lastMessageText || '').toLowerCase().includes(q) ||
        (c.sdr?.profile?.empresa || '').toLowerCase().includes(q) ||
        (c.sdr?.profile?.cidade || '').toLowerCase().includes(q)
      )
    })
  }, [rows, search, filter, leads]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rows) onCount?.(rows.length)
  }, [rows, onCount])

  const counts = useMemo(() => {
    const out = {} as Record<WaFilter, number>
    for (const f of FILTERS) out[f.id] = (rows || []).filter((c) => matches(c, f.id)).length
    return out
  }, [rows, leads]) // eslint-disable-line react-hooks/exhaustive-deps

  const current = (rows || []).find((c) => c.waId === selected) || null
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
    <div className={`flex ${heightClass} min-h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm`}>
      <aside className={`w-full shrink-0 flex-col border-r border-slate-200 md:flex md:w-[360px] ${showThread ? 'hidden' : 'flex'}`} aria-label="Lista de conversas">
        <div className="flex shrink-0 flex-col gap-3 border-b border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <label className="relative block flex-1">
              <span className="sr-only">Buscar conversa por nome, número, empresa, cidade ou mensagem</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nome, número, empresa…"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/15"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                select(null)
                setCreating(true)
              }}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              <Plus size={15} aria-hidden="true" /> Nova
            </button>
          </div>
          <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]" role="group" aria-label="Filtrar conversas">
            {FILTERS.map((f) => {
              const on = filter === f.id
              const n = counts[f.id]
              if (f.id !== 'all' && f.id !== filter && n === 0) return null
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${f.long}: ${n}`}
                  onClick={() => setFilter(f.id)}
                  className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold transition ${on ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {f.label}
                  {f.id !== 'all' && n > 0 && <span className={on ? 'text-white/80' : 'text-slate-400'}>{n}</span>}
                </button>
              )
            })}
          </div>
        </div>
        {rows === null ? (
          <ul className="flex-1 space-y-1 p-2" aria-label="Carregando conversas">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="flex animate-pulse items-center gap-3 rounded-xl px-2.5 py-3">
                <span className="h-11 w-11 rounded-full bg-slate-100" />
                <span className="flex-1 space-y-2">
                  <span className="block h-3 w-1/2 rounded bg-slate-100" />
                  <span className="block h-3 w-4/5 rounded bg-slate-100" />
                </span>
              </li>
            ))}
          </ul>
        ) : list.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">{rows.length ? 'Nenhuma conversa nesse filtro.' : 'Nenhuma conversa ainda. Quando alguém chamar no WhatsApp, aparece aqui.'}</p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {list.map((c) => {
              const active = c.waId === selected
              const status = c.kind === 'cart' ? 'carrinho abandonado' : c.aiMode === 'off' ? 'com a equipe' : 'IA atendendo'
              const unread = c.unread > 0
              const lead = leadOf(c)
              const where = lead && !isQuestionnaireLead(lead) ? locateLead(pipelines, lead) : null
              const origin = originOf(c)
              const company = c.sdr?.profile?.empresa || lead?.companyName
              return (
                <li key={c.waId}>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false)
                      select(c.waId)
                    }}
                    aria-current={active ? 'true' : undefined}
                    aria-label={`${displayName(c)}${company ? `, ${company}` : ''}. ${c.sdr ? `${c.sdr.temperature}, ${c.sdr.stage}. ` : ''}${origin === 'crm' ? 'Já estava no CRM. ' : origin === 'new' ? 'Lead novo. ' : ''}${where ? `Etapa ${where.stage.label}. ` : ''}${unread ? `${c.unread} não lidas. ` : ''}${status}. Última mensagem ${c.lastDirection === 'in' ? 'do contato' : 'nossa'}: ${c.lastMessageText || 'sem mensagem'}. ${listTime(c.lastMessageAt)}`}
                    className={`relative flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${active ? 'bg-emerald-500/10' : 'hover:bg-slate-50'}`}
                  >
                    {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-emerald-500" aria-hidden="true" />}
                    <span className="relative mt-0.5 shrink-0">
                      <Avatar name={displayName(c)} size="lg" />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-[var(--dk-surface)] text-white ${c.kind === 'cart' ? 'bg-amber-500' : c.aiMode === 'off' ? 'bg-emerald-600' : 'bg-violet-500'}`}
                        aria-hidden="true"
                      >
                        {c.kind === 'cart' ? <ShoppingCart size={9} /> : c.aiMode === 'off' ? <UserRound size={9} /> : <Bot size={9} />}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`min-w-0 flex-1 truncate text-sm ${unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                          {displayName(c)}
                          {company && <span className="font-normal text-slate-400"> · {company}</span>}
                        </span>
                        <span className={`shrink-0 text-[11px] ${unread ? 'font-semibold text-emerald-400' : 'text-slate-400'}`}>{listTime(c.lastMessageAt)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span className={`min-w-0 flex-1 truncate text-[13px] ${unread ? 'text-slate-700' : 'text-slate-500'}`}>
                          {c.lastDirection === 'out' ? <span className="text-slate-400">Você: </span> : null}
                          {c.lastMessageText}
                        </span>
                        {unread && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}
                      </span>
                      {(c.sdr || origin || where) && (
                        <span className="mt-1.5 flex flex-wrap items-center gap-1">
                          {c.sdr && <SdrChip sdr={c.sdr} size="xs" />}
                          {hasMeeting(c) && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-400">
                              <CalendarCheck size={10} aria-hidden="true" /> Reunião
                            </span>
                          )}
                          {origin === 'new' && <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-400">Lead novo</span>}
                          {origin === 'crm' && <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-sky-400">Já no CRM</span>}
                          {where && (
                            <span className="max-w-[9rem] truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ backgroundColor: `${where.stage.color}26`, color: where.stage.color }}>
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
          <WaThread key={current.waId} conv={current} templates={templates} onBack={() => select(null)} lead={leadOf(current)} onOpenLead={openLead} />
        ) : (
          <div className="wa-wall flex flex-1">
            <EmptyPane title="Nenhuma conversa aberta" text="Escolha uma conversa na lista ou comece uma nova. A IA continua atendendo como SDR enquanto isso." />
          </div>
        )}
      </div>
    </div>
  )
}

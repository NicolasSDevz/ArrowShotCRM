import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, MessageCircle, UserRound } from 'lucide-react'
import { Drawer } from '../ui/Drawer'
import { TemplateComposer } from './WaParts'
import { WaThread } from './WaThread'
import { useLeads } from '../../hooks/useLeads'
import { findConversationLead, useWaConversations, useWaTemplates, waPhoneKey } from '../../hooks/useWaConversations'
import type { WaConversation } from '../../types/whatsapp'

/** Conversa do WhatsApp de um número (pelo DDD + 8 últimos dígitos). */
export function useConversationByPhone(phone?: string | null): WaConversation | null {
  const { data: convs } = useWaConversations()
  return useMemo(() => {
    const k = waPhoneKey(phone || '')
    if (!k) return null
    return convs.find((c) => waPhoneKey(c.waId) === k) ?? null
  }, [convs, phone])
}

export interface WaChatTarget {
  phone: string
  name: string
  /** Linha embaixo do nome (ex.: "Comprou Curso X por R$ 97"). */
  context?: string
}

/** WhatsApp do CRM em painel lateral: abre de qualquer tela (Vendas, Abandonados...). */
export function WaChatDrawer({ target, onClose }: { target: WaChatTarget | null; onClose: () => void }) {
  const navigate = useNavigate()
  const templates = useWaTemplates()
  const { data: leads } = useLeads()
  const conv = useConversationByPhone(target?.phone)
  const lead = conv ? findConversationLead(conv, leads) : null

  return (
    <Drawer open={Boolean(target)} onClose={onClose} title={target ? `WhatsApp de ${target.name || target.phone}` : 'WhatsApp'} width="w-full max-w-2xl" bodyClassName="flex min-h-0 flex-1 flex-col">
      {target &&
        (conv ? (
          <WaThread conv={conv} templates={templates} lead={lead} context={target.context} dockedPanel={false} onOpenLead={(id) => navigate(`/leads?lead=${id}`)} />
        ) : (
          <div className="wa-wall flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <div className="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400" aria-hidden="true">
                  <MessageCircle size={20} />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{target.name || target.phone}</p>
                  <p className="truncate text-xs text-slate-500">{[target.phone, target.context].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
              <p className="text-sm text-slate-500">Ainda não tem conversa com esse número. A primeira mensagem precisa ser um modelo aprovado no Meta; quando a pessoa responder, a conversa continua aqui e na aba Conversas de Leads.</p>
              <TemplateComposer to={target.phone} name={target.name} templates={templates} onSent={() => {}} />
            </div>
          </div>
        ))}
    </Drawer>
  )
}

/** Botão "WhatsApp" das listas: mostra se já tem conversa, quem atende e as não lidas. */
export function WaChatButton({ phone, name, onOpen, size = 'sm' }: { phone?: string | null; name: string; onOpen: () => void; size?: 'sm' | 'xs' }) {
  const conv = useConversationByPhone(phone)
  if (!waPhoneKey(phone || '')) return null
  const unread = conv?.unread ?? 0
  const who = conv ? (conv.aiMode === 'off' ? 'com a equipe' : 'IA atendendo') : 'sem conversa ainda'
  const h = size === 'xs' ? 'h-7 px-2.5' : 'h-8 px-3'
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`WhatsApp de ${name}: ${who}${unread ? `, ${unread} não lida${unread === 1 ? '' : 's'}` : ''}`}
      className={`relative inline-flex ${h} shrink-0 items-center gap-1.5 rounded-lg text-xs font-semibold transition ${
        conv ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-600 text-white hover:bg-emerald-700'
      }`}
    >
      <MessageCircle size={14} aria-hidden="true" />
      WhatsApp
      {conv && (conv.aiMode === 'off' ? <UserRound size={12} className="opacity-70" aria-hidden="true" /> : <Bot size={12} className="opacity-70" aria-hidden="true" />)}
      {unread > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white ring-2 ring-[var(--dk-surface)]" aria-hidden="true">
          {unread}
        </span>
      )}
    </button>
  )
}

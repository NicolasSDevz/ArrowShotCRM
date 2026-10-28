import { useEffect, useState } from 'react'
import { listWaTemplates, listenConversations } from '../services/whatsappService'
import type { Lead } from '../types'
import type { WaConversation, WaTemplate } from '../types/whatsapp'
import { useSharedSubscription } from './useCollectionSubscription'

/** Conversas do WhatsApp: um listener só pro app inteiro (Leads, ficha e caixa de entrada). */
export function useWaConversations() {
  return useSharedSubscription<WaConversation>('wa:conversations', (onData, onError) => listenConversations(onData, onError as ((e: Error) => void) | undefined))
}

/** Chave do telefone pra casar lead com conversa: DDD + últimos 8 dígitos.
 *  Assim "(11) 98765-4321", "5511987654321" e "551187654321" (sem o 9, como o
 *  WhatsApp às vezes manda) dão a mesma chave. */
export function waPhoneKey(phone: string | null | undefined): string | null {
  let d = (phone || '').replace(/\D/g, '')
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  d = d.replace(/^0+/, '')
  if (d.length < 10) return null
  return d.slice(0, 2) + d.slice(-8)
}

/** Conversa de cada lead: primeiro pelo vínculo salvo (leadId), depois pelo telefone. */
export function buildLeadConversationMap(leads: Lead[], convs: WaConversation[]) {
  const byLead = new Map<string, WaConversation>()
  const byPhone = new Map<string, WaConversation>()
  for (const c of convs) {
    if (c.leadId && !byLead.has(c.leadId)) byLead.set(c.leadId, c)
    const k = waPhoneKey(c.waId)
    if (k && !byPhone.has(k)) byPhone.set(k, c)
  }
  const out = new Map<string, WaConversation>()
  for (const l of leads) {
    const k = waPhoneKey(l.whatsapp)
    const c = byLead.get(l.id) ?? (k ? byPhone.get(k) : undefined)
    if (c) out.set(l.id, c)
  }
  return out
}

/** Lead de uma conversa (o inverso): vínculo salvo ou telefone. */
export function findConversationLead(conv: WaConversation, leads: Lead[]): Lead | null {
  if (conv.leadId) {
    const l = leads.find((x) => x.id === conv.leadId)
    if (l) return l
  }
  const k = waPhoneKey(conv.waId)
  if (!k) return null
  return leads.find((l) => waPhoneKey(l.whatsapp) === k) ?? null
}

/* Modelos aprovados: busca uma vez por visita (a ficha do lead abre e fecha muito). */
let templatesCache: Promise<WaTemplate[]> | null = null
export function useWaTemplates() {
  const [templates, setTemplates] = useState<WaTemplate[]>([])
  useEffect(() => {
    let alive = true
    if (!templatesCache) {
      templatesCache = listWaTemplates().catch(() => {
        templatesCache = null
        return []
      })
    }
    templatesCache.then((t) => alive && setTemplates(t))
    return () => {
      alive = false
    }
  }, [])
  return templates
}

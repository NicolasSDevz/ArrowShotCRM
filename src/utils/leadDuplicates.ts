import type { Client, Lead } from '../types'

/** Reconhece o mesmo contato em cadastros diferentes (lead × lead, lead ×
 *  cliente) — base da trava contra duplicar na importação e na conversão. */

/** Telefone comparável: DDD + últimos 8 dígitos. Ignora +55, máscara e o 9
 *  extra do celular (um cadastro com e outro sem continuam batendo). */
export function phoneKey(raw?: string | null): string {
  let d = (raw ?? '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  if (d.startsWith('0')) d = d.replace(/^0+/, '')
  if (d.length < 10) return ''
  return d.slice(0, 2) + d.slice(-8)
}

export function emailKey(raw?: string | null): string {
  const e = (raw ?? '').trim().toLowerCase()
  return e.includes('@') ? e : ''
}

/** Nome sem acento, caixa, espaço e pontuação ("Help Gestão" = "help gestao"). */
export function nameKey(raw?: string | null): string {
  const n = (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  return n.length >= 3 ? n : ''
}

export type MatchReason = 'whatsapp' | 'email' | 'empresa' | 'pessoa'

export const MATCH_REASON_LABEL: Record<MatchReason, string> = {
  whatsapp: 'mesmo WhatsApp',
  email: 'mesmo e-mail',
  empresa: 'mesmo nome de empresa',
  pessoa: 'mesmo nome de pessoa',
}

/** Todos os telefones do cliente (o principal + o de cada pessoa), já como phoneKey. */
export function clientPhoneKeys(client: Pick<Client, 'whatsapp' | 'contacts'>): string[] {
  const keys = [client.whatsapp, ...(client.contacts ?? []).map((c) => c.whatsapp)].map((w) => phoneKey(w)).filter(Boolean)
  return [...new Set(keys)]
}

function clientMatchReason(lead: Lead, client: Client): MatchReason | null {
  const p = phoneKey(lead.whatsapp)
  if (p && clientPhoneKeys(client).includes(p)) return 'whatsapp'
  const e = emailKey(lead.email)
  if (e && [client.email, ...(client.contacts ?? []).map((c) => c.email)].some((x) => emailKey(x) === e)) return 'email'
  const n = nameKey(lead.companyName)
  if (n && n === nameKey(client.companyName)) return 'empresa'
  // Nome completo da pessoa (com sobrenome) igual ao de alguém do cliente.
  const full = (lead.contactName ?? '').trim()
  const pn = full.includes(' ') ? nameKey(full) : ''
  if (pn && [client.contactName, ...(client.contacts ?? []).map((c) => c.name)].some((x) => nameKey(x) === pn)) return 'pessoa'
  return null
}

/** Cliente já cadastrado que é o mesmo contato do lead (WhatsApp e e-mail
 *  pesam mais que o nome da empresa, que pesa mais que o nome da pessoa).
 *  Confere também as pessoas cadastradas no cliente (client.contacts). */
export function findClientMatch(lead: Lead, clients: Client[]): { client: Client; reason: MatchReason } | null {
  let best: { client: Client; reason: MatchReason } | null = null
  const rank: Record<MatchReason, number> = { whatsapp: 0, email: 1, empresa: 2, pessoa: 3 }
  for (const client of clients) {
    const reason = clientMatchReason(lead, client)
    if (reason && (!best || rank[reason] < rank[best.reason])) best = { client, reason }
  }
  return best
}

/** Outros leads com o mesmo WhatsApp ou e-mail (nome de empresa não conta:
 *  duas pessoas da mesma empresa podem ser leads diferentes). */
export function findDuplicateLeads(lead: Lead, leads: Lead[]): Lead[] {
  const p = phoneKey(lead.whatsapp)
  const e = emailKey(lead.email)
  if (!p && !e) return []
  return leads.filter((l) => l.id !== lead.id && ((p && phoneKey(l.whatsapp) === p) || (e && emailKey(l.email) === e)))
}

/** Chaves de contato de um lead (ou linha de importação) — pra checar
 *  duplicado em lote. */
export function contactKeys(c: { whatsapp?: string | null; email?: string | null }): string[] {
  const keys: string[] = []
  const p = phoneKey(c.whatsapp)
  if (p) keys.push(`tel:${p}`)
  const e = emailKey(c.email)
  if (e) keys.push(`mail:${e}`)
  return keys
}

import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore'
import { db } from '../../../src/firebase/config'
import type { Lead } from '../../../src/types/lead'

const MEET_CODE_RE = /meet\.google\.com\/([a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4})/i

export function extrairCodigoMeet(url: string): string | null {
  return url.match(MEET_CODE_RE)?.[1]?.toLowerCase() ?? null
}

/** Procura, entre as reuniões de venda mais recentes, uma cujo link do Meet
 *  tenha o mesmo código da aba aberta — essa é a ligação automática com o
 *  lead (sem precisar o Bruno escolher na mão). Sem índice especial: lê as
 *  últimas N reuniões de venda com link e filtra em memória, dataset pequeno
 *  o bastante pra uma agência (ver LeadMeetingTab.tsx no CRM pro mesmo padrão). */
export async function buscarLeadPorCodigoMeet(codigoMeet: string): Promise<string | null> {
  const q = query(collection(db, 'meetings'), where('type', '==', 'sales'), orderBy('date', 'desc'), limit(200))
  const snap = await getDocs(q)
  for (const d of snap.docs) {
    const data = d.data() as { meetLink?: string; leadId?: string }
    if (data.meetLink && data.leadId && extrairCodigoMeet(data.meetLink) === codigoMeet) {
      return data.leadId
    }
  }
  return null
}

/** Busca rápida por nome/empresa — usada quando a reunião não foi achada
 *  automaticamente (link não bate ou reunião não veio do CRM). */
export async function buscarLeadsPorNome(termo: string): Promise<Lead[]> {
  const t = termo.trim().toLowerCase()
  if (t.length < 2) return []
  const snap = await getDocs(collection(db, 'leads'))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Lead)
    .filter((l) => l.contactName?.toLowerCase().includes(t) || l.companyName?.toLowerCase().includes(t))
    .slice(0, 8)
}

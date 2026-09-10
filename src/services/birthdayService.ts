import { collection, doc, setDoc, deleteDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { toWhatsappDigits } from '../utils/masks'
import type { BriefingContact, Client, PaidTrafficBriefing } from '../types'

const COLLECTION = 'calendarEvents'

/** Id determinístico do evento de aniversário de um contato — permite
 *  upsert e remoção sem precisar de índice composto. */
function birthdayEventId(clientId: string, contactId: string) {
  return `bday_${clientId}_${contactId}`
}

/** Chave de dedupe: mesma pessoa cadastrada em vários papéis conta uma vez. */
function dedupeKey(c: BriefingContact) {
  return toWhatsappDigits(c.whatsapp) || c.name.trim().toLowerCase()
}

function allBriefingContacts(b: PaidTrafficBriefing): BriefingContact[] {
  return [
    ...(b.socios ?? []),
    ...(b.decisores ?? []),
    ...(b.aprovadoresCampanhas ?? []),
    ...(b.financeiro ?? []),
    ...(b.marketing ?? []),
    ...(b.comercial ?? []),
  ]
}

/** Ocorrência do aniversário no ano informado (dia/mês fixos). */
function occurrence(month: number, day: number, year: number): Date {
  return new Date(year, month - 1, day)
}

/** Sincroniza os eventos de aniversário do calendário com as datas atuais dos
 *  responsáveis do Briefing de Tráfego Pago. Chamado a cada save do briefing:
 *  - cria/atualiza um evento por pessoa com aniversário preenchido (dedupe)
 *  - remove os eventos de quem perdeu a data ou saiu do briefing
 *  Falhas não derrubam o save do briefing (o chamador só loga). */
export async function syncClientBirthdays(client: Client, briefing: PaidTrafficBriefing, userId: string) {
  const year = new Date().getFullYear()

  // pessoas com aniversário, deduplicadas
  const seen = new Set<string>()
  const targets = allBriefingContacts(briefing).filter((c) => {
    if (!c.birthday || !c.name.trim()) return false
    const key = dedupeKey(c)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const keepIds = new Set(targets.map((c) => c.id))

  // eventos de aniversário já existentes deste cliente (filtro de campo único)
  const existing = await getDocs(query(collection(db, COLLECTION), where('clientId', '==', client.id)))
  const staleDeletes = existing.docs
    .filter((d) => d.data().type === 'birthday' && !keepIds.has(d.data().contactId))
    .map((d) => deleteDoc(doc(db, COLLECTION, d.id)).catch(() => {}))

  const upserts = targets.map((c) => {
    const bd = c.birthday!.toDate()
    const month = bd.getMonth() + 1
    const day = bd.getDate()
    const whatsapp = toWhatsappDigits(c.whatsapp) ?? null
    const id = birthdayEventId(client.id, c.id)
    return setDoc(
      doc(db, COLLECTION, id),
      {
        title: `🎂 Aniversário — ${c.name.trim()} (${client.companyName})`,
        type: 'birthday',
        date: occurrence(month, day, year),
        clientId: client.id,
        contactId: c.id,
        contactName: c.name.trim(),
        contactWhatsapp: whatsapp,
        birthdayMonth: month,
        birthdayDay: day,
        updatedAt: serverTimestamp(),
        updatedBy: userId,
        createdAt: serverTimestamp(),
        createdBy: userId,
      },
      { merge: true }
    ).catch((err) => console.error('[birthdays] falha ao salvar evento', id, err))
  })

  await Promise.all([...staleDeletes, ...upserts])
}

/** Remove todos os eventos de aniversário de um cliente (encerramento /
 *  exclusão do cliente). */
export async function removeClientBirthdays(clientId: string) {
  const existing = await getDocs(query(collection(db, COLLECTION), where('clientId', '==', clientId)))
  await Promise.all(
    existing.docs
      .filter((d) => d.data().type === 'birthday')
      .map((d) => deleteDoc(doc(db, COLLECTION, d.id)).catch(() => {}))
  )
}

export interface UpcomingBirthday {
  eventId: string
  name: string
  clientId?: string
  whatsapp?: string
  /** Próxima ocorrência (data futura mais próxima). */
  next: Date
  daysUntil: number
}

/** Lista de aniversários nos próximos `withinDays` dias, a partir dos eventos
 *  `type: 'birthday'` do calendário. Ordenado do mais próximo ao mais longe. */
export function upcomingBirthdays(
  events: { id: string; type: string; contactName?: string; clientId?: string; contactWhatsapp?: string; birthdayMonth?: number; birthdayDay?: number }[],
  withinDays = 30,
  now = new Date()
): UpcomingBirthday[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const out: UpcomingBirthday[] = []
  for (const ev of events) {
    if (ev.type !== 'birthday' || !ev.birthdayMonth || !ev.birthdayDay) continue
    let next = occurrence(ev.birthdayMonth, ev.birthdayDay, today.getFullYear())
    if (next < today) next = occurrence(ev.birthdayMonth, ev.birthdayDay, today.getFullYear() + 1)
    const daysUntil = Math.round((next.getTime() - today.getTime()) / 86400000)
    if (daysUntil <= withinDays) {
      out.push({
        eventId: ev.id,
        name: ev.contactName ?? 'Aniversariante',
        clientId: ev.clientId,
        whatsapp: ev.contactWhatsapp || undefined,
        next,
        daysUntil,
      })
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil)
}

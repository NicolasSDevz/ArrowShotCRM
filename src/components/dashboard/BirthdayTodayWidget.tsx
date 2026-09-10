import { useMemo } from 'react'
import { Cake } from 'lucide-react'
import { useCalendarEvents } from '../../hooks/useCalendarEvents'
import { useClients } from '../../hooks/useClients'
import { birthdayWhatsappLink } from '../../utils/birthdayMessage'
import { toWhatsappDigits } from '../../utils/masks'

/** Só aparece quando há aniversário de responsável de cliente HOJE. Mostra
 *  cada aniversariante com um botão direto pro WhatsApp (mensagem pronta). */
export function BirthdayTodayWidget() {
  const { data: events } = useCalendarEvents()
  const { data: clients } = useClients()

  const today = useMemo(() => {
    const n = new Date()
    return { month: n.getMonth() + 1, day: n.getDate() }
  }, [])

  const clientName = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.companyName])), [clients])

  const list = useMemo(() => {
    const seen = new Set<string>()
    return events
      .filter((e) => e.type === 'birthday' && e.birthdayMonth === today.month && e.birthdayDay === today.day)
      .filter((e) => {
        const key = toWhatsappDigits(e.contactWhatsapp) || (e.contactName ?? '').trim().toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [events, today])

  if (list.length === 0) return null

  return (
    <div className="rounded-2xl border border-pink-200 bg-pink-50/70 p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <p className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-pink-700">
        <Cake size={16} /> Aniversário hoje{list.length > 1 ? ` (${list.length})` : ''}
      </p>
      <ul className="flex flex-col gap-2">
        {list.map((e) => {
          const link = birthdayWhatsappLink(e.contactName ?? '', e.contactWhatsapp)
          return (
            <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-semibold text-slate-800">{e.contactName ?? 'Aniversariante'}</span>
              {e.clientId && clientName[e.clientId] && (
                <span className="text-slate-500">— {clientName[e.clientId]}</span>
              )}
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Abrir WhatsApp
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

import type { ReactNode } from 'react'
import { format, isToday, isTomorrow, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Clock, Video } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { MEETING_TYPE_LABEL, MEETING_TYPE_BADGE, meetingStartEnd, meetingTimeLabel, type Meeting } from '../../types'

/** "Hoje", "Amanhã", "Ontem" ou "quinta, 02/10/2026". */
export function meetingDayLabel(meeting: Meeting): string {
  const date = meeting.date.toDate()
  if (isToday(date)) return 'Hoje'
  if (isTomorrow(date)) return 'Amanhã'
  if (isYesterday(date)) return 'Ontem'
  return format(date, "EEEE, dd/MM/yyyy", { locale: ptBR })
}

/** Divide em próximas (da mais perto para a mais longe) e anteriores (da mais
 *  recente para a mais antiga). Reunião sem horário conta o dia inteiro. */
export function splitMeetings(meetings: Meeting[], now = new Date()) {
  const endOf = (m: Meeting) => {
    const range = meetingStartEnd(m)
    if (range) return range.end
    const d = new Date(m.date.toDate())
    d.setHours(23, 59, 59, 999)
    return d
  }
  const startOf = (m: Meeting) => meetingStartEnd(m)?.start ?? m.date.toDate()
  const upcoming = meetings.filter((m) => endOf(m) >= now).sort((a, b) => startOf(a).getTime() - startOf(b).getTime())
  const past = meetings.filter((m) => endOf(m) < now).sort((a, b) => startOf(b).getTime() - startOf(a).getTime())
  return { upcoming, past }
}

/** Linha de reunião reusada tanto em /reunioes quanto na aba "Reuniões" da
 *  ficha do cliente. */
export function MeetingRow({
  meeting,
  clientName,
  participants,
  onClick,
}: {
  meeting: Meeting
  clientName?: string
  participants: { id: string; name: string; photoURL?: string }[]
  onClick: () => void
}) {
  const dayLabel = meetingDayLabel(meeting)
  const timeLabel = meetingTimeLabel(meeting)
  const decisionsSnippet = meeting.decisions?.trim()
  const range = meetingStartEnd(meeting)
  const now = new Date()
  const happeningNow = !!range && range.start <= now && now <= range.end

  // Frase lida pelo leitor de tela: cliente primeiro, depois tipo, dia e horário.
  const spoken = [
    clientName,
    MEETING_TYPE_LABEL[meeting.type],
    happeningNow ? 'acontecendo agora' : '',
    `${dayLabel}${timeLabel ? ` ${timeLabel}` : ', sem horário'}`,
    meeting.meetLink ? (meeting.autoRecording ? 'no Google Meet, com gravação automática' : 'no Google Meet') : '',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <button
      onClick={onClick}
      aria-label={spoken}
      className="flex w-full flex-col gap-2 rounded-xl border border-slate-100 bg-white p-4 text-left transition-colors duration-150 ease-in-out hover:bg-[#F8FAFC]"
    >
      <div className="flex flex-wrap items-center gap-2" aria-hidden="true">
        <span className="text-sm font-medium capitalize text-slate-700">{dayLabel}</span>
        <span className={`flex items-center gap-1 text-sm ${timeLabel ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>
          <Clock size={13} /> {timeLabel || 'sem horário'}
        </span>
        {happeningNow && <Badge className="bg-emerald-50 text-emerald-700">Agora</Badge>}
        <Badge className={MEETING_TYPE_BADGE[meeting.type]}>{MEETING_TYPE_LABEL[meeting.type]}</Badge>
        {clientName && <Badge className="bg-slate-100 text-slate-500">{clientName}</Badge>}
        {meeting.meetLink && (
          <Badge className="bg-blue-50 text-blue-700">
            <span className="flex items-center gap-1">
              <Video size={12} /> Meet{meeting.autoRecording ? ', gravação automática' : ''}
            </span>
          </Badge>
        )}
        {participants.length > 0 && (
          <div className="ml-auto flex items-center -space-x-1.5">
            {participants.slice(0, 5).map((p) => (
              <Avatar key={p.id} name={p.name} photoURL={p.photoURL} size="xs" />
            ))}
          </div>
        )}
      </div>
      {decisionsSnippet && (
        <p className="truncate text-sm text-slate-500" aria-hidden="true">
          📌 {decisionsSnippet}
        </p>
      )}
    </button>
  )
}

/** Lista com dois blocos: "Próximas reuniões" e "Reuniões anteriores". */
export function MeetingSections({
  meetings,
  renderRow,
}: {
  meetings: Meeting[]
  renderRow: (meeting: Meeting) => ReactNode
}) {
  const { upcoming, past } = splitMeetings(meetings)
  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="meetings-upcoming">
        <h3 id="meetings-upcoming" className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Próximas reuniões ({upcoming.length})
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma reunião marcada daqui pra frente.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((m) => (
              <li key={m.id}>{renderRow(m)}</li>
            ))}
          </ul>
        )}
      </section>
      {past.length > 0 && (
        <section aria-labelledby="meetings-past">
          <h3 id="meetings-past" className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Reuniões anteriores ({past.length})
          </h3>
          <ul className="flex flex-col gap-2">
            {past.map((m) => (
              <li key={m.id}>{renderRow(m)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

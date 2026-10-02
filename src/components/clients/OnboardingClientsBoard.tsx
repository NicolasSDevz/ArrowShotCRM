import { useMemo } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Check, CalendarClock, Circle } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { useAllMeetings } from '../../hooks/useMeetings'
import { usePrivacy } from '../../context/PrivacyContext'
import { meetingHasEnded, meetingStartEnd, type Meeting, type MeetingType } from '../../types'
import { ONBOARDING_MEETING_LABEL, type Client, type OnboardingMeetingKey } from '../../types/client'

const STEPS: { key: OnboardingMeetingKey; meetingType: MeetingType }[] = [
  { key: 'onboarding', meetingType: 'onboarding' },
  { key: 'briefing', meetingType: 'briefing' },
  { key: 'estrategia', meetingType: 'strategy_access' },
]

type StepState = { status: 'done' | 'scheduled' | 'pending'; date?: Date; time?: string }

/** Estado de cada uma das 3 reuniões do onboarding: conta tanto o registro do
 *  cliente (ClientOnboardingMeetingsSection) quanto as reuniões do módulo de
 *  Reuniões com o tipo correspondente. */
function stepState(client: Client, key: OnboardingMeetingKey, meetings: Meeting[]): StepState {
  const record = client.onboardingMeetings?.[key]
  const ended = meetings.filter((m) => meetingHasEnded(m))
  const upcoming = meetings.filter((m) => !meetingHasEnded(m))
  if (record?.done) return { status: 'done', date: record.date?.toDate(), time: record.time }
  if (ended.length > 0) {
    const last = ended[ended.length - 1]
    return { status: 'done', date: last.date.toDate(), time: last.time }
  }
  if (upcoming.length > 0) return { status: 'scheduled', date: upcoming[0].date.toDate(), time: upcoming[0].time }
  if (record?.date) return { status: 'scheduled', date: record.date.toDate(), time: record.time }
  return { status: 'pending' }
}

function stepText(label: string, s: StepState): string {
  const when = s.date ? `${format(s.date, 'dd/MM')}${s.time ? ` às ${s.time}` : ''}` : ''
  if (s.status === 'done') return `${label}: feita${when ? ` em ${when}` : ''}`
  if (s.status === 'scheduled') return `${label}: agendada para ${when}`
  return `${label}: não agendada`
}

/** Aba "Em onboarding" da página Clientes — clientes com status Onboarding
 *  e em qual das 3 reuniões iniciais cada um está. */
export function OnboardingClientsBoard({ clients, onOpen }: { clients: Client[]; onOpen: (client: Client) => void }) {
  const { data: meetings } = useAllMeetings()
  const { isPrivacyMode } = usePrivacy()

  const rows = useMemo(() => {
    const byClientType = new Map<string, Meeting[]>()
    for (const m of meetings) {
      if (!m.clientId) continue
      const k = `${m.clientId}:${m.type}`
      const list = byClientType.get(k) ?? []
      list.push(m)
      byClientType.set(k, list)
    }
    const startOf = (m: Meeting) => meetingStartEnd(m)?.start.getTime() ?? m.date.toMillis()
    return clients.map((client) => {
      const steps = STEPS.map(({ key, meetingType }) => {
        const list = [...(byClientType.get(`${client.id}:${meetingType}`) ?? [])].sort((a, b) => startOf(a) - startOf(b))
        return { key, label: ONBOARDING_MEETING_LABEL[key], state: stepState(client, key, list) }
      })
      const doneCount = steps.filter((s) => s.state.status === 'done').length
      return { client, steps, doneCount }
    })
  }, [clients, meetings])

  return (
    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {rows.map(({ client, steps, doneCount }, i) => {
        const name = isPrivacyMode ? `Cliente ${i + 1}` : client.companyName
        const next = steps.find((s) => s.state.status !== 'done')
        const spoken = `${name}, ${doneCount} de 3 reuniões de onboarding feitas. ${steps.map((s) => stepText(s.label, s.state)).join('. ')}.`
        return (
          <li key={client.id}>
            <button
              onClick={() => onOpen(client)}
              aria-label={spoken}
              className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition-colors duration-150 ease-in-out hover:border-brand-200 hover:bg-slate-50"
            >
              <div className="flex items-center gap-3" aria-hidden="true">
                <Avatar name={name} photoURL={isPrivacyMode ? null : client.logoUrl} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-800">{name}</p>
                  <p className="text-xs text-slate-500">
                    {next ? `Próximo passo: ${next.label}` : 'Todas as reuniões feitas, pode virar Ativo'}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  {doneCount} de 3
                </span>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(doneCount / 3) * 100}%` }} />
              </div>

              <ol className="grid grid-cols-3 gap-2" aria-hidden="true">
                {steps.map(({ key, label, state }) => (
                  <li
                    key={key}
                    className={`flex flex-col gap-1 rounded-lg border px-2.5 py-2 ${
                      state.status === 'done'
                        ? 'border-emerald-100 bg-emerald-50'
                        : state.status === 'scheduled'
                          ? 'border-blue-100 bg-blue-50'
                          : 'border-slate-100 bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {state.status === 'done' ? (
                        <Check size={12} className="text-emerald-600" />
                      ) : state.status === 'scheduled' ? (
                        <CalendarClock size={12} className="text-blue-600" />
                      ) : (
                        <Circle size={12} className="text-slate-300" />
                      )}
                      {label.replace('Reunião de ', '')}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        state.status === 'done' ? 'text-emerald-700' : state.status === 'scheduled' ? 'text-blue-700' : 'text-slate-400'
                      }`}
                    >
                      {state.status === 'done'
                        ? 'Feita'
                        : state.status === 'scheduled' && state.date
                          ? `${format(state.date, "EEE dd/MM", { locale: ptBR })}${state.time ? ` ${state.time}` : ''}`
                          : 'Não agendada'}
                    </span>
                  </li>
                ))}
              </ol>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

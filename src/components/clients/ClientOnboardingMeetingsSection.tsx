import { useState } from 'react'
import { CalendarClock, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { scheduleOnboardingMeeting, toggleOnboardingMeetingDone } from '../../services/clientWorkflowTemplates'
import { timestampToDateInput } from '../../utils/dateInput'
import { ONBOARDING_MEETING_LABEL, type Client, type OnboardingMeetingKey } from '../../types/client'

const MEETING_KEYS: OnboardingMeetingKey[] = ['onboarding', 'briefing', 'estrategia']

function MeetingRow({ client, meetingKey }: { client: Client; meetingKey: OnboardingMeetingKey }) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const record = client.onboardingMeetings?.[meetingKey]
  const [dateStr, setDateStr] = useState(timestampToDateInput(record?.date))
  const [timeStr, setTimeStr] = useState(record?.time ?? '')
  const [saving, setSaving] = useState(false)

  const handleSchedule = async () => {
    if (!dateStr || !profile) return
    setSaving(true)
    try {
      const [y, m, d] = dateStr.split('-').map(Number)
      await scheduleOnboardingMeeting(client, meetingKey, new Date(y, m - 1, d), timeStr, profile.id, profile.name, users)
      toast.success(`${ONBOARDING_MEETING_LABEL[meetingKey]} agendada — evento criado no Calendário`)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao agendar reunião')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleDone = async (done: boolean) => {
    if (!profile) return
    try {
      await toggleOnboardingMeetingDone(client, meetingKey, done, profile.id, profile.name)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao atualizar status da reunião')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <label className="flex min-w-[220px] flex-1 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!record?.done}
          onChange={(e) => handleToggleDone(e.target.checked)}
          disabled={!record?.date}
          className="h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
        />
        <span className={record?.done ? 'text-slate-400 line-through' : 'font-medium text-slate-700'}>
          {ONBOARDING_MEETING_LABEL[meetingKey]}
        </span>
      </label>
      <input
        type="date"
        value={dateStr}
        onChange={(e) => setDateStr(e.target.value)}
        className="h-8 rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
      />
      <input
        type="time"
        value={timeStr}
        onChange={(e) => setTimeStr(e.target.value)}
        className="h-8 w-24 rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
      />
      <button
        onClick={handleSchedule}
        disabled={!dateStr || saving}
        className="flex h-8 items-center gap-1 rounded-lg bg-brand-50 px-2.5 text-xs font-medium text-brand-600 hover:bg-brand-100 disabled:opacity-50"
      >
        {record?.date ? <Check size={12} /> : null}
        {record?.date ? 'Reagendar' : 'Agendar'}
      </button>
    </div>
  )
}

/** Seção fixa no topo da ficha do cliente (só clientes com Tráfego Pago) —
 *  as 3 reuniões do fluxo inicial (Onboarding, Briefing, Estratégia).
 *  Agendar cada uma cria o evento no Calendário e notifica a equipe (ver
 *  scheduleOnboardingMeeting); o checkbox só marca "realizada", sem mexer
 *  no agendamento. */
export function ClientOnboardingMeetingsSection({ client }: { client: Client }) {
  if (!client.modules?.paidTraffic) return null

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <CalendarClock size={13} /> Reuniões de Onboarding
      </p>
      <div className="flex flex-col divide-y divide-slate-200">
        {MEETING_KEYS.map((key) => (
          <MeetingRow key={key} client={client} meetingKey={key} />
        ))}
      </div>
    </div>
  )
}

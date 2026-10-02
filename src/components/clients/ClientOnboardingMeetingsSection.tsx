import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { useClientMeetings } from '../../hooks/useMeetings'
import { toggleOnboardingMeetingDone } from '../../services/clientWorkflowTemplates'
import { groupMeetingsByClientType, onboardingSteps, ONBOARDING_STEPS, type OnboardingStepState } from '../../utils/onboardingProgress'
import { MeetingFormModal } from '../meetings/MeetingFormModal'
import { MeetingDrawer } from '../meetings/MeetingDrawer'
import type { Client, OnboardingMeetingKey } from '../../types/client'
import type { MeetingType } from '../../types'

function stateText(s: OnboardingStepState): string {
  const when = s.date ? `${format(s.date, "dd/MM/yyyy", { locale: ptBR })}${s.time ? ` às ${s.time}` : ''}` : ''
  if (s.status === 'done') return when ? `Feita em ${when}` : 'Feita'
  if (s.status === 'scheduled') return `Agendada para ${when}`
  return 'Ainda não agendada'
}

const STATUS_BADGE: Record<OnboardingStepState['status'], string> = {
  done: 'bg-emerald-50 text-emerald-700',
  scheduled: 'bg-sky-50 text-sky-700',
  pending: 'bg-slate-100 text-slate-500',
}

/** Seção no topo da ficha do cliente (só clientes com Tráfego Pago) — as 3
 *  reuniões do fluxo inicial (Onboarding, Briefing, Estratégia). Não agenda
 *  mais por conta própria: "Agendar" abre o mesmo formulário do módulo
 *  Reuniões já com o tipo e o cliente preenchidos, então tudo fica num lugar
 *  só (Reuniões, Calendário, Meet e progresso do onboarding). O check "Feita"
 *  continua para reuniões que aconteceram fora do CRM. */
export function ClientOnboardingMeetingsSection({ client }: { client: Client }) {
  const { profile } = useAuth()
  const { data: meetings } = useClientMeetings(client.id)
  const [scheduling, setScheduling] = useState<MeetingType | null>(null)
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null)

  if (!client.modules?.paidTraffic) return null

  const byClientType = groupMeetingsByClientType(meetings)
  const steps = onboardingSteps(client, byClientType)
  const openMeeting = meetings.find((m) => m.id === openMeetingId) ?? null

  const handleToggleDone = async (key: OnboardingMeetingKey, done: boolean) => {
    if (!profile) return
    try {
      await toggleOnboardingMeetingDone(client, key, done, profile.id, profile.name)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao atualizar status da reunião')
    }
  }

  return (
    <section aria-labelledby="onboarding-meetings-title" className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <h2 id="onboarding-meetings-title" className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <CalendarClock size={13} aria-hidden="true" /> Reuniões de Onboarding
      </h2>
      <ul className="flex flex-col divide-y divide-slate-200">
        {steps.map((step) => {
          const meetingType = ONBOARDING_STEPS.find((s) => s.key === step.key)!.meetingType
          const list = byClientType.get(`${client.id}:${meetingType}`) ?? []
          const latest = list[list.length - 1]
          const manualDone = !!client.onboardingMeetings?.[step.key]?.done
          return (
            <li key={step.key} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-[160px] text-sm font-medium text-slate-700">{step.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[step.state.status]}`}>
                {stateText(step.state)}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={manualDone}
                    onChange={(e) => handleToggleDone(step.key, e.target.checked)}
                    aria-label={`${step.label} de ${client.companyName} feita fora do CRM`}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
                  />
                  Feita fora do CRM
                </label>
                {latest && (
                  <button
                    type="button"
                    onClick={() => setOpenMeetingId(latest.id)}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Abrir reunião<span className="sr-only"> {step.label}</span>
                  </button>
                )}
                {step.state.status !== 'done' && (
                  <button
                    type="button"
                    onClick={() => setScheduling(meetingType)}
                    className="h-8 rounded-lg bg-brand-50 px-2.5 text-xs font-medium text-brand-600 hover:bg-brand-100"
                  >
                    {latest ? 'Agendar outra' : 'Agendar'}
                    <span className="sr-only"> {step.label} de {client.companyName}</span>
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {scheduling && (
        <MeetingFormModal
          key={scheduling}
          open
          onClose={() => setScheduling(null)}
          defaultClientId={client.id}
          defaultType={scheduling}
          title={`Agendar reunião - ${client.companyName}`}
        />
      )}
      <MeetingDrawer key={`meeting-${openMeetingId ?? 'none'}`} meeting={openMeeting} onClose={() => setOpenMeetingId(null)} />
    </section>
  )
}

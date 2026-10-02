import { meetingHasEnded, meetingStartEnd, type Meeting, type MeetingType } from '../types'
import { ONBOARDING_MEETING_LABEL, type Client, type OnboardingMeetingKey } from '../types/client'

export const ONBOARDING_STEPS: { key: OnboardingMeetingKey; meetingType: MeetingType }[] = [
  { key: 'onboarding', meetingType: 'onboarding' },
  { key: 'briefing', meetingType: 'briefing' },
  { key: 'estrategia', meetingType: 'strategy_access' },
]

export type OnboardingStepState = { status: 'done' | 'scheduled' | 'pending'; date?: Date; time?: string }

export interface OnboardingStep {
  key: OnboardingMeetingKey
  label: string
  state: OnboardingStepState
}

/** Estado de uma das 3 reuniões do onboarding: conta tanto o check da ficha
 *  do cliente (ClientOnboardingMeetingsSection) quanto as reuniões do módulo
 *  de Reuniões com o tipo correspondente que já terminaram. */
function stepState(client: Client, key: OnboardingMeetingKey, meetings: Meeting[], now: Date): OnboardingStepState {
  const record = client.onboardingMeetings?.[key]
  const ended = meetings.filter((m) => meetingHasEnded(m, now))
  const upcoming = meetings.filter((m) => !meetingHasEnded(m, now))
  if (record?.done) return { status: 'done', date: record.date?.toDate(), time: record.time }
  if (ended.length > 0) {
    const last = ended[ended.length - 1]
    return { status: 'done', date: last.date.toDate(), time: last.time }
  }
  if (upcoming.length > 0) return { status: 'scheduled', date: upcoming[0].date.toDate(), time: upcoming[0].time }
  if (record?.date) return { status: 'scheduled', date: record.date.toDate(), time: record.time }
  return { status: 'pending' }
}

/** Reuniões agrupadas por "clientId:tipo", da mais antiga pra mais nova. */
export function groupMeetingsByClientType(meetings: Meeting[]): Map<string, Meeting[]> {
  const map = new Map<string, Meeting[]>()
  for (const m of meetings) {
    if (!m.clientId) continue
    const k = `${m.clientId}:${m.type}`
    map.set(k, [...(map.get(k) ?? []), m])
  }
  const startOf = (m: Meeting) => meetingStartEnd(m)?.start.getTime() ?? m.date.toMillis()
  for (const list of map.values()) list.sort((a, b) => startOf(a) - startOf(b))
  return map
}

export function onboardingSteps(client: Client, byClientType: Map<string, Meeting[]>, now = new Date()): OnboardingStep[] {
  return ONBOARDING_STEPS.map(({ key, meetingType }) => ({
    key,
    label: ONBOARDING_MEETING_LABEL[key],
    state: stepState(client, key, byClientType.get(`${client.id}:${meetingType}`) ?? [], now),
  }))
}

export function onboardingComplete(steps: OnboardingStep[]): boolean {
  return steps.every((s) => s.state.status === 'done')
}

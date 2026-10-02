import type { Timestamp } from 'firebase/firestore'
import type { BaseDoc } from './common'

export type MeetingType =
  | 'daily'
  | 'continuous_improvement'
  | 'partnership'
  | 'one_on_one'
  | 'monthly_team'
  | 'onboarding'
  | 'briefing'
  | 'strategy_access'
  | 'monthly_consulting'

export const MEETING_TYPE_LABEL: Record<MeetingType, string> = {
  daily: 'Daily',
  continuous_improvement: 'Melhoria Contínua',
  partnership: 'Reunião de Sociedade',
  one_on_one: 'One-a-One',
  monthly_team: 'Reunião Mensal da Equipe',
  onboarding: 'Onboarding',
  briefing: 'Reunião de Briefing',
  strategy_access: 'Reunião de Estratégia e Acessos',
  monthly_consulting: 'Consultoria Mensal',
}

/** Agrupamento exibido como dois <optgroup> no <select> de tipo (ver
 *  MeetingForm) — também decide quando mostrar o seletor de cliente:
 *  qualquer tipo do grupo "client" precisa de um cliente vinculado. */
export const MEETING_TYPE_GROUP_LABEL = {
  internal: 'Reuniões internas',
  client: 'Reuniões com clientes',
} as const

export type MeetingTypeGroup = keyof typeof MEETING_TYPE_GROUP_LABEL

export const MEETING_TYPE_GROUPS: Record<MeetingTypeGroup, MeetingType[]> = {
  internal: ['daily', 'continuous_improvement', 'partnership', 'one_on_one', 'monthly_team'],
  client: ['onboarding', 'briefing', 'strategy_access', 'monthly_consulting'],
}

export function isClientMeetingType(type: MeetingType): boolean {
  return MEETING_TYPE_GROUPS.client.includes(type)
}

/** Nota de recorrência mostrada como texto de apoio abaixo do <select>
 *  quando um desses tipos é escolhido — informativo, não persistido. */
export const MEETING_TYPE_SCHEDULE_HINT: Partial<Record<MeetingType, string>> = {
  daily: 'Toda segunda a sexta, às 9h.',
  continuous_improvement: 'Toda sexta, às 10h.',
}

/** Cor do badge por tipo — ver spec do módulo de Reuniões. */
export const MEETING_TYPE_BADGE: Record<MeetingType, string> = {
  daily: 'bg-blue-50 text-blue-600',
  continuous_improvement: 'bg-cyan-50 text-cyan-600',
  partnership: 'bg-violet-50 text-violet-600',
  one_on_one: 'bg-emerald-50 text-emerald-600',
  monthly_team: 'bg-slate-100 text-slate-600',
  onboarding: 'bg-amber-50 text-amber-600',
  briefing: 'bg-orange-50 text-orange-600',
  strategy_access: 'bg-fuchsia-50 text-fuchsia-600',
  monthly_consulting: 'bg-rose-50 text-rose-600',
}

/** Participantes marcados por padrão ao escolher cada tipo — nomes
 *  resolvidos contra a equipe real via utils/userLookup.findUserIdByName
 *  (mesma convenção usada em clientWorkflowTemplates/notificações). Tipos
 *  fora deste mapa começam sem ninguém pré-marcado. */
export const MEETING_DEFAULT_PARTICIPANT_NAMES: Partial<Record<MeetingType, string[]>> = {
  daily: ['Bruno', 'Jamilson', 'Ciane', 'Nicolas'],
  continuous_improvement: ['Bruno', 'Jamilson', 'Ciane', 'Nicolas'],
  monthly_team: ['Bruno', 'Jamilson', 'Ciane', 'Nicolas'],
  partnership: ['Bruno', 'Ciane'],
}

export interface MeetingActionItem {
  id: string
  description: string
  assignedTo?: string
  dueDate?: Timestamp | null
  /** Preenchido automaticamente ao salvar a reunião (ver meetingService) —
   *  liga esta ação à tarefa real criada a partir dela. Nunca setado pelo
   *  formulário diretamente. */
  taskId?: string
}

export interface Meeting extends BaseDoc {
  type: MeetingType
  date: Timestamp
  /** "HH:mm", opcional. */
  time?: string
  /** Duração em minutos (para mostrar o horário de término). */
  durationMin?: number
  /** uids da equipe interna presentes. */
  participantIds: string[]
  /** Só relevante para tipos do grupo "Reuniões com clientes" — ver
   *  isClientMeetingType. */
  clientId?: string
  /** Pauta — o que foi discutido. */
  agenda?: string
  /** Decisões e encaminhamentos definidos. */
  decisions?: string
  actionItems: MeetingActionItem[]
  /** Link do Google Drive com a gravação. */
  recordingLink?: string
  /** Sala do Google Meet criada pelo CRM (evento no Google Agenda de quem criou). */
  meetLink?: string
  googleEventId?: string
  /** true = a gravação automática do Meet foi ligada na criação da sala. */
  autoRecording?: boolean
  notes?: string
}

/** Payload editável (form) — tudo que create/updateMeeting recebem. */
export type MeetingInput = Omit<Meeting, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>

/** Opções de duração do formulário de reunião. */
export const MEETING_DURATIONS = [
  { label: '30 minutos', minutes: 30 },
  { label: '45 minutos', minutes: 45 },
  { label: '1 hora', minutes: 60 },
  { label: '1 hora e meia', minutes: 90 },
  { label: '2 horas', minutes: 120 },
]

/** Início e fim da reunião como Date (null se não tiver horário). */
export function meetingStartEnd(meeting: Pick<Meeting, 'date' | 'time' | 'durationMin'>): { start: Date; end: Date } | null {
  if (!meeting.time) return null
  const [h, m] = meeting.time.split(':').map(Number)
  const start = new Date(meeting.date.toDate())
  start.setHours(h, m, 0, 0)
  return { start, end: new Date(start.getTime() + (meeting.durationMin ?? 60) * 60_000) }
}

/** "das 14:00 às 15:00" (ou "às 14:00" sem duração; "" sem horário). */
export function meetingTimeLabel(meeting: Pick<Meeting, 'date' | 'time' | 'durationMin'>): string {
  const range = meetingStartEnd(meeting)
  if (!range) return ''
  if (!meeting.durationMin) return `às ${meeting.time}`
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `das ${hhmm(range.start)} às ${hhmm(range.end)}`
}

/** Cor sólida por tipo (barrinha lateral e bolinha no calendário). */
export const MEETING_TYPE_DOT: Record<MeetingType, string> = {
  daily: 'bg-blue-500',
  continuous_improvement: 'bg-cyan-500',
  partnership: 'bg-violet-500',
  one_on_one: 'bg-emerald-500',
  monthly_team: 'bg-slate-400',
  onboarding: 'bg-amber-500',
  briefing: 'bg-orange-500',
  strategy_access: 'bg-fuchsia-500',
  monthly_consulting: 'bg-rose-500',
}

/** Fim da reunião: horário + duração, ou o fim do dia quando não tem horário. */
export function meetingEnd(meeting: Pick<Meeting, 'date' | 'time' | 'durationMin'>): Date {
  const range = meetingStartEnd(meeting)
  if (range) return range.end
  const d = new Date(meeting.date.toDate())
  d.setHours(23, 59, 59, 999)
  return d
}

/** A reunião já terminou? Antes disso, decisões, próximos passos e gravação
 *  ainda não fazem sentido — a tela trata como "agendada". */
export function meetingHasEnded(meeting: Pick<Meeting, 'date' | 'time' | 'durationMin'>, now = new Date()): boolean {
  return meetingEnd(meeting) < now
}

/** Já terminou, mas ninguém registrou decisões, próximos passos nem gravação. */
export function meetingMissingRecord(meeting: Meeting, now = new Date()): boolean {
  return (
    meetingHasEnded(meeting, now) &&
    !meeting.decisions?.trim() &&
    (meeting.actionItems?.length ?? 0) === 0 &&
    !meeting.recordingLink
  )
}

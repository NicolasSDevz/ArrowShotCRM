import { Timestamp } from 'firebase/firestore'
import { isClientMeetingType, type Meeting, type MeetingInput, type MeetingType } from '../../types'

export interface ActionItemFormState {
  id: string
  description: string
  assignedTo: string
  dueDateStr: string
  /** Carried through once the action item has been turned into a real task
   *  (see meetingService) — the form never sets or clears this itself. */
  taskId?: string
}

export interface MeetingFormState {
  type: MeetingType
  dateStr: string
  time: string
  durationMin: number
  participantIds: string[]
  clientId: string
  agenda: string
  decisions: string
  actionItems: ActionItemFormState[]
  recordingLink: string
  notes: string
  /** Só na criação: abre a sala no Google Meet (evento no Google Agenda). */
  createMeet: boolean
  /** Liga a gravação automática da sala do Meet. */
  autoRecording: boolean
  /** Manda o convite do Google Agenda também para o e-mail do cliente. */
  inviteClient: boolean
  /** Já vindos do Meet (edição): preservados ao salvar. */
  meetLink?: string
  googleEventId?: string
  meetAutoRecording?: boolean
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** Próximo horário cheio ou meia hora (ex.: 14:10 vira 14:30). */
function nextHalfHour(): string {
  const d = new Date()
  const add = d.getMinutes() < 30 ? 30 - d.getMinutes() : 60 - d.getMinutes()
  d.setMinutes(d.getMinutes() + add, 0, 0)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function buildDefaultMeetingForm(overrides?: Partial<MeetingFormState>): MeetingFormState {
  return {
    type: 'daily',
    dateStr: toDateStr(new Date()),
    time: nextHalfHour(),
    durationMin: 60,
    participantIds: [],
    clientId: '',
    agenda: '',
    decisions: '',
    actionItems: [],
    recordingLink: '',
    notes: '',
    createMeet: false,
    autoRecording: true,
    inviteClient: false,
    ...overrides,
  }
}

export function meetingToFormState(meeting: Meeting): MeetingFormState {
  return {
    type: meeting.type,
    dateStr: toDateStr(meeting.date.toDate()),
    time: meeting.time ?? '',
    durationMin: meeting.durationMin ?? 60,
    participantIds: meeting.participantIds ?? [],
    clientId: meeting.clientId ?? '',
    agenda: meeting.agenda ?? '',
    decisions: meeting.decisions ?? '',
    actionItems: (meeting.actionItems ?? []).map((a) => ({
      id: a.id,
      description: a.description,
      assignedTo: a.assignedTo ?? '',
      dueDateStr: a.dueDate ? toDateStr(a.dueDate.toDate()) : '',
      taskId: a.taskId,
    })),
    recordingLink: meeting.recordingLink ?? '',
    notes: meeting.notes ?? '',
    createMeet: false,
    autoRecording: false,
    inviteClient: false,
    meetLink: meeting.meetLink,
    googleEventId: meeting.googleEventId,
    meetAutoRecording: meeting.autoRecording,
  }
}

export function formStateToMeetingInput(state: MeetingFormState): MeetingInput {
  const [y, m, d] = state.dateStr.split('-').map(Number)
  return {
    type: state.type,
    date: Timestamp.fromDate(new Date(y, m - 1, d)),
    time: state.time || undefined,
    durationMin: state.time ? state.durationMin : undefined,
    participantIds: state.participantIds,
    clientId: isClientMeetingType(state.type) ? state.clientId || undefined : undefined,
    agenda: state.agenda.trim() || undefined,
    decisions: state.decisions.trim() || undefined,
    actionItems: state.actionItems
      .filter((a) => a.description.trim())
      .map((a) => ({
        id: a.id,
        description: a.description.trim(),
        assignedTo: a.assignedTo || undefined,
        dueDate: a.dueDateStr ? Timestamp.fromDate(new Date(`${a.dueDateStr}T00:00:00`)) : null,
        taskId: a.taskId,
      })),
    recordingLink: state.recordingLink.trim() || undefined,
    notes: state.notes.trim() || undefined,
    meetLink: state.meetLink,
    googleEventId: state.googleEventId,
    autoRecording: state.meetAutoRecording,
  }
}

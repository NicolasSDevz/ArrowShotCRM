import { createMeetingEvent, enableMeetAutoRecording, MEET_SETTINGS_SCOPE, requestAccessToken, updateMeetingEvent } from '../../services/googleCalendarService'
import { MEETING_TYPE_LABEL, type AppUser, type Client, type MeetingInput } from '../../types'

/** Cria (ou atualiza, se já tem googleEventId) o evento da reunião no Google
 *  Agenda de quem está logado, com sala do Meet e convite pros participantes
 *  (e o cliente, se pedido). Tenta ligar a gravação automática quando pedida;
 *  se a gravação falhar, o evento sai mesmo assim e volta um aviso. */
export async function syncMeetingToGoogle(
  input: Pick<MeetingInput, 'type' | 'date' | 'time' | 'durationMin' | 'participantIds' | 'clientId' | 'agenda' | 'googleEventId'>,
  opts: { users: AppUser[]; clients: Client[]; myEmail?: string; inviteClient?: boolean; wantsRecording?: boolean }
): Promise<{ meetLink?: string; eventId: string; autoRecording: boolean; warning: string }> {
  const wantsRecording = Boolean(opts.wantsRecording) && !input.googleEventId
  const token = await requestAccessToken(false, wantsRecording ? [MEET_SETTINGS_SCOPE] : [])
  const client = input.clientId ? opts.clients.find((c) => c.id === input.clientId) : undefined
  const [h, m] = (input.time || '09:00').split(':').map(Number)
  const start = new Date(input.date.toDate())
  start.setHours(h, m, 0, 0)
  const end = new Date(start.getTime() + (input.durationMin ?? 60) * 60_000)
  const attendeeEmails = opts.users.filter((u) => input.participantIds.includes(u.id) && u.email && u.email !== opts.myEmail).map((u) => u.email)
  if (opts.inviteClient && client?.email) attendeeEmails.push(client.email)
  const params = {
    summary: client ? `${MEETING_TYPE_LABEL[input.type]} - ${client.companyName}` : MEETING_TYPE_LABEL[input.type],
    description: input.agenda,
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    attendeeEmails: [...new Set(attendeeEmails)],
  }
  const event = input.googleEventId ? await updateMeetingEvent(token, input.googleEventId, params) : await createMeetingEvent(token, params)

  let warning = ''
  let autoRecording = false
  if (!event.hangoutLink) {
    warning = 'Reunião colocada no Google Agenda, mas o link do Meet ainda não apareceu. Abra o evento no Google Agenda para pegar o link.'
  } else if (wantsRecording) {
    try {
      await enableMeetAutoRecording(token, event.hangoutLink)
      autoRecording = true
    } catch (err) {
      console.error(err)
      warning =
        'Sala do Meet criada, mas a gravação automática não foi ligada. Quando a reunião começar, clique em Atividades e depois em Gravação. ' +
        'Para ligar sozinho, a conta precisa ser Google Workspace com gravação e a Meet API ativada no Google Cloud.'
    }
  }
  return { meetLink: event.hangoutLink, eventId: event.id, autoRecording, warning }
}

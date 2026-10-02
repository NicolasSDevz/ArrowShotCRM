import { useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { useClients } from '../../hooks/useClients'
import { createMeeting } from '../../services/meetingService'
import { requestAccessToken, createMeetingEvent, enableMeetAutoRecording, MEET_SETTINGS_SCOPE } from '../../services/googleCalendarService'
import { showError } from '../../utils/notifyError'
import { MeetingForm } from './MeetingForm'
import { buildDefaultMeetingForm, formMeetingHasEnded, formStateToMeetingInput, type MeetingFormState } from './meetingFormState'
import { isClientMeetingType, MEETING_TYPE_LABEL, type MeetingInput, type MeetingType } from '../../types'

export function MeetingFormModal({
  open,
  onClose,
  defaultClientId,
  defaultType: defaultTypeProp,
  title = 'Nova reunião',
}: {
  open: boolean
  onClose: () => void
  /** Pre-fills type "Onboarding" (primeiro tipo do grupo "Reuniões com
   *  clientes") + this client — used by the ficha do cliente's "Registrar
   *  reunião" button. */
  defaultClientId?: string
  /** Força o tipo inicial — ex. "Consultoria Mensal" ao agendar pelo widget
   *  Consultorias do mês (um clique a menos pro Jamilson, que usa leitor de tela). */
  defaultType?: MeetingType
  title?: string
}) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const { data: clients } = useClients()

  const defaultType: MeetingType = defaultTypeProp ?? (defaultClientId ? 'onboarding' : 'daily')
  const [form, setForm] = useState<MeetingFormState>(() => buildDefaultMeetingForm({ type: defaultType, clientId: defaultClientId ?? '' }))
  const [saving, setSaving] = useState(false)

  const reset = () => setForm(buildDefaultMeetingForm({ type: defaultType, clientId: defaultClientId ?? '' }))

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSave = async () => {
    if (!profile) return
    if (isClientMeetingType(form.type) && !form.clientId) {
      toast.error('Selecione o cliente vinculado a esta reunião.')
      return
    }
    if (form.createMeet && !form.time) {
      toast.error('Preencha o horário de início para criar a sala do Meet.')
      return
    }
    setSaving(true)
    try {
      const input = formStateToMeetingInput(form)
      let recordingWarning = ''
      if (form.createMeet) {
        const meet = await createGoogleMeet(input)
        input.meetLink = meet.meetLink
        input.googleEventId = meet.eventId
        input.autoRecording = meet.autoRecording
        recordingWarning = meet.warning
      }
      await createMeeting(input, profile.id, profile.name)
      if (!form.createMeet) toast.success(formMeetingHasEnded(form) ? 'Reunião registrada' : 'Reunião agendada')
      else if (recordingWarning) toast(recordingWarning, { duration: 12000, icon: '⚠️' })
      else toast.success(form.autoRecording ? 'Reunião criada no Google Meet com gravação automática' : 'Reunião criada no Google Meet')
      handleClose()
    } catch (err) {
      console.error(err)
      showError(err, form.createMeet ? 'Erro ao criar a reunião no Google Meet' : 'Erro ao registrar reunião')
    } finally {
      setSaving(false)
    }
  }

  /** Cria o evento no Google Agenda de quem está logado, com sala do Meet e
   *  convite para os participantes (e o cliente, se marcado), e tenta ligar a
   *  gravação automática. Se a gravação falhar, a reunião sai mesmo assim. */
  const createGoogleMeet = async (input: MeetingInput) => {
    const wantsRecording = form.autoRecording
    const token = await requestAccessToken(false, wantsRecording ? [MEET_SETTINGS_SCOPE] : [])
    const client = input.clientId ? clients.find((c) => c.id === input.clientId) : undefined
    const [h, m] = (input.time ?? '09:00').split(':').map(Number)
    const start = new Date(input.date.toDate())
    start.setHours(h, m, 0, 0)
    const end = new Date(start.getTime() + (input.durationMin ?? 60) * 60_000)
    const attendeeEmails = users
      .filter((u) => input.participantIds.includes(u.id) && u.email && u.email !== profile?.email)
      .map((u) => u.email)
    if (form.inviteClient && client?.email) attendeeEmails.push(client.email)

    const event = await createMeetingEvent(token, {
      summary: client ? `${MEETING_TYPE_LABEL[input.type]} - ${client.companyName}` : MEETING_TYPE_LABEL[input.type],
      description: input.agenda,
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      attendeeEmails,
    })

    let warning = ''
    let autoRecording = false
    if (!event.hangoutLink) {
      warning = 'Reunião criada no Google Agenda, mas o link do Meet ainda não apareceu. Abra o evento no Google Agenda para pegar o link.'
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

  return (
    <Modal open={open} onClose={handleClose} title={title} width="max-w-2xl">
      <div className="flex flex-col gap-4">
        <MeetingForm value={form} onChange={setForm} users={users} clients={clients} allowMeet />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {formMeetingHasEnded(form) ? 'Registrar reunião' : 'Agendar reunião'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

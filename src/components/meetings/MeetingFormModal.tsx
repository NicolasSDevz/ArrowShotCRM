import { useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { useClients } from '../../hooks/useClients'
import { createMeeting } from '../../services/meetingService'
import { syncMeetingToGoogle } from './googleMeeting'
import { showError } from '../../utils/notifyError'
import { MeetingForm } from './MeetingForm'
import { buildDefaultMeetingForm, formMeetingHasEnded, formStateToMeetingInput, type MeetingFormState } from './meetingFormState'
import { isClientMeetingType, type MeetingType } from '../../types'

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
    // Reunião que já passou (só registro) não vai pro Google Agenda.
    const toGoogle = form.createMeet && !formMeetingHasEnded(form)
    if (toGoogle && !form.time) {
      toast.error('Preencha o horário de início para criar a sala do Meet.')
      return
    }
    setSaving(true)
    try {
      const input = formStateToMeetingInput(form)
      let recordingWarning = ''
      if (toGoogle) {
        const meet = await syncMeetingToGoogle(input, { users, clients, myEmail: profile.email, inviteClient: form.inviteClient, wantsRecording: form.autoRecording })
        input.meetLink = meet.meetLink
        input.googleEventId = meet.eventId
        input.autoRecording = meet.autoRecording
        recordingWarning = meet.warning
      }
      await createMeeting(input, profile.id, profile.name)
      if (!toGoogle) toast.success(formMeetingHasEnded(form) ? 'Reunião registrada' : 'Reunião agendada')
      else if (recordingWarning) toast(recordingWarning, { duration: 12000, icon: '⚠️' })
      else toast.success(form.autoRecording ? 'Reunião no Google Agenda, com Meet e gravação automática' : 'Reunião no Google Agenda, com link do Meet')
      handleClose()
    } catch (err) {
      console.error(err)
      showError(err, toGoogle ? 'Erro ao colocar a reunião no Google Agenda' : 'Erro ao registrar reunião')
    } finally {
      setSaving(false)
    }
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

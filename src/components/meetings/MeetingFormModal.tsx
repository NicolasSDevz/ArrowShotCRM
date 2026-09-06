import { useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { useClients } from '../../hooks/useClients'
import { createMeeting } from '../../services/meetingService'
import { MeetingForm } from './MeetingForm'
import { buildDefaultMeetingForm, formStateToMeetingInput, type MeetingFormState } from './meetingFormState'
import { isClientMeetingType, type MeetingType } from '../../types'

export function MeetingFormModal({
  open,
  onClose,
  defaultClientId,
}: {
  open: boolean
  onClose: () => void
  /** Pre-fills type "Onboarding" (primeiro tipo do grupo "Reuniões com
   *  clientes") + this client — used by the ficha do cliente's "Registrar
   *  reunião" button. */
  defaultClientId?: string
}) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const { data: clients } = useClients()

  const defaultType: MeetingType = defaultClientId ? 'onboarding' : 'daily'
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
    setSaving(true)
    try {
      await createMeeting(formStateToMeetingInput(form), profile.id, profile.name)
      toast.success('Reunião registrada')
      handleClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao registrar reunião')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Nova reunião" width="max-w-2xl">
      <div className="flex flex-col gap-4">
        <MeetingForm value={form} onChange={setForm} users={users} clients={clients} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Salvar reunião
          </Button>
        </div>
      </div>
    </Modal>
  )
}

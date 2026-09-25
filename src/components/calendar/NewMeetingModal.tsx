import { useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Field, Input, Select } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { requestAccessToken, createMeetingEvent } from '../../services/googleCalendarService'
import { showError } from '../../utils/notifyError'

const DURATIONS = [
  { label: '30 minutos', minutes: 30 },
  { label: '1 hora', minutes: 60 },
  { label: '1h30', minutes: 90 },
  { label: '2 horas', minutes: 120 },
]

function nextHalfHour() {
  const d = new Date()
  d.setMinutes(d.getMinutes() < 30 ? 30 : 0, 0, 0)
  if (d.getMinutes() === 0) d.setHours(d.getHours() + 1)
  return d
}

export function NewMeetingModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { profile } = useAuth()
  const { data: users } = useUsers()

  const defaultStart = nextHalfHour()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultStart.toISOString().slice(0, 10))
  const [time, setTime] = useState(defaultStart.toTimeString().slice(0, 5))
  const [durationMin, setDurationMin] = useState(30)
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  const toggleAttendee = (email: string) =>
    setSelectedEmails((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]))

  const handleCreate = async () => {
    if (!title.trim() || !profile) return
    setCreating(true)
    try {
      const token = await requestAccessToken(false)
      const start = new Date(`${date}T${time}:00`)
      const end = new Date(start.getTime() + durationMin * 60_000)
      const attendees = selectedEmails.filter((e) => e !== profile.email)

      const event = await createMeetingEvent(token, {
        summary: title.trim(),
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        attendeeEmails: attendees,
      })

      toast.success(
        event.hangoutLink ? 'Reunião criada com link do Meet!' : 'Reunião criada (link do Meet pode levar um instante para aparecer).'
      )
      onCreated()
      onClose()
      setTitle('')
      setSelectedEmails([])
    } catch (err) {
      console.error(err)
      showError(err, 'Erro ao criar reunião')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova reunião">
      <div className="flex flex-col gap-3">
        <Field label="Título" required>
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Reunião de pauta semanal" />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Data" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Horário" required>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Duração">
            <Select value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))}>
              {DURATIONS.map((d) => (
                <option key={d.minutes} value={d.minutes}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Convidados">
          <div className="flex flex-col gap-1 rounded-lg border border-slate-200 p-2">
            {users
              .filter((u) => u.id !== profile?.id)
              .map((u) => (
                <label key={u.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selectedEmails.includes(u.email)}
                    onChange={() => toggleAttendee(u.email)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                  />
                  {u.name} <span className="text-xs text-slate-400">({u.email})</span>
                </label>
              ))}
            {users.length <= 1 && <p className="px-1.5 py-1 text-xs text-slate-400">Ninguém mais na equipe ainda.</p>}
          </div>
        </Field>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} loading={creating} disabled={!title.trim()}>
            Criar reunião
          </Button>
        </div>
      </div>
    </Modal>
  )
}

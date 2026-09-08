import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { Pencil, Trash2, ExternalLink, CheckSquare, Square } from 'lucide-react'
import { Drawer } from '../ui/Drawer'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { useClients } from '../../hooks/useClients'
import { useAllTasks } from '../../hooks/useTasks'
import { updateMeeting, deleteMeeting } from '../../services/meetingService'
import { MeetingForm } from './MeetingForm'
import { meetingToFormState, formStateToMeetingInput, type MeetingFormState } from './meetingFormState'
import { MEETING_TYPE_LABEL, MEETING_TYPE_BADGE, isClientMeetingType, type Meeting } from '../../types'

export function MeetingDrawer({ meeting, onClose }: { meeting: Meeting | null; onClose: () => void }) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const { data: clients } = useClients()
  const { data: tasks } = useAllTasks()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<MeetingFormState | null>(null)
  const [saving, setSaving] = useState(false)

  if (!meeting || !profile) return null

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]))
  const taskMap = Object.fromEntries(tasks.map((t) => [t.id, t]))
  const client = meeting.clientId ? clientMap[meeting.clientId] : undefined

  const startEditing = () => {
    setForm(meetingToFormState(meeting))
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditing(false)
    setForm(null)
  }

  const handleClose = () => {
    setEditing(false)
    setForm(null)
    onClose()
  }

  const handleSave = async () => {
    if (!form) return
    if (isClientMeetingType(form.type) && !form.clientId) {
      toast.error('Selecione o cliente vinculado a esta reunião.')
      return
    }
    setSaving(true)
    try {
      await updateMeeting(meeting.id, formStateToMeetingInput(form), profile.id, profile.name)
      toast.success('Reunião atualizada')
      setEditing(false)
      setForm(null)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao atualizar reunião')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Excluir este registro de reunião? As tarefas já criadas a partir dela não são excluídas junto.')) return
    await deleteMeeting(meeting, profile.id, profile.name)
    handleClose()
  }

  const dateLabel = format(meeting.date.toDate(), 'dd/MM/yyyy', { locale: ptBR })

  return (
    <Drawer open={!!meeting} onClose={handleClose} title={editing ? 'Editar reunião' : MEETING_TYPE_LABEL[meeting.type]}>
      <div className="flex flex-col gap-4 p-5">
        {editing && form ? (
          <>
            <MeetingForm value={form} onChange={setForm} users={users} clients={clients} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={cancelEditing}>
                Cancelar
              </Button>
              <Button onClick={handleSave} loading={saving}>
                Salvar
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <Badge className={MEETING_TYPE_BADGE[meeting.type]}>{MEETING_TYPE_LABEL[meeting.type]}</Badge>
                <p className="mt-2 text-sm text-slate-500">
                  {dateLabel}
                  {meeting.time && ` às ${meeting.time}`}
                  {client && (
                    <>
                      {' — '}
                      <span className="font-medium text-slate-700">{client.companyName}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={startEditing}>
                  Editar
                </Button>
                <button
                  onClick={handleDelete}
                  aria-label="Excluir reunião"
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {(meeting.participantIds?.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {(meeting.participantIds ?? []).map((uid) => {
                  const u = userMap[uid]
                  if (!u) return null
                  return (
                    <span key={uid} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-1 pr-2.5 text-xs text-slate-600">
                      <Avatar name={u.name} photoURL={u.photoURL} size="xs" /> {u.name}
                    </span>
                  )
                })}
              </div>
            )}

            {meeting.agenda && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Pauta</p>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{meeting.agenda}</p>
              </div>
            )}

            {meeting.decisions && (
              <div className="rounded-[10px] border border-amber-400 bg-amber-50 p-4">
                <p className="mb-1 text-sm font-semibold text-slate-700">📌 Decisões e encaminhamentos</p>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{meeting.decisions}</p>
              </div>
            )}

            {(meeting.actionItems?.length ?? 0) > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Próximos passos</p>
                <div className="flex flex-col gap-1.5">
                  {(meeting.actionItems ?? []).map((item) => {
                    const task = item.taskId ? taskMap[item.taskId] : undefined
                    const done = task?.status === 'done'
                    const assignee = item.assignedTo ? userMap[item.assignedTo] : undefined
                    return (
                      <div key={item.id} className="flex items-start gap-2 rounded-lg border border-slate-100 px-3 py-2">
                        {done ? (
                          <CheckSquare size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                        ) : (
                          <Square size={15} className="mt-0.5 shrink-0 text-slate-300" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm ${done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.description}</p>
                          <p className="text-xs text-slate-400">
                            {assignee?.name ?? 'Sem responsável'}
                            {item.dueDate && ` · prazo ${format(item.dueDate.toDate(), 'dd/MM/yyyy')}`}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {meeting.recordingLink && (
              <a
                href={meeting.recordingLink}
                target="_blank"
                rel="noreferrer"
                className="flex w-fit items-center gap-1.5 text-sm text-brand-600 hover:underline"
              >
                <ExternalLink size={14} /> Ver gravação
              </a>
            )}

            {meeting.notes && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Observações</p>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{meeting.notes}</p>
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  )
}

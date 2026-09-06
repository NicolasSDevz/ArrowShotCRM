import { useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { Trash2, Repeat } from 'lucide-react'
import { Drawer } from '../ui/Drawer'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Tabs } from '../ui/Tabs'
import { Button } from '../ui/Button'
import { ChecklistEditor } from './ChecklistEditor'
import { CommentsPanel } from '../comments/CommentsPanel'
import { ActivityPanel } from '../activity/ActivityPanel'
import { FilesPanel } from '../files/FilesPanel'
import { useAuth } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { useUsers } from '../../hooks/useUsers'
import { useAssignees } from '../../hooks/useAssignees'
import { updateTask, deleteTask, duplicateRecurringTask, notifyTaskCompleted } from '../../services/taskService'
import { advanceClientWorkflow, scheduleBriefingMeeting } from '../../services/clientWorkflowTemplates'
import { dateInputToTimestamp, timestampToDateInput } from '../../utils/dateInput'
import {
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  ONBOARDING_BOARD_STATUS_ORDER,
  GENERIC_BOARD_STATUS_ORDER,
  formatRecurrence,
  type Task,
} from '../../types/task'

const toDateInputValue = timestampToDateInput

export function TaskDrawer({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { profile } = useAuth()
  const { data: clients } = useClients()
  const { data: users } = useUsers()
  const assignees = useAssignees()
  const [title, setTitle] = useState(task?.title ?? '')
  const [briefingDateInput, setBriefingDateInput] = useState(toDateInputValue(task?.briefingMeetingDate))
  const [briefingTimeInput, setBriefingTimeInput] = useState(task?.briefingMeetingTime ?? '')

  if (!task || !profile) return null

  const save = async (data: Partial<Task>) => {
    await updateTask(task.id, data, profile.id, profile.name)
    if (data.status === 'done' && task.status !== 'done') {
      const client = clients.find((c) => c.id === task.clientId)
      if (client && task.workflowStep) await advanceClientWorkflow(task, client, profile.id, profile.name, users)
      await notifyTaskCompleted(task, client, profile.id, profile.name)
    }
  }

  const needsBriefingMeeting = task.workflowStep === 'pt_onboarding_janilson'

  const handleStatusChange = (newStatus: Task['status']) => {
    if (newStatus === 'done' && needsBriefingMeeting && !task.briefingMeetingDate) {
      toast.error('Defina a data da reunião de briefing antes de concluir esta tarefa.')
      return
    }
    save({ status: newStatus })
  }

  const commitBriefingMeeting = async () => {
    if (!briefingDateInput || !briefingTimeInput) return
    const wasEmpty = !task.briefingMeetingDate
    const meetingDate = new Date(`${briefingDateInput}T${briefingTimeInput}`)
    await save({ briefingMeetingDate: Timestamp.fromDate(meetingDate), briefingMeetingTime: briefingTimeInput })
    if (wasEmpty && task.clientId) {
      const client = clients.find((c) => c.id === task.clientId)
      if (client) {
        await scheduleBriefingMeeting(client, meetingDate, briefingTimeInput, profile.id, profile.name, users)
        toast.success('Reunião de briefing agendada e equipe notificada')
      }
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Excluir a tarefa "${task.title}"?`)) return
    await deleteTask(task, profile.id, profile.name)
    onClose()
  }

  const handleDuplicateNext = async () => {
    await duplicateRecurringTask(task, profile.id, profile.name)
    toast.success('Próxima ocorrência criada')
  }

  const statusOptions =
    task.board === 'onboarding'
      ? ONBOARDING_BOARD_STATUS_ORDER
      : task.board === 'paid_traffic' || task.board === 'cs'
        ? GENERIC_BOARD_STATUS_ORDER
        : TASK_STATUS_ORDER

  return (
    <Drawer
      open={!!task}
      onClose={onClose}
      title={
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && save({ title: title.trim() })}
          className="w-full border-none bg-transparent text-base font-semibold text-slate-800 outline-none"
        />
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Status">
            <Select value={task.status} onChange={(e) => handleStatusChange(e.target.value as Task['status'])}>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Prioridade">
            <Select value={task.priority} onChange={(e) => save({ priority: e.target.value as Task['priority'] })}>
              {Object.entries(TASK_PRIORITY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Cliente">
            <Select value={task.clientId ?? ''} onChange={(e) => save({ clientId: e.target.value || undefined })}>
              <option value="">Nenhum</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Responsável">
            <Select
              value={task.assignedTo ?? ''}
              onChange={(e) => save({ assignedTo: e.target.value || undefined })}
            >
              <option value="">Sem responsável</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Prazo">
            <Input
              type="date"
              value={toDateInputValue(task.dueDate)}
              onChange={(e) => save({ dueDate: dateInputToTimestamp(e.target.value) })}
            />
          </Field>
        </div>

        {needsBriefingMeeting && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-xs font-semibold text-amber-800">
              Data da reunião de briefing <span className="text-red-500">*</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={briefingDateInput}
                onChange={(e) => setBriefingDateInput(e.target.value)}
                onBlur={commitBriefingMeeting}
              />
              <Input
                type="time"
                value={briefingTimeInput}
                onChange={(e) => setBriefingTimeInput(e.target.value)}
                onBlur={commitBriefingMeeting}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-amber-700">
              Obrigatório para concluir esta tarefa. Ao salvar, cria o evento no Calendário e notifica a equipe.
            </p>
          </div>
        )}

        <Field label="Descrição">
          <Textarea
            rows={3}
            defaultValue={task.description ?? ''}
            onBlur={(e) => e.target.value !== (task.description ?? '') && save({ description: e.target.value })}
          />
        </Field>

        <Field label="Checklist">
          <ChecklistEditor items={task.checklist ?? []} onChange={(checklist) => save({ checklist })} />
        </Field>

        {task.recurrence && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-brand-700">
              <Repeat size={13} /> {formatRecurrence(task.recurrence)}
            </p>
            <Button variant="ghost" size="sm" onClick={handleDuplicateNext}>
              Duplicar próxima ocorrência
            </Button>
          </div>
        )}

        <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={handleDelete} className="self-start">
          Excluir tarefa
        </Button>
      </div>

      <Tabs
        tabs={[
          { label: 'Comentários', content: <CommentsPanel entityType="task" entityId={task.id} clientId={task.clientId} /> },
          {
            label: 'Arquivos',
            content: task.clientId ? (
              <FilesPanel clientId={task.clientId} category="social-media" relatedType="task" relatedId={task.id} />
            ) : (
              <p className="text-sm text-slate-400">Associe um cliente para anexar arquivos.</p>
            ),
          },
          { label: 'Histórico', content: <ActivityPanel entityType="task" entityId={task.id} /> },
        ]}
      />
    </Drawer>
  )
}

import { useState } from 'react'
import toast from 'react-hot-toast'
import { PlusCircle } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input, Select } from '../ui/Field'
import { useAuth } from '../../context/AuthContext'
import { useAssignees } from '../../hooks/useAssignees'
import { createTask } from '../../services/taskService'
import { dateInputToTimestamp } from '../../utils/dateInput'
import { TASK_PRIORITY_LABEL, type TaskPriority } from '../../types/task'
import type { Client } from '../../types/client'

/** "Criar tarefa rápida" — mesmos hooks/serviço/conversão de data do
 *  TaskFormModal (src/components/tasks/TaskFormModal.tsx), só que inline no
 *  Dashboard: sem modal, Enter no título já cria. `clients` vem do pacote
 *  compartilhado do Dashboard (evita assinar useClients de novo). */
export function QuickTaskWidget({ clients }: { clients: Client[] }) {
  const { profile } = useAuth()
  const assignees = useAssignees()

  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setTitle('')
    setClientId('')
    setAssignedTo('')
    setDueDate('')
    setPriority('normal')
  }

  const handleSubmit = async () => {
    if (!title.trim() || !profile || saving) return
    setSaving(true)
    try {
      await createTask(
        {
          title: title.trim(),
          clientId: clientId || undefined,
          assignedTo: assignedTo || undefined,
          dueDate: dateInputToTimestamp(dueDate),
          priority,
          status: 'todo',
          checklist: [],
          order: Date.now(),
        },
        profile.id,
        profile.name
      )
      toast.success('✅ Tarefa criada!')
      reset()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao criar tarefa')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500">
          <PlusCircle size={15} className="text-white" />
        </div>
        <p className="text-[16px] font-semibold text-slate-900">Nova tarefa</p>
      </div>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="Título da tarefa..."
      />

      <div className="grid grid-cols-2 gap-2">
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Cliente">
          <option value="">Cliente...</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.companyName}</option>
          ))}
        </Select>
        <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} aria-label="Responsável">
          <option value="">Responsável...</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Prazo" />
        <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} aria-label="Prioridade">
          <option value="normal">{TASK_PRIORITY_LABEL.normal}</option>
          <option value="high">{TASK_PRIORITY_LABEL.high}</option>
        </Select>
      </div>

      <Button onClick={handleSubmit} loading={saving} disabled={!title.trim()} className="self-start">
        Criar tarefa
      </Button>
    </div>
  )
}

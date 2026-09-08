import { Plus, X } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import { findUserIdByName } from '../../utils/userLookup'
import {
  MEETING_TYPE_LABEL,
  MEETING_TYPE_GROUP_LABEL,
  MEETING_TYPE_GROUPS,
  MEETING_TYPE_SCHEDULE_HINT,
  MEETING_DEFAULT_PARTICIPANT_NAMES,
  isClientMeetingType,
  type AppUser,
  type Client,
  type MeetingType,
} from '../../types'
import type { ActionItemFormState, MeetingFormState } from './meetingFormState'

export function MeetingForm({
  value,
  onChange,
  users,
  clients,
}: {
  value: MeetingFormState
  onChange: (next: MeetingFormState) => void
  users: AppUser[]
  clients: Client[]
}) {
  const set = <K extends keyof MeetingFormState>(key: K, v: MeetingFormState[K]) => onChange({ ...value, [key]: v })

  const internalUsers = users.filter((u) => u.role !== 'client')
  const activeClients = clients.filter((c) => c.status === 'active')

  const handleTypeChange = (type: MeetingType) => {
    const defaultNames = MEETING_DEFAULT_PARTICIPANT_NAMES[type]
    const participantIds = defaultNames
      ? defaultNames.map((name) => findUserIdByName(users, name)).filter((id): id is string => !!id)
      : []
    onChange({ ...value, type, participantIds, clientId: isClientMeetingType(type) ? value.clientId : '' })
  }

  const toggleParticipant = (uid: string) => {
    const has = value.participantIds.includes(uid)
    set('participantIds', has ? value.participantIds.filter((id) => id !== uid) : [...value.participantIds, uid])
  }

  const addActionItem = () =>
    set('actionItems', [...value.actionItems, { id: crypto.randomUUID(), description: '', assignedTo: '', dueDateStr: '' }])
  const updateActionItem = (id: string, patch: Partial<ActionItemFormState>) =>
    set('actionItems', value.actionItems.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  const removeActionItem = (id: string) => set('actionItems', value.actionItems.filter((a) => a.id !== id))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tipo de reunião" required>
          <Select value={value.type} onChange={(e) => handleTypeChange(e.target.value as MeetingType)}>
            {(Object.entries(MEETING_TYPE_GROUPS) as [keyof typeof MEETING_TYPE_GROUPS, MeetingType[]][]).map(([group, types]) => (
              <optgroup key={group} label={MEETING_TYPE_GROUP_LABEL[group]}>
                {types.map((t) => (
                  <option key={t} value={t}>{MEETING_TYPE_LABEL[t]}</option>
                ))}
              </optgroup>
            ))}
          </Select>
          {MEETING_TYPE_SCHEDULE_HINT[value.type] && (
            <p className="mt-1 text-xs text-slate-400">{MEETING_TYPE_SCHEDULE_HINT[value.type]}</p>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data" required>
            <Input type="date" value={value.dateStr} onChange={(e) => set('dateStr', e.target.value)} />
          </Field>
          <Field label="Horário">
            <Input type="time" value={value.time} onChange={(e) => set('time', e.target.value)} />
          </Field>
        </div>
      </div>

      {isClientMeetingType(value.type) && (
        <Field label="Cliente vinculado">
          <Select value={value.clientId} onChange={(e) => set('clientId', e.target.value)}>
            <option value="">Selecione...</option>
            {activeClients.map((c) => (
              <option key={c.id} value={c.id}>{c.companyName}</option>
            ))}
          </Select>
        </Field>
      )}

      <div>
        <span className="mb-1.5 block text-xs font-medium text-slate-500">Participantes</span>
        <div className="flex flex-wrap gap-2">
          {internalUsers.map((u) => {
            const checked = value.participantIds.includes(u.id)
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleParticipant(u.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors duration-150 ease-in-out ${
                  checked ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Avatar name={u.name} photoURL={u.photoURL} size="xs" />
                {u.name}
              </button>
            )
          })}
        </div>
      </div>

      <Field label="Pauta">
        <Textarea
          rows={3}
          value={value.agenda}
          onChange={(e) => set('agenda', e.target.value)}
          placeholder="Descreva os principais pontos discutidos na reunião..."
        />
      </Field>

      <div>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">📌 Decisões e encaminhamentos</span>
        <textarea
          rows={3}
          value={value.decisions}
          onChange={(e) => set('decisions', e.target.value)}
          placeholder="Liste as decisões e encaminhamentos definidos..."
          className="w-full resize-none rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-800 outline-none transition-all duration-150 ease-in-out placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">Próximos passos</span>
          <Button type="button" variant="ghost" size="sm" icon={<Plus size={13} />} onClick={addActionItem}>
            Adicionar ação
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {value.actionItems.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-1 items-center gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_160px_150px_auto]"
            >
              <Input
                placeholder="Descrição da ação"
                value={item.description}
                onChange={(e) => updateActionItem(item.id, { description: e.target.value })}
              />
              <Select value={item.assignedTo} onChange={(e) => updateActionItem(item.id, { assignedTo: e.target.value })}>
                <option value="">Responsável...</option>
                {internalUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
              <Input type="date" value={item.dueDateStr} onChange={(e) => updateActionItem(item.id, { dueDateStr: e.target.value })} />
              <button
                type="button"
                onClick={() => removeActionItem(item.id)}
                aria-label="Remover ação"
                className="justify-self-end rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
              >
                <X size={15} />
              </button>
            </div>
          ))}
          {value.actionItems.length === 0 && <p className="text-xs text-slate-400">Nenhuma ação adicionada ainda.</p>}
        </div>
      </div>

      <Field label="Link da gravação">
        <Input
          value={value.recordingLink}
          onChange={(e) => set('recordingLink', e.target.value)}
          placeholder="Cole o link do Google Drive com a gravação"
        />
      </Field>

      <Field label="Observações adicionais">
        <Textarea rows={2} value={value.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </div>
  )
}

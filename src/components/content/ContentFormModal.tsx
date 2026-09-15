import { useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { useUsers } from '../../hooks/useUsers'
import { createContent } from '../../services/contentService'
import { dateInputToTimestamp } from '../../utils/dateInput'
import {
  CONTENT_PILLAR_LABEL,
  CONTENT_FORMAT_LABEL,
  type ContentPillar,
  type ContentStatus,
  type ContentType,
} from '../../types/content'

const FORMAT_OPTIONS: ContentType[] = ['post', 'reels', 'story']

export function ContentFormModal({
  open,
  onClose,
  defaultClientId,
  defaultStatus = 'ideas',
  defaultScheduledDate,
}: {
  open: boolean
  onClose: () => void
  defaultClientId?: string
  defaultStatus?: ContentStatus
  /** "yyyy-MM-dd" — pré-preenche a data ao criar a partir de um dia do
   *  calendário (o "+" ao passar o mouse num dia). */
  defaultScheduledDate?: string
}) {
  const { profile } = useAuth()
  const { data: clients } = useClients()
  const { data: users } = useUsers()
  const activeClients = clients.filter((c) => c.status === 'active')

  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState(defaultClientId ?? '')
  const [pillar, setPillar] = useState<ContentPillar | ''>('')
  const [type, setType] = useState<ContentType>('post')
  const [scheduledDate, setScheduledDate] = useState(defaultScheduledDate ?? '')
  const [assignedTo, setAssignedTo] = useState('')
  const [canvaLink, setCanvaLink] = useState('')
  const [caption, setCaption] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setTitle('')
    setClientId(defaultClientId ?? '')
    setPillar('')
    setType('post')
    setScheduledDate(defaultScheduledDate ?? '')
    setAssignedTo('')
    setCanvaLink('')
    setCaption('')
    setNotes('')
  }

  const handleSubmit = async () => {
    if (!title.trim() || !clientId || !profile) return
    setSaving(true)
    try {
      await createContent(
        {
          clientId,
          title: title.trim(),
          type,
          platform: 'instagram',
          pillar: pillar || undefined,
          scheduledDate: dateInputToTimestamp(scheduledDate),
          assignedTo: assignedTo || undefined,
          canvaLink: canvaLink.trim() || undefined,
          caption: caption.trim() || undefined,
          notes: notes.trim() || undefined,
          status: defaultStatus,
          order: Date.now(),
          hashtags: [],
        },
        profile.id,
        profile.name
      )
      toast.success('Conteúdo criado')
      reset()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao criar conteúdo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo conteúdo">
      <div className="flex flex-col gap-3">
        <Field label="Cliente" required>
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Selecione...</option>
            {activeClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Título do conteúdo" required>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Carrossel - Dicas de limpeza"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Pilar">
            <Select value={pillar} onChange={(e) => setPillar(e.target.value as ContentPillar)}>
              <option value="">Nenhum</option>
              {Object.entries(CONTENT_PILLAR_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Formato">
            <Select value={type} onChange={(e) => setType(e.target.value as ContentType)}>
              {FORMAT_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {CONTENT_FORMAT_LABEL[v]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Data de publicação">
            <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </Field>

          <Field label="Responsável">
            <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Sem responsável</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Link do Canva">
          <Input value={canvaLink} onChange={(e) => setCanvaLink(e.target.value)} placeholder="https://canva.com/..." />
        </Field>

        <Field label="Legenda">
          <Textarea rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} />
        </Field>

        <Field label="Observações">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!title.trim() || !clientId}>
            Criar conteúdo
          </Button>
        </div>
      </div>
    </Modal>
  )
}

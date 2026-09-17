import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Field, Input } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { updateClient } from '../../services/clientService'
import type { Client } from '../../types/client'

const WHATSAPP_GROUP_PREFIX = 'https://chat.whatsapp.com/'

/** Modal rápido para colar/editar só o link do grupo do WhatsApp do cliente
 *  — atalho a partir do botão no header da ficha (ver TAREFA 6). O campo
 *  completo também existe na edição do cliente (ClientFormModal). */
export function WhatsappGroupLinkModal({
  open,
  onClose,
  client,
}: {
  open: boolean
  onClose: () => void
  client: Client
}) {
  const { profile } = useAuth()
  const [link, setLink] = useState(client.whatsappGroupLink ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setLink(client.whatsappGroupLink ?? '')
  }, [open, client.whatsappGroupLink])

  const trimmed = link.trim()
  const isValid = trimmed === '' || trimmed.startsWith(WHATSAPP_GROUP_PREFIX)

  const handleSubmit = async () => {
    if (!isValid || !profile) return
    setSaving(true)
    try {
      await updateClient(client.id, { whatsappGroupLink: trimmed || undefined }, profile.id, profile.name)
      toast.success('Link do grupo salvo')
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar o link do grupo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Link do grupo do WhatsApp">
      <Field label="Link do grupo WhatsApp">
        <Input
          autoFocus
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://chat.whatsapp.com/..."
        />
        {!isValid && <p className="mt-1 text-xs text-red-500">O link precisa começar com {WHATSAPP_GROUP_PREFIX}</p>}
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={saving} disabled={!isValid}>
          Salvar
        </Button>
      </div>
    </Modal>
  )
}

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { createLead } from '../../services/leadService'
import { findUserIdByName } from '../../utils/userLookup'
import { isPhoneComplete } from '../../utils/masks'
import { LeadForm } from './LeadForm'
import { buildDefaultLeadForm, formStateToLeadFields, type LeadFormState } from './leadFormState'

export function LeadFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const [form, setForm] = useState<LeadFormState>(() => buildDefaultLeadForm())
  const [saving, setSaving] = useState(false)

  const reset = () => setForm(buildDefaultLeadForm(findUserIdByName(users, 'Bruno')))

  // Seeds "Bruno" as the default responsável once the users list has loaded
  // (it's still empty on the very first render). Runs at most once per open —
  // otherwise clearing "Responsável" would snap back to Bruno on the next
  // `users` snapshot.
  const seededRef = useRef(false)
  useEffect(() => {
    if (!open) {
      seededRef.current = false
      return
    }
    if (seededRef.current || users.length === 0) return
    seededRef.current = true
    setForm((f) => (f.assignedTo ? f : { ...f, assignedTo: findUserIdByName(users, 'Bruno') ?? '' }))
  }, [open, users])

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSave = async () => {
    if (!profile) return
    if (!form.contactName.trim()) {
      toast.error('Informe o nome do responsável')
      return
    }
    if (!isPhoneComplete(form.whatsapp)) {
      toast.error('Informe um WhatsApp válido')
      return
    }
    setSaving(true)
    try {
      await createLead(
        { ...formStateToLeadFields(form), status: 'new', order: Date.now(), contactHistory: [] },
        profile.id,
        profile.name
      )
      toast.success('Lead criado')
      handleClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao criar lead')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Novo lead" width="max-w-2xl">
      <div className="flex flex-col gap-4">
        <LeadForm value={form} onChange={setForm} users={users} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!form.contactName.trim()}>
            Criar lead
          </Button>
        </div>
      </div>
    </Modal>
  )
}

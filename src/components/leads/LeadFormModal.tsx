import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { useProducts } from '../../hooks/useProducts'
import { createLead } from '../../services/leadService'
import { findUserIdByName } from '../../utils/userLookup'
import { isPhoneComplete } from '../../utils/masks'
import { isValidEmail } from '../../utils/validation'
import { useLeadPipelines } from '../../hooks/useLeadPipelines'
import { Field, Select } from '../ui/Field'
import { LeadForm } from './LeadForm'
import type { ResolvedPipeline } from '../../types'
import { buildDefaultLeadForm, formStateToLeadFields, type LeadFormState } from './leadFormState'

export function LeadFormModal({ open, onClose, pipeline }: { open: boolean; onClose: () => void; pipeline: ResolvedPipeline }) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const { data: products } = useProducts()
  const [form, setForm] = useState<LeadFormState>(() => buildDefaultLeadForm())
  const [saving, setSaving] = useState(false)
  const { pipelines } = useLeadPipelines()
  // Onde o lead nasce: por padrão a 1ª etapa do pipeline aberto, mas dá pra
  // jogar direto em qualquer etapa (ou em outro pipeline).
  const [pipelineId, setPipelineId] = useState(pipeline.id)
  const [stageId, setStageId] = useState(pipeline.stages[0]?.id ?? '')
  const target = pipelines.find((p) => p.id === pipelineId) ?? pipeline
  const targetStage = target.stages.find((s) => s.id === stageId) ?? target.stages[0]
  useEffect(() => {
    if (!open) return
    setPipelineId(pipeline.id)
    setStageId(pipeline.stages[0]?.id ?? '')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- só reseta ao abrir ou trocar de pipeline
  }, [open, pipeline.id])

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
    if (form.email.trim() && !isValidEmail(form.email)) {
      toast.error('Digite um e-mail válido (ex: nome@empresa.com)')
      return
    }
    if (!isPhoneComplete(form.whatsapp)) {
      toast.error('Informe um WhatsApp válido')
      return
    }
    setSaving(true)
    try {
      await createLead(
        {
          ...formStateToLeadFields(form, products),
          status: targetStage.id,
          pipelineId: target.isDefault ? undefined : target.id,
          // Negativo: lead novo entra no topo da coluna.
          order: -Date.now(),
          contactHistory: [],
        },
        profile.id,
        profile.name
      )
      toast.success(`Lead criado em ${targetStage.label}`)
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
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
          {pipelines.length > 1 && (
            <Field label="Pipeline">
              <Select
                value={target.id}
                onChange={(e) => {
                  const next = pipelines.find((p) => p.id === e.target.value)
                  setPipelineId(e.target.value)
                  setStageId(next?.stages[0]?.id ?? '')
                }}
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Etapa em que o lead entra">
            <Select value={targetStage?.id ?? ''} onChange={(e) => setStageId(e.target.value)}>
              {target.stages.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <LeadForm value={form} onChange={setForm} users={users} pipelineFields={target.fields} />
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

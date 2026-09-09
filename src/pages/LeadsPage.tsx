import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLeads } from '../hooks/useLeads'
import { useUsers } from '../hooks/useUsers'
import { useAuth } from '../context/AuthContext'
import { KanbanBoard } from '../components/kanban/KanbanBoard'
import { LeadCard } from '../components/leads/LeadCard'
import { LeadFormModal } from '../components/leads/LeadFormModal'
import { ImportLeadsModal } from '../components/leads/ImportLeadsModal'
import { LeadDrawer } from '../components/leads/LeadDrawer'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Field, Select, Textarea } from '../components/ui/Field'
import { moveLeadStatus, convertLeadToClient } from '../services/leadService'
import {
  LEAD_STATUS_LABEL,
  LEAD_STATUS_ORDER,
  LEAD_STATUS_COLOR,
  LEAD_LOST_REASON_LABEL,
  type Lead,
  type LeadStatus,
  type LeadLostReason,
} from '../types'

export function LeadsPage() {
  const { profile } = useAuth()
  const { data: leads } = useLeads()
  const { data: users } = useUsers()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)

  // Fluxos que precisam de confirmação antes de mover no pipeline.
  const [lossPrompt, setLossPrompt] = useState<{ lead: Lead; order: number } | null>(null)
  const [lossReason, setLossReason] = useState<LeadLostReason>('price')
  const [lossNote, setLossNote] = useState('')
  const [convertPrompt, setConvertPrompt] = useState<Lead | null>(null)
  const [busy, setBusy] = useState(false)

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))
  const openLead = leads.find((l) => l.id === openLeadId) ?? null

  const columns = LEAD_STATUS_ORDER.map((s) => ({
    id: s,
    label: LEAD_STATUS_LABEL[s],
    accentColor: LEAD_STATUS_COLOR[s],
  }))

  const handleMove = (lead: Lead, newStatus: LeadStatus, newOrder: number) => {
    if (!profile) return

    // Arrastou para "Perdido": pede o motivo antes de efetivar.
    if (newStatus === 'lost' && lead.status !== 'lost') {
      setLossReason('price')
      setLossNote('')
      setLossPrompt({ lead, order: newOrder })
      return
    }

    void moveLeadStatus(lead, newStatus, newOrder, profile.id, profile.name).then(() => {
      // Arrastou para "Fechado": oferece converter em cliente na hora.
      if (newStatus === 'closed' && lead.status !== 'closed' && !lead.convertedClientId) {
        setConvertPrompt({ ...lead, status: 'closed' })
      }
    })
  }

  const confirmLoss = async () => {
    if (!profile || !lossPrompt) return
    setBusy(true)
    try {
      await moveLeadStatus(lossPrompt.lead, 'lost', lossPrompt.order, profile.id, profile.name, {
        lostReason: lossReason,
        lostReasonNote: lossNote,
      })
      toast.success('Lead marcado como perdido')
      setLossPrompt(null)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao mover o lead')
    } finally {
      setBusy(false)
    }
  }

  const confirmConvert = async () => {
    if (!profile || !convertPrompt) return
    setBusy(true)
    try {
      const clientId = await convertLeadToClient(convertPrompt, profile.id, profile.name, users)
      toast.success('Lead convertido em cliente')
      setConvertPrompt(null)
      navigate(`/clientes/${clientId}`)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao converter lead')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900">Leads</h1>
          <p className="text-[15px] text-[#64748B]">Pipeline de novos clientes</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<Upload size={14} />} onClick={() => setImporting(true)}>
            Importar leads
          </Button>
          <Button icon={<Plus size={14} />} onClick={() => setCreating(true)}>
            Novo lead
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <KanbanBoard<Lead, LeadStatus>
          columns={columns}
          items={leads}
          getStatus={(l) => l.status}
          renderCard={(l) => (
            <LeadCard lead={l} assignee={l.assignedTo ? userMap[l.assignedTo] : undefined} onClick={() => setOpenLeadId(l.id)} />
          )}
          onMove={handleMove}
        />
      </div>

      <LeadFormModal open={creating} onClose={() => setCreating(false)} />
      <ImportLeadsModal open={importing} onClose={() => setImporting(false)} />
      <LeadDrawer key={`lead-${openLeadId ?? 'none'}`} lead={openLead} onClose={() => setOpenLeadId(null)} />

      <Modal open={!!lossPrompt} onClose={() => setLossPrompt(null)} title="Motivo da perda">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">
            Por que perdemos <span className="font-semibold text-slate-700">{lossPrompt?.lead.companyName?.trim() || lossPrompt?.lead.contactName}</span>?
          </p>
          <Field label="Motivo">
            <Select value={lossReason} onChange={(e) => setLossReason(e.target.value as LeadLostReason)}>
              {(Object.entries(LEAD_LOST_REASON_LABEL) as [LeadLostReason, string][]).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Observação (opcional)">
            <Textarea rows={3} value={lossNote} onChange={(e) => setLossNote(e.target.value)} placeholder="Detalhes que ajudem a entender a perda" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLossPrompt(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={confirmLoss} loading={busy} className="bg-red-600 hover:bg-red-700">
              Marcar como perdido
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!convertPrompt} onClose={() => setConvertPrompt(null)} title="Converter em cliente">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{convertPrompt?.companyName?.trim() || convertPrompt?.contactName}</span> foi movido para{' '}
            <span className="font-semibold text-slate-700">Fechado</span>. Deseja criar o cliente agora? As tarefas de onboarding serão geradas automaticamente.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConvertPrompt(null)} disabled={busy}>
              Agora não
            </Button>
            <Button onClick={confirmConvert} loading={busy} className="bg-emerald-600 hover:bg-emerald-700">
              Converter em cliente
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

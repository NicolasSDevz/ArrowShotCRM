import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Upload, Kanban, List, Settings2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLeads } from '../hooks/useLeads'
import { useUsers } from '../hooks/useUsers'
import { useLeadPipelines } from '../hooks/useLeadPipelines'
import { useLeadForms } from '../hooks/useLeadForms'
import { leadFormColor, type LeadFormTag } from '../components/leads/leadFormColors'
import { useAuth } from '../context/AuthContext'
import { usePersistedViewMode } from '../hooks/usePersistedViewMode'
import { KanbanBoard } from '../components/kanban/KanbanBoard'
import { LeadCard } from '../components/leads/LeadCard'
import { LeadFormModal } from '../components/leads/LeadFormModal'
import { ImportLeadsModal } from '../components/leads/ImportLeadsModal'
import { LeadDrawer } from '../components/leads/LeadDrawer'
import { LeadsListView } from '../components/leads/LeadsListView'
import { LeadPipelineModal } from '../components/leads/LeadPipelineModal'
import { LeadFormsPanel } from '../components/leads/LeadFormsPanel'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Field, Select, Textarea } from '../components/ui/Field'
import { moveLeadStatus, convertLeadToClient } from '../services/leadService'
import { LEAD_LOST_REASON_LABEL, DEFAULT_PIPELINE_ID, leadPipelineId, stageOfLead, type Lead, type LeadLostReason } from '../types'

export function LeadsPage() {
  const { profile } = useAuth()
  const { data: leads } = useLeads()
  const { data: users } = useUsers()
  const { pipelines } = useLeadPipelines()
  const { data: leadForms } = useLeadForms()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [view, setView] = usePersistedViewMode<'kanban' | 'list'>('leadsView', 'kanban')
  const [mainTab, setMainTab] = useState<'pipeline' | 'forms'>('pipeline')
  // Pipeline aberto agora (lembrado entre visitas). Se o salvo não existe mais, cai no padrão.
  const [pipelineChoice, setPipelineChoice] = useState<string>(() => {
    try {
      return localStorage.getItem('leadsPipeline') || DEFAULT_PIPELINE_ID
    } catch {
      return DEFAULT_PIPELINE_ID
    }
  })
  const [pipelineModal, setPipelineModal] = useState<'closed' | 'new' | 'edit'>('closed')
  const activePipeline = pipelines.find((p) => p.id === pipelineChoice) ?? pipelines[0]
  const choosePipeline = (id: string) => {
    setPipelineChoice(id)
    try {
      localStorage.setItem('leadsPipeline', id)
    } catch {
      /* sem storage: só não lembra */
    }
  }

  // Fluxos que precisam de confirmação antes de mover no pipeline.
  const [lossPrompt, setLossPrompt] = useState<{ lead: Lead; order: number; stageId: string } | null>(null)
  const [lossReason, setLossReason] = useState<LeadLostReason>('price')
  const [lossNote, setLossNote] = useState('')
  const [convertPrompt, setConvertPrompt] = useState<Lead | null>(null)
  const [busy, setBusy] = useState(false)

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))
  const formTags: Record<string, LeadFormTag> = Object.fromEntries(leadForms.map((f) => [f.id, { name: f.name, color: leadFormColor(f) }]))
  const formTagOf = (l: Lead) => (l.sourceFormId ? formTags[l.sourceFormId] : undefined)
  const openLead = leads.find((l) => l.id === openLeadId) ?? null

  const pipelineLeads = leads.filter((l) => leadPipelineId(l) === activePipeline.id)
  const countByPipeline = (id: string) => leads.filter((l) => leadPipelineId(l) === id).length
  const leadCountByStage: Record<string, number> = {}
  for (const l of pipelineLeads) {
    const id = stageOfLead(activePipeline, l.status).id
    leadCountByStage[id] = (leadCountByStage[id] ?? 0) + 1
  }

  const columns = activePipeline.stages.map((s) => ({ id: s.id, label: s.label, accentColor: s.color }))
  const stageKind = (id: string) => activePipeline.stages.find((st) => st.id === id)?.kind ?? 'open'

  const handleMove = (lead: Lead, newStatus: string, newOrder: number) => {
    if (!profile) return

    // Arrastou para "Perdido": pede o motivo antes de efetivar.
    if (stageKind(newStatus) === 'lost' && lead.status !== newStatus) {
      setLossReason('price')
      setLossNote('')
      setLossPrompt({ lead, order: newOrder, stageId: newStatus })
      return
    }

    void moveLeadStatus(lead, newStatus, newOrder, profile.id, profile.name, undefined, activePipeline).then(() => {
      // Arrastou para uma etapa de ganho: oferece converter em cliente na hora.
      if (stageKind(newStatus) === 'won' && lead.status !== newStatus && !lead.convertedClientId) {
        setConvertPrompt({ ...lead, status: newStatus })
      }
    })
  }

  const confirmLoss = async () => {
    if (!profile || !lossPrompt) return
    setBusy(true)
    try {
      await moveLeadStatus(
        lossPrompt.lead,
        lossPrompt.stageId,
        lossPrompt.order,
        profile.id,
        profile.name,
        { lostReason: lossReason, lostReasonNote: lossNote },
        activePipeline
      )
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
      <div>
        <h1 className="text-[28px] font-extrabold text-slate-900">Leads</h1>
        <p className="text-[15px] text-[#64748B]">Pipeline de novos clientes e formulários de captura</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {(['pipeline', 'forms'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setMainTab(t)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ease-in-out ${
              mainTab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {t === 'pipeline' ? 'Pipeline' : 'Formulários'}
          </button>
        ))}
      </div>

      {mainTab === 'forms' ? (
        <LeadFormsPanel />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {pipelines.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => choosePipeline(p.id)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    p.id === activePipeline.id ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {p.name}
                  <span className="rounded-full bg-white/70 px-1.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">{countByPipeline(p.id)}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPipelineModal('new')}
                className="flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-500 hover:border-brand-400 hover:text-brand-600"
              >
                <Plus size={13} /> Novo pipeline
              </button>
              <button
                type="button"
                onClick={() => setPipelineModal('edit')}
                title="Configurar este pipeline (etapas e campos)"
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <Settings2 size={15} /> Editar etapas e campos
              </button>
            </div>
            <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
              <button
                onClick={() => setView('kanban')}
                title="Visualizar em quadro"
                className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                  view === 'kanban' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Kanban size={15} />
              </button>
              <button
                onClick={() => setView('list')}
                title="Visualizar em lista"
                className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                  view === 'list' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <List size={15} />
              </button>
            </div>
            <Button variant="secondary" icon={<Upload size={14} />} onClick={() => setImporting(true)}>
              Importar leads
            </Button>
            <Button icon={<Plus size={14} />} onClick={() => setCreating(true)}>
              Novo lead
            </Button>
          </div>

          {view === 'kanban' ? (
            <div className="flex-1 overflow-hidden">
              <KanbanBoard<Lead, string>
                key={activePipeline.id}
                columns={columns}
                items={pipelineLeads}
                getStatus={(l) => stageOfLead(activePipeline, l.status).id}
                renderCard={(l) => (
                  <LeadCard lead={l} assignee={l.assignedTo ? userMap[l.assignedTo] : undefined} onClick={() => setOpenLeadId(l.id)} fields={activePipeline.fields} formTag={formTagOf(l)} />
                )}
                onMove={handleMove}
              />
            </div>
          ) : (
            <LeadsListView leads={pipelineLeads} userMap={userMap} onOpenLead={setOpenLeadId} pipelines={pipelines} formTagOf={formTagOf} />
          )}
        </>
      )}

      <LeadFormModal open={creating} onClose={() => setCreating(false)} pipeline={activePipeline} />
      <ImportLeadsModal open={importing} onClose={() => setImporting(false)} pipeline={activePipeline} />
      <LeadPipelineModal
        open={pipelineModal !== 'closed'}
        onClose={() => setPipelineModal('closed')}
        pipeline={pipelineModal === 'edit' ? activePipeline : null}
        leadCountByStage={leadCountByStage}
        totalLeads={pipelineLeads.length}
        nextOrder={pipelines.length}
        onSaved={choosePipeline}
      />
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
            <span className="font-semibold text-slate-700">{stageOfLead(activePipeline, convertPrompt?.status ?? '').label}</span>. Deseja criar o cliente agora? As tarefas de onboarding serão geradas automaticamente.
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

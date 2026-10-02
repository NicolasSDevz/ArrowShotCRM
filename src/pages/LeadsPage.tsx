import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Upload, Kanban, List, Settings2, Gauge, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLeads } from '../hooks/useLeads'
import { useUsers } from '../hooks/useUsers'
import { useClients } from '../hooks/useClients'
import { findClientMatch } from '../utils/leadDuplicates'
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
import { LeadBantMetrics } from '../components/leads/LeadBantMetrics'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Field, Select, Textarea } from '../components/ui/Field'
import { moveLeadStatus } from '../services/leadService'
import { ConvertLeadModal } from '../components/leads/ConvertLeadModal'
import { LEAD_LOST_REASON_LABEL, LEAD_SEGMENT_LABEL, LEAD_TEMPERATURE_LABEL, DEFAULT_PIPELINE_ID, leadPipelineId, leadTemperature, stageOfLead, type Lead, type LeadLostReason, type LeadSegment, type LeadTemperature } from '../types'

export function LeadsPage() {
  const { profile } = useAuth()
  const { data: leads } = useLeads()
  const { data: users } = useUsers()
  const { data: clients } = useClients()
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
  // Filtro por faixa do BANT ('' = todos, 'none' = ainda não avaliados).
  const [bantOpen, setBantOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [tempFilter, setTempFilter] = useState<LeadTemperature | 'none' | ''>('')
  // Filtro por segmento ('' = todos, 'none' = sem segmento definido).
  const [segmentFilter, setSegmentFilter] = useState<LeadSegment | 'none' | ''>('')

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))
  const formTags: Record<string, LeadFormTag> = Object.fromEntries(leadForms.map((f) => [f.id, { name: f.name, color: leadFormColor(f) }]))
  const formTagOf = (l: Lead) => (l.sourceFormId ? formTags[l.sourceFormId] : undefined)
  const existingClientOf = (l: Lead) => (l.convertedClientId ? undefined : findClientMatch(l, clients)?.client.companyName)
  const openLead = leads.find((l) => l.id === openLeadId) ?? null

  const allPipelineLeads = leads.filter((l) => leadPipelineId(l) === activePipeline.id)
  const tempOf = (l: Lead) => leadTemperature(l.bant) ?? 'none'
  const needle = search.trim().toLowerCase()
  const digits = needle.replace(/\D/g, '')
  const matchesSearch = (l: Lead) =>
    !needle ||
    [l.contactName, l.companyName, l.email, l.cityRegion].some((v) => v?.toLowerCase().includes(needle)) ||
    (digits.length >= 4 && (l.whatsapp ?? '').replace(/\D/g, '').includes(digits))
  const segmentOf = (l: Lead) => l.segment ?? 'none'
  const pipelineLeads = allPipelineLeads.filter(
    (l) => (!tempFilter || tempOf(l) === tempFilter) && (!segmentFilter || segmentOf(l) === segmentFilter) && matchesSearch(l)
  )
  const countBySegment = (s: LeadSegment | 'none') => allPipelineLeads.filter((l) => segmentOf(l) === s).length
  const countByTemp = (t: LeadTemperature | 'none') => allPipelineLeads.filter((l) => tempOf(l) === t).length
  const countByPipeline = (id: string) => leads.filter((l) => leadPipelineId(l) === id).length
  const leadCountByStage: Record<string, number> = {}
  for (const l of allPipelineLeads) {
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

  return (
    <div className="flex flex-col gap-4">
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
            <Button variant="secondary" icon={<Gauge size={14} />} onClick={() => setBantOpen(true)}>
              Métricas BANT
            </Button>
            <Button variant="secondary" icon={<Upload size={14} />} onClick={() => setImporting(true)}>
              Importar leads
            </Button>
            <Button icon={<Plus size={14} />} onClick={() => setCreating(true)}>
              Novo lead
            </Button>
          </div>

          <div role="group" aria-label="Filtrar por faixa do BANT" className="flex flex-wrap items-center gap-1.5">
            <div className="relative mr-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nome, empresa, WhatsApp..."
                aria-label="Buscar leads por nome, empresa ou WhatsApp"
                className="h-8 w-64 rounded-full border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            {([
              ['', 'Todos', allPipelineLeads.length],
              ['hot', LEAD_TEMPERATURE_LABEL.hot, countByTemp('hot')],
              ['warm', LEAD_TEMPERATURE_LABEL.warm, countByTemp('warm')],
              ['cold', LEAD_TEMPERATURE_LABEL.cold, countByTemp('cold')],
              ['disqualified', LEAD_TEMPERATURE_LABEL.disqualified, countByTemp('disqualified')],
              ['none', 'Sem avaliação', countByTemp('none')],
            ] as [LeadTemperature | 'none' | '', string, number][]).map(([value, label, count]) => (
              <button
                key={value || 'all'}
                type="button"
                onClick={() => setTempFilter(value)}
                aria-pressed={tempFilter === value}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                  tempFilter === value ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
                <span className={`rounded-full px-1.5 text-xs font-semibold ${tempFilter === value ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
              </button>
            ))}
          </div>

          <div role="group" aria-label="Filtrar por segmento" className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Segmento</span>
            {([
              ['', 'Todos', allPipelineLeads.length],
              ['cleaning_services', LEAD_SEGMENT_LABEL.cleaning_services, countBySegment('cleaning_services')],
              ['cleaning_products', LEAD_SEGMENT_LABEL.cleaning_products, countBySegment('cleaning_products')],
              ['none', 'Sem segmento', countBySegment('none')],
            ] as [LeadSegment | 'none' | '', string, number][]).map(([value, label, count]) => (
              <button
                key={value || 'all'}
                type="button"
                onClick={() => setSegmentFilter(value)}
                aria-pressed={segmentFilter === value}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                  segmentFilter === value ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
                <span className={`rounded-full px-1.5 text-xs font-semibold ${segmentFilter === value ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
              </button>
            ))}
          </div>

          {view === 'kanban' ? (
            // Altura da tela: cada coluna rola por dentro (antes a página
            // descontava o cabeçalho e sobravam ~280px pro quadro).
            <div className="h-[calc(100vh-150px)] min-h-[460px]">
              <KanbanBoard<Lead, string>
                key={activePipeline.id}
                columns={columns}
                items={pipelineLeads}
                getStatus={(l) => stageOfLead(activePipeline, l.status).id}
                renderCard={(l) => (
                  <LeadCard lead={l} assignee={l.assignedTo ? userMap[l.assignedTo] : undefined} onClick={() => setOpenLeadId(l.id)} fields={activePipeline.fields} formTag={formTagOf(l)} existingClientName={existingClientOf(l)} />
                )}
                onMove={handleMove}
                pageSize={30}
              />
            </div>
          ) : (
            <LeadsListView key={`${activePipeline.id}-${tempFilter}-${segmentFilter}-${search}`} leads={pipelineLeads} userMap={userMap} onOpenLead={setOpenLeadId} pipelines={pipelines} formTagOf={formTagOf} />
          )}
        </>
      )}

      <LeadBantMetrics open={bantOpen} onClose={() => setBantOpen(false)} leads={allPipelineLeads} pipeline={activePipeline} clients={clients} />
      <LeadFormModal open={creating} onClose={() => setCreating(false)} pipeline={activePipeline} />
      <ImportLeadsModal open={importing} onClose={() => setImporting(false)} pipeline={activePipeline} />
      <LeadPipelineModal
        open={pipelineModal !== 'closed'}
        onClose={() => setPipelineModal('closed')}
        pipeline={pipelineModal === 'edit' ? activePipeline : null}
        leadCountByStage={leadCountByStage}
        totalLeads={allPipelineLeads.length}
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

      <ConvertLeadModal
        lead={convertPrompt}
        onClose={() => setConvertPrompt(null)}
        onDone={(clientId) => {
          setConvertPrompt(null)
          navigate(`/clientes/${clientId}`)
        }}
        intro={
          <>
            <span className="font-semibold text-slate-700">{convertPrompt?.companyName?.trim() || convertPrompt?.contactName}</span> foi movido para{' '}
            <span className="font-semibold text-slate-700">{stageOfLead(activePipeline, convertPrompt?.status ?? '').label}</span>.
          </>
        }
      />
    </div>
  )
}

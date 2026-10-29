import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Upload, Kanban, List, Settings2, Gauge, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { ACTIVE_LEADS_DAYS, useAllLeads, useLeads } from '../hooks/useLeads'
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
import { QuestionnairePanel } from '../components/leads/QuestionnairePanel'
import { LeadBantMetrics } from '../components/leads/LeadBantMetrics'
import { WhatsappHub } from '../components/whatsapp/WhatsappHub'
import { buildLeadConversationMap, useWaConversations } from '../hooks/useWaConversations'
import { Button } from '../components/ui/Button'
import { PrivateMoney } from '../components/ui/PrivateData'
import { Modal } from '../components/ui/Modal'
import { Field, Select, Textarea } from '../components/ui/Field'
import { moveLeadStatus } from '../services/leadService'
import { ConvertLeadModal } from '../components/leads/ConvertLeadModal'
import { LEAD_LOST_REASON_LABEL, LEAD_SEGMENT_LABEL, LEAD_TEMPERATURE_LABEL, DEFAULT_PIPELINE_ID, isQuestionnaireLead, leadFormStage, leadPipelineId, leadTemperature, stageOfLead, type Lead, type LeadLostReason, type LeadSegment, type LeadTemperature } from '../types'

export function LeadsPage() {
  const { profile } = useAuth()
  // Ganhos e perdidos antigos só carregam quando alguém pede (economia de leituras).
  const [showOld, setShowOld] = useState(false)
  const { data: activeLeads } = useLeads()
  const { data: allLeads, loading: loadingAll } = useAllLeads(showOld)
  const leads = showOld && !loadingAll ? allLeads : activeLeads
  const { data: users } = useUsers()
  const { data: clients } = useClients()
  const { pipelines } = useLeadPipelines()
  const { data: leadForms } = useLeadForms()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [initialChamadaId, setInitialChamadaId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = usePersistedViewMode<'kanban' | 'list'>('leadsView', 'kanban')
  // Aba principal fica na URL (?aba=conversas) pra dar pra linkar direto na conversa.
  const TAB_IDS = ['pipeline', 'conversas', 'questionnaires', 'forms'] as const
  type MainTab = (typeof TAB_IDS)[number]
  const abaParam = searchParams.get('aba')
  const mainTab: MainTab = (TAB_IDS as readonly string[]).includes(abaParam ?? '') ? (abaParam as MainTab) : 'pipeline'
  const setMainTab = (t: MainTab) =>
    setSearchParams(
      (params) => {
        if (t === 'pipeline') params.delete('aba')
        else params.set('aba', t)
        if (t !== 'conversas') {
          params.delete('c')
          params.delete('wa')
        }
        return params
      },
      { replace: true }
    )
  const { data: waConvs } = useWaConversations()
  const waUnread = waConvs.filter((c) => c.unread > 0).length
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
  const convByLead = buildLeadConversationMap(leads, waConvs)
  const openLead = leads.find((l) => l.id === openLeadId) ?? allLeads.find((l) => l.id === openLeadId) ?? null

  // Deep link do toast do Copiloto ("Transcrição salva no lead" ao encerrar
  // uma chamada) — abre o LeadDrawer já na chamada certa (ver CopilotoPage).
  useEffect(() => {
    const leadId = searchParams.get('lead')
    if (!leadId) return
    setOpenLeadId(leadId)
    setInitialChamadaId(searchParams.get('chamada'))
    setSearchParams(
      (params) => {
        params.delete('lead')
        params.delete('chamada')
        return params
      },
      { replace: true }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // O lead do deep link pode ser um ganho/perdido antigo, fora da lista do
  // dia a dia (ver useLeads) — se não achar nos ativos, carrega o histórico.
  useEffect(() => {
    if (openLeadId && !activeLeads.some((l) => l.id === openLeadId) && !showOld) setShowOld(true)
  }, [openLeadId, activeLeads, showOld])

  // Respostas de formulário ficam na aba Questionários até alguém mandar para vendas.
  const salesLeads = leads.filter((l) => !isQuestionnaireLead(l))
  const newQuestionnaires = leads.filter((l) => isQuestionnaireLead(l) && leadFormStage(l) === 'new').length
  const allPipelineLeads = salesLeads.filter((l) => leadPipelineId(l) === activePipeline.id)
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
  const countByPipeline = (id: string) => salesLeads.filter((l) => leadPipelineId(l) === id).length
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

  const filtersActive = !!tempFilter || !!segmentFilter || !!needle
  const clearFilters = () => {
    setTempFilter('')
    setSegmentFilter('')
    setSearch('')
  }
  const hotCount = countByTemp('hot')
  // Valor estimado somado só das etapas abertas (sem ganhos e perdidos).
  const pipelineValue = allPipelineLeads.reduce((sum, l) => (stageKind(stageOfLead(activePipeline, l.status).id) === 'open' ? sum + (l.estimatedValue ?? 0) : sum), 0)
  const filterSelect =
    'h-9 rounded-lg border border-slate-200 bg-white pl-2.5 pr-7 text-sm font-medium text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-100'

  return (
    <div className={`flex flex-col ${mainTab === 'conversas' ? 'gap-3' : 'gap-4'}`}>
      {/* Cabeçalho: título à esquerda, ações principais à direita */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* No celular o nome da tela já está no topo: aqui fica só para o leitor de tela. */}
        <div className={`min-w-0 ${mainTab === 'conversas' ? 'sr-only' : 'sr-only md:not-sr-only'}`}>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900">Leads</h1>
          {mainTab !== 'conversas' && <p className="text-sm text-slate-500">Vendas, respostas dos questionários e formulários de captura</p>}
        </div>
        {mainTab === 'pipeline' && (
          <div className="grid w-full grid-cols-[auto_auto_1fr] items-center gap-2 md:flex md:w-auto">
            <Button variant="secondary" icon={<Gauge size={14} />} onClick={() => setBantOpen(true)} aria-label="Métricas BANT">
              <span className="hidden sm:inline">Métricas BANT</span>
            </Button>
            <Button variant="secondary" icon={<Upload size={14} />} onClick={() => setImporting(true)} aria-label="Importar leads">
              <span className="hidden sm:inline">Importar</span>
            </Button>
            <Button icon={<Plus size={14} />} onClick={() => setCreating(true)} className="justify-center">
              Novo lead
            </Button>
          </div>
        )}
      </div>

      {/* Abas principais */}
      <div role="tablist" aria-label="Seções de leads" className="flex w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 sm:w-fit">
        {([
          ['pipeline', 'Vendas', salesLeads.length],
          ['conversas', 'Conversas', waUnread],
          ['questionnaires', 'Questionários', newQuestionnaires],
          ['forms', 'Formulários', leadForms.length],
        ] as const).map(([t, label, count]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={mainTab === t}
            onClick={() => setMainTab(t)}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-[13px] font-semibold sm:gap-2 sm:px-4 sm:text-sm transition-all duration-150 sm:flex-none ${
              mainTab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
            {count > 0 && (
              <span
                className={`rounded-full px-1.5 text-[11px] font-bold ${
                  t === 'questionnaires' ? 'bg-brand-600 text-white' : t === 'conversas' ? 'bg-emerald-500 text-white' : mainTab === t ? 'bg-brand-50 text-brand-700' : 'bg-slate-200 text-slate-500'
                }`}
                aria-label={t === 'questionnaires' ? `${count} resposta${count === 1 ? '' : 's'} nova${count === 1 ? '' : 's'}` : t === 'conversas' ? `${count} conversa${count === 1 ? '' : 's'} não lida${count === 1 ? '' : 's'}` : `${count}`}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {mainTab === 'conversas' ? (
        <WhatsappHub onOpenLead={setOpenLeadId} />
      ) : mainTab === 'forms' ? (
        <LeadFormsPanel pipelines={pipelines} />
      ) : mainTab === 'questionnaires' ? (
        <QuestionnairePanel leads={leads} forms={leadForms} pipelines={pipelines} onOpenLead={setOpenLeadId} />
      ) : (
        <>
          {/* Barra do pipeline: qual quadro, filtros e modo de exibição num cartão só */}
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto" role="group" aria-label="Pipelines">
                {pipelines.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => choosePipeline(p.id)}
                    aria-pressed={p.id === activePipeline.id}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                      p.id === activePipeline.id ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {p.name}
                    <span className={`rounded-full px-1.5 text-[11px] font-bold ${p.id === activePipeline.id ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{countByPipeline(p.id)}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPipelineModal('new')}
                  title="Criar outro pipeline"
                  aria-label="Novo pipeline"
                  className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                >
                  <Plus size={14} /> <span className="hidden lg:inline">Novo pipeline</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPipelineModal('edit')}
                  title="Configurar este pipeline (etapas e campos)"
                  aria-label="Editar etapas e campos deste pipeline"
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                >
                  <Settings2 size={15} /> <span className="hidden xl:inline">Etapas e campos</span>
                </button>
                <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Modo de exibição">
                  {([
                    ['kanban', <Kanban key="k" size={15} />, 'Quadro'],
                    ['list', <List key="l" size={15} />, 'Lista'],
                  ] as const).map(([v, icon, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      aria-pressed={view === v}
                      title={`Ver em ${label.toLowerCase()}`}
                      className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors ${
                        view === v ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {icon}
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <div className="relative w-full min-w-[200px] sm:w-auto sm:flex-1 sm:max-w-xs">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nome, empresa, WhatsApp..."
                  aria-label="Buscar leads por nome, empresa ou WhatsApp"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm outline-none transition-colors focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <select
                value={tempFilter}
                onChange={(e) => setTempFilter(e.target.value as LeadTemperature | 'none' | '')}
                aria-label="Filtrar por temperatura do BANT"
                className={`${filterSelect} min-w-0 flex-1 sm:flex-none ${tempFilter ? 'border-brand-300 bg-brand-50 text-brand-700' : ''}`}
              >
                <option value="">Temperatura: todas ({allPipelineLeads.length})</option>
                {(['hot', 'warm', 'cold', 'disqualified'] as const).map((t) => (
                  <option key={t} value={t}>
                    {LEAD_TEMPERATURE_LABEL[t]} ({countByTemp(t)})
                  </option>
                ))}
                <option value="none">Sem avaliação ({countByTemp('none')})</option>
              </select>
              <select
                value={segmentFilter}
                onChange={(e) => setSegmentFilter(e.target.value as LeadSegment | 'none' | '')}
                aria-label="Filtrar por segmento"
                className={`${filterSelect} min-w-0 flex-1 sm:flex-none ${segmentFilter ? 'border-brand-300 bg-brand-50 text-brand-700' : ''}`}
              >
                <option value="">Segmento: todos</option>
                {(['cleaning_services', 'cleaning_products'] as const).map((sg) => (
                  <option key={sg} value={sg}>
                    {LEAD_SEGMENT_LABEL[sg]} ({countBySegment(sg)})
                  </option>
                ))}
                <option value="none">Sem segmento ({countBySegment('none')})</option>
              </select>
              {filtersActive && (
                <button type="button" onClick={clearFilters} className="h-9 rounded-lg px-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                  Limpar filtros
                </button>
              )}
              <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 sm:ml-auto sm:w-auto" aria-live="polite">
                <span>
                  <strong className="font-semibold text-slate-800">{pipelineLeads.length}</strong> {filtersActive ? `de ${allPipelineLeads.length} ` : ''}lead{pipelineLeads.length === 1 ? '' : 's'}
                </span>
                {hotCount > 0 && (
                  <span>
                    <strong className="font-semibold text-slate-800">{hotCount}</strong> quente{hotCount === 1 ? '' : 's'}
                  </span>
                )}
                {pipelineValue > 0 && (
                  <span title="Soma do valor estimado dos leads em etapas abertas">
                    Em aberto:{' '}
                    <strong className="font-semibold text-slate-800">
                      <PrivateMoney value={pipelineValue} />
                    </strong>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowOld((v) => !v)}
                  aria-pressed={showOld}
                  title={`Ganhos e perdidos de mais de ${ACTIVE_LEADS_DAYS} dias ficam ocultos para economizar leituras`}
                  className={`rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${showOld ? 'bg-slate-800 text-white' : 'text-brand-600 hover:bg-brand-50'}`}
                >
                  {showOld ? (loadingAll ? 'Carregando antigos...' : 'Ocultar antigos') : 'Mostrar antigos'}
                </button>
              </div>
            </div>
          </div>

          {view === 'kanban' ? (
            // Altura da tela: cada coluna rola por dentro.
            <div className="h-[calc(100dvh-210px)] min-h-[420px] md:h-[calc(100vh-130px)]">
              <KanbanBoard<Lead, string>
                key={activePipeline.id}
                columns={columns}
                items={pipelineLeads}
                getStatus={(l) => stageOfLead(activePipeline, l.status).id}
                renderCard={(l) => (
                  <LeadCard lead={l} assignee={l.assignedTo ? userMap[l.assignedTo] : undefined} onClick={() => setOpenLeadId(l.id)} fields={activePipeline.fields} formTag={formTagOf(l)} existingClientName={existingClientOf(l)} wa={convByLead.get(l.id)} />
                )}
                onMove={handleMove}
                pageSize={30}
                compact
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
      <LeadDrawer
        key={`lead-${openLeadId ?? 'none'}`}
        lead={openLead}
        initialChamadaId={initialChamadaId}
        onClose={() => {
          setOpenLeadId(null)
          setInitialChamadaId(null)
        }}
      />

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

import { useEffect, useState } from 'react'
import { WhatsAppLogo } from '../components/ui/BrandLogos'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Upload, Kanban, List, Settings2, Gauge, Search, Megaphone, SlidersHorizontal, History, ClipboardList } from 'lucide-react'
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
import { buildLeadConversationMap, useWaConversations, useWaTemplates } from '../hooks/useWaConversations'
import { BroadcastModal } from '../components/whatsapp/WaBroadcast'
import { Button } from '../components/ui/Button'
import { ActionsMenu } from '../components/ui/ActionsMenu'
import { PrivateMoney } from '../components/ui/PrivateData'
import { Modal } from '../components/ui/Modal'
import { Field, Select, Textarea } from '../components/ui/Field'
import { moveLeadStatus } from '../services/leadService'
import { ConvertLeadModal } from '../components/leads/ConvertLeadModal'
import { LEAD_LOST_REASON_LABEL, LEAD_SEGMENT_LABEL, LEAD_SOURCE_LABEL, LEAD_TEMPERATURE_LABEL, DEFAULT_PIPELINE_ID, isQuestionnaireLead, leadFormStage, leadPipelineId, leadTemperature, stageOfLead, type Lead, type LeadLostReason, type LeadSegment, type LeadSource, type LeadTemperature } from '../types'

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
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [tempFilter, setTempFilter] = useState<LeadTemperature | 'none' | ''>('')
  // Filtro por segmento ('' = todos, 'none' = sem segmento definido).
  const [segmentFilter, setSegmentFilter] = useState<LeadSegment | 'none' | ''>('')
  // Filtros da barra: etapa (id da etapa do pipeline aberto), origem
  // ('form:<id>' ou 'src:<source>') e responsável (id do usuário ou 'none').
  const [stageFilter, setStageFilter] = useState('')
  const [originFilter, setOriginFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  // Cada pipeline tem as próprias etapas: trocar de pipeline zera o filtro de etapa.
  useEffect(() => setStageFilter(''), [activePipeline.id])

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
  const originOf = (l: Lead) => (l.sourceFormId ? `form:${l.sourceFormId}` : `src:${l.source}`)
  const originLabel = (key: string) =>
    key.startsWith('form:') ? formTags[key.slice(5)]?.name ?? 'Formulário removido' : LEAD_SOURCE_LABEL[key.slice(4) as LeadSource] ?? 'Outro'
  const ownerOf = (l: Lead) => l.assignedTo || 'none'
  const stageIdOf = (l: Lead) => stageOfLead(activePipeline, l.status).id
  const pipelineLeads = allPipelineLeads.filter(
    (l) =>
      (!tempFilter || tempOf(l) === tempFilter) &&
      (!segmentFilter || segmentOf(l) === segmentFilter) &&
      (!stageFilter || stageIdOf(l) === stageFilter) &&
      (!originFilter || originOf(l) === originFilter) &&
      (!ownerFilter || ownerOf(l) === ownerFilter) &&
      matchesSearch(l)
  )
  const countBy = (fn: (l: Lead) => string) => {
    const out: Record<string, number> = {}
    for (const l of allPipelineLeads) out[fn(l)] = (out[fn(l)] ?? 0) + 1
    return out
  }
  const originCounts = countBy(originOf)
  const ownerCounts = countBy(ownerOf)
  const originOptions = Object.keys(originCounts).sort((a, b) => originLabel(a).localeCompare(originLabel(b), 'pt-BR'))
  const ownerOptions = Object.keys(ownerCounts)
    .filter((k) => k !== 'none')
    .sort((a, b) => (userMap[a]?.name ?? '').localeCompare(userMap[b]?.name ?? '', 'pt-BR'))
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

  const activeFilterCount = [tempFilter, segmentFilter, stageFilter, originFilter, ownerFilter].filter(Boolean).length
  const filtersActive = !!tempFilter || !!segmentFilter || !!stageFilter || !!originFilter || !!ownerFilter || !!needle
  const clearFilters = () => {
    setTempFilter('')
    setSegmentFilter('')
    setStageFilter('')
    setOriginFilter('')
    setOwnerFilter('')
    setSearch('')
  }
  const hotCount = countByTemp('hot')
  // Valor estimado somado só das etapas abertas (sem ganhos e perdidos).
  const pipelineValue = allPipelineLeads.reduce((sum, l) => (stageKind(stageOfLead(activePipeline, l.status).id) === 'open' ? sum + (l.estimatedValue ?? 0) : sum), 0)
  const filterSelect =
    'h-9 rounded-lg border border-slate-200 bg-white pl-2.5 pr-7 text-sm font-medium text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-100'

  return (
    <div className={`flex flex-col ${mainTab === 'conversas' ? 'gap-3' : 'gap-4'}`}>
      {/* Cabeçalho: título e funil à esquerda; busca, Novo lead e o menu ⋮ à direita */}
      <div className={mainTab === 'conversas' ? 'sr-only' : 'flex flex-wrap items-center justify-between gap-3'}>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {/* No celular o nome da tela já está no topo: aqui fica só para o leitor de tela. */}
          <h1 className={`text-[26px] font-bold leading-tight tracking-tight text-slate-900 ${mainTab === 'conversas' ? '' : 'sr-only md:not-sr-only'}`}>Leads</h1>
          {mainTab === 'pipeline' && pipelines.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-slate-500">
              Funil
              <select
                value={activePipeline.id}
                onChange={(e) => choosePipeline(e.target.value)}
                className="h-[38px] rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm font-semibold text-slate-800 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({countByPipeline(p.id)})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {mainTab !== 'conversas' && (
          <div className="flex w-full items-center gap-2 md:w-auto">
            {mainTab === 'pipeline' && (
              <div className="relative min-w-0 flex-1 md:w-64 md:flex-none">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nome, empresa, WhatsApp..."
                  aria-label="Buscar leads por nome, empresa ou WhatsApp"
                  className="h-[38px] w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none transition-colors focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                />
              </div>
            )}
            <Button icon={<Plus size={14} />} onClick={() => setCreating(true)} className="h-[38px] justify-center">
              Novo lead
            </Button>
            <ActionsMenu
              label="Mais ações de leads"
              items={[
                ...(mainTab === 'pipeline'
                  ? [
                      { label: 'Disparar WhatsApp', hint: 'Mensagem para vários leads deste funil', icon: <Megaphone size={15} />, onSelect: () => setBroadcastOpen(true) },
                      { label: 'Importar leads', hint: 'Planilha ou lista', icon: <Upload size={15} />, onSelect: () => setImporting(true) },
                      { label: 'Métricas BANT', icon: <Gauge size={15} />, onSelect: () => setBantOpen(true) },
                      { label: 'Etapas e campos deste funil', icon: <Settings2 size={15} />, onSelect: () => setPipelineModal('edit') },
                      { label: 'Novo funil', icon: <Plus size={15} />, onSelect: () => setPipelineModal('new') },
                      {
                        label: showOld ? 'Ocultar ganhos e perdidos antigos' : 'Mostrar ganhos e perdidos antigos',
                        hint: `Mais de ${ACTIVE_LEADS_DAYS} dias`,
                        icon: <History size={15} />,
                        onSelect: () => setShowOld((v) => !v),
                      },
                    ]
                  : []),
                { label: 'Formulários de captura', hint: `${leadForms.length} formulário${leadForms.length === 1 ? '' : 's'}`, icon: <ClipboardList size={15} />, onSelect: () => setMainTab('forms') },
              ]}
            />
          </div>
        )}
      </div>

      {/* Abas principais */}
      <div role="tablist" aria-label="Seções de leads" className="flex w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 sm:w-fit">
        {([
          ['pipeline', 'Pipeline', salesLeads.length],
          ['conversas', 'Conversas', waUnread],
          ['questionnaires', 'Questionários', newQuestionnaires],
          ['forms', 'Formulários', leadForms.length],
        ] as const).filter(([t]) => t !== 'forms' || mainTab === 'forms').map(([t, label, count]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={mainTab === t}
            onClick={() => setMainTab(t)}
            title={t === 'conversas' ? 'Conversas do WhatsApp' : undefined}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-[13px] font-semibold sm:gap-2 sm:px-4 sm:text-sm transition-all duration-150 sm:flex-none ${
              mainTab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'conversas' ? (
              <>
                <WhatsAppLogo size={19} />
                <span className="sr-only">Conversas do WhatsApp</span>
              </>
            ) : (
              label
            )}
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
          {/* Linha de resumo: total, filtros e modo de exibição */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500" aria-live="polite">
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
              {showOld && <span className="text-xs">{loadingAll ? 'Carregando antigos...' : 'Mostrando antigos'}</span>}
            </p>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              aria-controls="leads-filters"
              className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
                filtersOpen || activeFilterCount > 0 ? 'border-brand-600 bg-brand-50 text-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <SlidersHorizontal size={14} aria-hidden="true" /> Filtros
              {activeFilterCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">{activeFilterCount}</span>}
            </button>
            {filtersActive && (
              <button type="button" onClick={clearFilters} className="h-9 rounded-lg px-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                Limpar
              </button>
            )}
            <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Modo de exibição">
              {([
                ['kanban', <Kanban key="k" size={15} aria-hidden="true" />, 'Quadro'],
                ['list', <List key="l" size={15} aria-hidden="true" />, 'Lista'],
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

          {filtersOpen && (
            <div id="leads-filters" className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
              <select
                value={tempFilter}
                onChange={(e) => setTempFilter(e.target.value as LeadTemperature | 'none' | '')}
                aria-label="Filtrar por temperatura do BANT"
                className={`${filterSelect} ${tempFilter ? 'border-brand-300 bg-brand-50 text-brand-700' : ''}`}
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
                className={`${filterSelect} ${segmentFilter ? 'border-brand-300 bg-brand-50 text-brand-700' : ''}`}
              >
                <option value="">Segmento: todos</option>
                {(['cleaning_services', 'cleaning_products'] as const).map((sg) => (
                  <option key={sg} value={sg}>
                    {LEAD_SEGMENT_LABEL[sg]} ({countBySegment(sg)})
                  </option>
                ))}
                <option value="none">Sem segmento ({countBySegment('none')})</option>
              </select>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                aria-label="Filtrar por etapa"
                className={`${filterSelect} ${stageFilter ? 'border-brand-300 bg-brand-50 text-brand-700' : ''}`}
              >
                <option value="">Etapa: todas</option>
                {activePipeline.stages.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.label} ({leadCountByStage[st.id] ?? 0})
                  </option>
                ))}
              </select>
              <select
                value={originFilter}
                onChange={(e) => setOriginFilter(e.target.value)}
                aria-label="Filtrar por origem do lead (formulário ou canal)"
                className={`${filterSelect} ${originFilter ? 'border-brand-300 bg-brand-50 text-brand-700' : ''}`}
              >
                <option value="">Origem: todas</option>
                {originOptions.map((k) => (
                  <option key={k} value={k}>
                    {originLabel(k)} ({originCounts[k]})
                  </option>
                ))}
              </select>
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                aria-label="Filtrar por responsável"
                className={`${filterSelect} ${ownerFilter ? 'border-brand-300 bg-brand-50 text-brand-700' : ''}`}
              >
                <option value="">Responsável: todos</option>
                {ownerOptions.map((oid) => (
                  <option key={oid} value={oid}>
                    {userMap[oid]?.name ?? 'Usuário removido'} ({ownerCounts[oid]})
                  </option>
                ))}
                <option value="none">Sem responsável ({ownerCounts.none ?? 0})</option>
              </select>
            </div>
          )}

          {view === 'kanban' ? (
            // Altura da tela: cada coluna rola por dentro.
            <div className="h-[calc(100dvh-210px)] min-h-[420px] md:h-[calc(100vh-130px)]">
              <KanbanBoard<Lead, string>
                key={activePipeline.id}
                columns={columns}
                items={pipelineLeads}
                getStatus={(l) => stageOfLead(activePipeline, l.status).id}
                renderCard={(l) => (
                  <LeadCard openStage={stageKind(stageOfLead(activePipeline, l.status).id) === 'open'} lead={l} assignee={l.assignedTo ? userMap[l.assignedTo] : undefined} onClick={() => setOpenLeadId(l.id)} fields={activePipeline.fields} formTag={formTagOf(l)} existingClientName={existingClientOf(l)} wa={convByLead.get(l.id)} />
                )}
                onMove={handleMove}
                pageSize={30}
                compact
              />
            </div>
          ) : (
            <LeadsListView key={`${activePipeline.id}-${tempFilter}-${segmentFilter}-${stageFilter}-${originFilter}-${ownerFilter}-${search}`} leads={pipelineLeads} userMap={userMap} onOpenLead={setOpenLeadId} pipelines={pipelines} formTagOf={formTagOf} />
          )}
        </>
      )}

      {broadcastOpen && <LeadsBroadcast pipelineId={activePipeline.id} onClose={() => setBroadcastOpen(false)} />}
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

/** Modelos só carregam quando abre o disparo. */
function LeadsBroadcast({ pipelineId, onClose }: { pipelineId: string; onClose: () => void }) {
  const templates = useWaTemplates()
  return <BroadcastModal open onClose={onClose} templates={templates} initialPipelineId={pipelineId} />
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { isPast, isToday, isWithinInterval, addDays, differenceInDays, isSameDay, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useAuth } from '../context/AuthContext'
import { useAllTasks } from '../hooks/useTasks'
import { useAllContents } from '../hooks/useContents'
import { useClients } from '../hooks/useClients'
import { useAssigneeMap } from '../hooks/useAssignees'
import { useAllClientSuccessEvaluations } from '../hooks/useClientSuccessEvaluations'
import { latestClientSuccessByClient } from '../utils/clientSuccessLatest'
import { useUserDashboardLayout } from '../hooks/useUserDashboardLayout'
import { DashboardEmptyState } from '../components/dashboard/DashboardEmptyState'
import { MotivationalQuoteBanner } from '../components/dashboard/MotivationalQuoteBanner'
import { EditableWidgetFrame } from '../components/dashboard/EditableWidgetFrame'
import { DashboardEditToolbar } from '../components/dashboard/DashboardEditToolbar'
import { WIDGET_LABEL, ALL_WIDGET_IDS, renderDashboardWidget } from '../components/dashboard/dashboardWidgetCatalog'
import type { DashboardWidgetSharedData, ClientHealth, ClientHealthReason } from '../components/dashboard/dashboardWidgetTypes'
import { useRecentOptimizations } from '../hooks/useOptimizations'
import { hasContractedPaidTraffic } from '../utils/clientServices'
import type { ClientSuccessTier } from '../types/clientSuccess'
import { Button } from '../components/ui/Button'
import { TaskDrawer } from '../components/tasks/TaskDrawer'
import { TaskFormModal } from '../components/tasks/TaskFormModal'
import { ContentDrawer } from '../components/content/ContentDrawer'
import { ContentFormModal } from '../components/content/ContentFormModal'
import { getClientOwnerIds } from '../types/client'
import { isAutoRecurringTaskTitle } from '../services/clientWorkflowTemplates'
import { saveUserDashboard } from '../services/userDashboardService'
import { getDefaultLayout } from '../utils/dashboardDefaults'
import type { Task } from '../types/task'
import type { Client } from '../types/client'
import type { DashboardWidgetConfig, DashboardWidgetId } from '../types/dashboardLayout'
import { useTaskVisibility, filterVisibleTasks } from '../utils/taskVisibility'

const DASHBOARD_KEY = 'operacional'
const SCOPE_KEY = 'arrowshot-operacional-escopo'

/** Só estes ficam escondidos atrás do "tudo em dia" (ver DashboardEmptyState)
 *  — igual ao comportamento original: Próximas publicações, Resumo por
 *  cliente e os widgets que buscam os próprios dados nunca eram escondidos
 *  por essa checagem. */
const BUCKET_GATED_IDS = new Set<DashboardWidgetId>([
  'tarefas_atrasadas',
  'tarefas_hoje',
  'proximas_7dias',
  'em_producao',
  'aguardando_aprovacao',
  'conteudos_aprovados',
])

/** Saúde do cliente somando os sinais que o CRM tem. Cada motivo tem um peso
 *  (vermelho ou amarelo); a cor final é a do pior motivo.
 *  - Tarefas: 2+ atrasadas ou 1 urgente/alta atrasada = vermelho; 1 atrasada
 *    ou checklist parado há 3+ dias = amarelo.
 *  - Sucesso do Cliente (última avaliação): "risco" = vermelho, "atenção" = amarelo.
 *  - Tráfego sem otimização registrada: 14+ dias = vermelho, 7+ = amarelo
 *    (cliente com menos de 14 dias de casa não conta).
 *  - Contrato pausado = amarelo. */
function getClientHealth(
  client: Client,
  tasks: Task[],
  successTier: ClientSuccessTier | undefined,
  lastOptimizationMs: number | undefined
): { health: ClientHealth; reasons: ClientHealthReason[] } {
  const reasons: ClientHealthReason[] = []
  const openTasks = tasks.filter((t) => t.clientId === client.id && t.status !== 'done')
  const overdue = openTasks.filter((t) => t.dueDate && isPast(t.dueDate.toDate()) && !isToday(t.dueDate.toDate()))
  const overdueHighPriority = overdue.some((t) => t.priority === 'high' || t.priority === 'urgent')
  const staleChecklist = openTasks.some((t) => {
    if (!t.checklist?.length || t.checklist.every((i) => i.done)) return false
    return differenceInDays(new Date(), t.createdAt.toDate()) > 3
  })

  if (overdue.length >= 2 || overdueHighPriority)
    reasons.push({ level: 'red', text: overdue.length >= 2 ? `${overdue.length} tarefas atrasadas` : 'Tarefa urgente atrasada' })
  else if (overdue.length === 1) reasons.push({ level: 'yellow', text: '1 tarefa atrasada' })
  else if (staleChecklist) reasons.push({ level: 'yellow', text: 'Checklist parado há 3+ dias' })

  if (successTier === 'risco') reasons.push({ level: 'red', text: 'Avaliação: em risco' })
  else if (successTier === 'atencao') reasons.push({ level: 'yellow', text: 'Avaliação: atenção' })

  const since = client.contractStartDate?.toDate?.() ?? client.createdAt?.toDate?.()
  const isNew = since ? differenceInDays(new Date(), since) < 14 : false
  if (hasContractedPaidTraffic(client) && client.status === 'active' && !isNew) {
    const days = lastOptimizationMs ? differenceInDays(new Date(), new Date(lastOptimizationMs)) : null
    if (days == null || days >= 14) reasons.push({ level: 'red', text: 'Sem otimização há 14+ dias' })
    else if (days >= 7) reasons.push({ level: 'yellow', text: `Sem otimização há ${days} dias` })
  }

  if (client.status === 'paused') reasons.push({ level: 'yellow', text: 'Contrato pausado' })

  reasons.sort((a, b) => Number(a.level === 'yellow') - Number(b.level === 'yellow'))
  const health: ClientHealth = reasons.some((r) => r.level === 'red') ? 'red' : reasons.length > 0 ? 'yellow' : 'green'
  return { health, reasons }
}

function clientServiceLabel(client: Client) {
  const traffic = client.modules?.paidTraffic
  const social = client.modules?.socialMedia
  if (traffic && social) return 'Ambos'
  if (traffic) return 'Tráfego'
  if (social) return 'Social Mídia'
  return '—'
}

export function OperationalDashboard() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: tasks } = useAllTasks()
  const { data: allContents } = useAllContents()
  const { data: clients } = useClients()
  const assigneeMap = useAssigneeMap()
  const { data: clientSuccessEvaluations } = useAllClientSuccessEvaluations()
  const latestClientSuccess = useMemo(() => latestClientSuccessByClient(clientSuccessEvaluations), [clientSuccessEvaluations])
  const { data: recentOptimizations } = useRecentOptimizations(30)
  const { canSeeAllTasks, viewerId } = useTaskVisibility()
  // "Só meus" x "Equipe": filtra tarefas, conteúdos e o resumo por cliente. Fica salvo no navegador.
  const [scope, setScope] = useState<'mine' | 'team'>(() => {
    try {
      return localStorage.getItem(SCOPE_KEY) === 'mine' ? 'mine' : 'team'
    } catch {
      return 'team'
    }
  })
  const changeScope = (next: 'mine' | 'team') => {
    setScope(next)
    try {
      localStorage.setItem(SCOPE_KEY, next)
    } catch {
      /* navegador sem storage: vale só nesta sessão */
    }
  }
  const mineOnly = scope === 'mine'
  const visibleTasks = useMemo(
    () => filterVisibleTasks(tasks, canSeeAllTasks && !mineOnly, viewerId),
    [tasks, canSeeAllTasks, viewerId, mineOnly]
  )
  const contents = useMemo(
    () => (mineOnly && viewerId ? allContents.filter((c) => c.assignedTo === viewerId) : allContents),
    [allContents, mineOnly, viewerId]
  )
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [openContentId, setOpenContentId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  // Deep link de uma notificação de tarefa (/?task=id) — abre o drawer e
  // limpa o parâmetro. Não há mais página de Tarefas dedicada.
  useEffect(() => {
    const id = searchParams.get('task')
    if (!id) return
    setOpenTaskId(id)
    setSearchParams(
      (params) => {
        params.delete('task')
        return params
      },
      { replace: true }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  const [expanded, setExpanded] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [contentModalOpen, setContentModalOpen] = useState(false)
  const openTask = visibleTasks.find((t) => t.id === openTaskId) ?? null
  const openContent = allContents.find((c) => c.id === openContentId) ?? null

  const buckets = useMemo(() => {
    const openTasks = visibleTasks.filter((t) => t.status !== 'done')
    // Tarefa manual sem prazo definido também entra aqui — senão ela nunca
    // aparece em nenhum bucket (não é "atrasada" nem "próxima") e se perde
    // de vista. Tarefa AUTOMÁTICA sem prazo fica de fora — são as
    // recorrentes/onboarding de clientes antigos que nunca ganharam data e
    // entulhavam a lista. Checa tanto `workflowStep` (tarefas novas) quanto o
    // título (tarefas antigas, criadas antes desse campo existir no Firestore).
    const today = openTasks.filter(
      (t) =>
        (!t.dueDate && !t.workflowStep && !isAutoRecurringTaskTitle(t.title)) ||
        (t.dueDate && isToday(t.dueDate.toDate()))
    )
    const overdue = openTasks
      .filter((t) => t.dueDate && isPast(t.dueDate.toDate()) && !isToday(t.dueDate.toDate()))
      .sort((a, b) => a.dueDate!.toMillis() - b.dueDate!.toMillis())
    const upcoming = openTasks
      .filter((t) => t.dueDate && isWithinInterval(t.dueDate.toDate(), { start: addDays(new Date(), 1), end: addDays(new Date(), 7) }))
      .sort((a, b) => a.dueDate!.toMillis() - b.dueDate!.toMillis())

    // Cada bucket puxa exatamente uma coluna do board de Social Media.
    const inProduction = contents.filter((c) => c.status === 'production') // EM PRODUÇÃO
    const waitingApproval = contents
      .filter((c) => c.status === 'waiting_client') // AGUARDANDO CLIENTE
      .sort((a, b) => a.updatedAt.toMillis() - b.updatedAt.toMillis())
    const approved = contents.filter((c) => c.status === 'approved') // APROVADO
    const nextPublications = contents
      .filter((c) => c.status === 'scheduled' && c.scheduledDate) // AGENDADO
      .sort((a, b) => a.scheduledDate!.toMillis() - b.scheduledDate!.toMillis())
      .slice(0, 6)

    return { today, overdue, upcoming, inProduction, waitingApproval, approved, nextPublications }
  }, [visibleTasks, contents])

  const allZero =
    buckets.today.length === 0 &&
    buckets.overdue.length === 0 &&
    buckets.upcoming.length === 0 &&
    buckets.inProduction.length === 0 &&
    buckets.waitingApproval.length === 0 &&
    buckets.approved.length === 0

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])

  const upcomingGroups = useMemo(() => {
    const groups: { date: Date; tasks: Task[] }[] = []
    for (const t of buckets.upcoming) {
      const due = t.dueDate!.toDate()
      const last = groups[groups.length - 1]
      if (last && isSameDay(last.date, due)) last.tasks.push(t)
      else groups.push({ date: due, tasks: [t] })
    }
    return groups
  }, [buckets.upcoming])

  const clientSummary = useMemo(() => {
    const lastOptByClient = new Map<string, number>()
    for (const o of recentOptimizations) {
      const t = o.date?.toMillis?.() ?? 0
      if (t > (lastOptByClient.get(o.clientId) ?? 0)) lastOptByClient.set(o.clientId, t)
    }
    return clients
      .filter((c) => c.status === 'active' || c.status === 'paused')
      .filter((c) => !mineOnly || !viewerId || getClientOwnerIds(c).includes(viewerId))
      .map((c) => {
        const nextTask = tasks
          .filter((t) => t.clientId === c.id && t.status !== 'done' && t.dueDate)
          .sort((a, b) => a.dueDate!.toMillis() - b.dueDate!.toMillis())[0]
        const ownerId = getClientOwnerIds(c)[0]
        const successTier = latestClientSuccess[c.id]?.tier
        const { health, reasons } = getClientHealth(c, tasks, successTier, lastOptByClient.get(c.id))
        return {
          client: c,
          health,
          reasons,
          service: clientServiceLabel(c),
          ownerName: ownerId ? (assigneeMap[ownerId]?.name ?? '—') : '—',
          nextTask,
          successTier,
        }
      })
      .sort((a, b) => {
        const rank: Record<ClientHealth, number> = { red: 0, yellow: 1, green: 2 }
        return rank[a.health] - rank[b.health] || b.reasons.length - a.reasons.length || a.client.companyName.localeCompare(b.client.companyName)
      })
  }, [clients, tasks, assigneeMap, latestClientSuccess, recentOptimizations, mineOnly, viewerId])

  // ---------------- personalização do layout ----------------
  const { widgets: savedWidgets } = useUserDashboardLayout(profile, DASHBOARD_KEY)
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<DashboardWidgetConfig[]>([])
  const [savingLayout, setSavingLayout] = useState(false)

  const activeWidgets = editMode ? draft : savedWidgets

  const enterEditMode = () => {
    setDraft(savedWidgets)
    setEditMode(true)
  }

  const handleSaveLayout = async () => {
    if (!profile) return
    setSavingLayout(true)
    try {
      await saveUserDashboard(profile.id, DASHBOARD_KEY, { widgets: draft }, profile.id)
      toast.success('Layout salvo')
      setEditMode(false)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar layout')
    } finally {
      setSavingLayout(false)
    }
  }

  const handleRestoreDefault = () => setDraft(getDefaultLayout(profile))

  const handleRemoveWidget = (id: DashboardWidgetId) =>
    setDraft((d) => d.map((w) => (w.id === id ? { ...w, visible: false } : w)))

  const handleToggleWidth = (id: DashboardWidgetId) =>
    setDraft((d) => d.map((w) => (w.id === id ? { ...w, width: w.width === 'full' ? 'half' : 'full' } : w)))

  const handleAddWidget = (id: DashboardWidgetId) =>
    setDraft((d) => {
      const existing = d.find((w) => w.id === id)
      if (existing) return d.map((w) => (w.id === id ? { ...w, visible: true } : w))
      const maxOrder = d.reduce((max, w) => Math.max(max, w.order), 0)
      return [...d, { id, visible: true, order: maxOrder + 1, width: 'full' }]
    })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setDraft((d) => {
      const visible = d.filter((w) => w.visible).sort((a, b) => a.order - b.order)
      const hidden = d.filter((w) => !w.visible)
      const oldIndex = visible.findIndex((w) => w.id === active.id)
      const newIndex = visible.findIndex((w) => w.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return d
      const reordered = arrayMove(visible, oldIndex, newIndex).map((w, i) => ({ ...w, order: i + 1 }))
      return [...reordered, ...hidden]
    })
  }

  const todayLabel = useMemo(() => {
    const s = format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }, [])

  const visibleSorted = useMemo(() => activeWidgets.filter((w) => w.visible).sort((a, b) => a.order - b.order), [activeWidgets])
  const hiddenWidgetIds = useMemo(() => {
    const visibleIds = new Set(draft.filter((w) => w.visible).map((w) => w.id))
    return ALL_WIDGET_IDS.filter((id) => !visibleIds.has(id))
  }, [draft])

  const hasBucketGatedVisible = visibleSorted.some((w) => BUCKET_GATED_IDS.has(w.id))
  const collapsed = allZero && !expanded && !editMode && hasBucketGatedVisible
  const gridWidgets = collapsed ? visibleSorted.filter((w) => !BUCKET_GATED_IDS.has(w.id)) : visibleSorted

  const sharedData: DashboardWidgetSharedData = {
    clients,
    clientMap,
    buckets,
    upcomingGroups,
    clientSummary,
    assigneeMap,
    canSeeAllTasks,
    onOpenTask: setOpenTaskId,
    onOpenContent: setOpenContentId,
    onAddTask: () => setTaskModalOpen(true),
    onAddContent: () => setContentModalOpen(true),
    onNavigateClient: (id) => navigate(`/clientes/${id}`),
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-slate-900">Operacional</h1>
          <p className="text-[15px] text-[#64748B]">Visão geral do que precisa da sua atenção hoje.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[14px] text-slate-400">{todayLabel}</p>
          <div role="radiogroup" aria-label="Mostrar" className="flex rounded-lg bg-slate-100 p-0.5 text-[13px] font-medium">
            {(
              [
                ['mine', 'Só meus'],
                ['team', 'Equipe'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={scope === value}
                onClick={() => changeScope(value)}
                title={value === 'mine' ? 'Só suas tarefas, seus conteúdos e seus clientes' : 'Tudo que você tem acesso'}
                className={`rounded-md px-3 py-1 transition-colors ${
                  scope === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {!editMode && (
            <Button
              variant="secondary"
              onClick={enterEditMode}
              className="border-brand-300 bg-transparent text-brand-600 hover:bg-brand-50"
            >
              ✏️ Personalizar dashboard
            </Button>
          )}
        </div>
      </div>

      <MotivationalQuoteBanner />

      {editMode && (
        <DashboardEditToolbar
          availableWidgetIds={hiddenWidgetIds}
          onAddWidget={handleAddWidget}
          onSave={handleSaveLayout}
          onCancel={() => setEditMode(false)}
          onRestoreDefault={handleRestoreDefault}
          saving={savingLayout}
        />
      )}

      {collapsed && (
        <DashboardEmptyState
          counts={{
            today: buckets.today.length,
            overdue: buckets.overdue.length,
            upcoming: buckets.upcoming.length,
            inProduction: buckets.inProduction.length,
            waitingApproval: buckets.waitingApproval.length,
            approved: buckets.approved.length,
          }}
          onExpand={() => setExpanded(true)}
        />
      )}
      {allZero && expanded && !editMode && hasBucketGatedVisible && (
        <button onClick={() => setExpanded(false)} className="self-start text-xs font-medium text-slate-400 hover:text-brand-500">
          ← Recolher
        </button>
      )}

      {editMode ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={gridWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {gridWidgets.map((w) => (
                <div key={w.id} className={w.width === 'full' ? 'lg:col-span-2' : 'lg:col-span-1'}>
                  <EditableWidgetFrame
                    id={w.id}
                    label={WIDGET_LABEL[w.id]}
                    width={w.width}
                    onRemove={() => handleRemoveWidget(w.id)}
                    onToggleWidth={() => handleToggleWidth(w.id)}
                  >
                    {renderDashboardWidget(w.id, sharedData)}
                  </EditableWidgetFrame>
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
          {gridWidgets.map((w) => (
            <div key={w.id} className={`h-full ${w.width === 'full' ? 'lg:col-span-2' : 'lg:col-span-1'}`}>
              {renderDashboardWidget(w.id, sharedData)}
            </div>
          ))}
        </div>
      )}

      <TaskDrawer key={`task-${openTaskId ?? 'none'}`} task={openTask} onClose={() => setOpenTaskId(null)} />
      <ContentDrawer key={`content-${openContentId ?? 'none'}`} content={openContent} onClose={() => setOpenContentId(null)} />
      <TaskFormModal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} />
      <ContentFormModal open={contentModalOpen} onClose={() => setContentModalOpen(false)} />
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { isPast, isToday, isWithinInterval, addDays, differenceInDays, isSameDay } from 'date-fns'
import { Pencil } from 'lucide-react'
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
import { EditableWidgetFrame } from '../components/dashboard/EditableWidgetFrame'
import { DashboardEditToolbar } from '../components/dashboard/DashboardEditToolbar'
import { WIDGET_LABEL, ALL_WIDGET_IDS, renderDashboardWidget } from '../components/dashboard/dashboardWidgetCatalog'
import type { DashboardWidgetSharedData, ClientHealth } from '../components/dashboard/dashboardWidgetTypes'
import { Button } from '../components/ui/Button'
import { TaskDrawer } from '../components/tasks/TaskDrawer'
import { TaskFormModal } from '../components/tasks/TaskFormModal'
import { ContentDrawer } from '../components/content/ContentDrawer'
import { ContentFormModal } from '../components/content/ContentFormModal'
import { getClientOwnerIds } from '../types/client'
import { saveUserDashboard } from '../services/userDashboardService'
import { getDefaultLayout } from '../utils/dashboardDefaults'
import type { Task } from '../types/task'
import type { Client } from '../types/client'
import type { DashboardWidgetConfig, DashboardWidgetId } from '../types/dashboardLayout'
import { useTaskVisibility, filterVisibleTasks } from '../utils/taskVisibility'

const DASHBOARD_KEY = 'operacional'

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

/** Vermelho: 2+ tarefas atrasadas, ou 1 atrasada de prioridade alta/urgente.
 *  Amarelo: 1 tarefa atrasada, ou algum checklist incompleto há mais de 3 dias.
 *  Verde: nenhuma das condições acima. */
function getClientHealth(clientId: string, tasks: Task[]): ClientHealth {
  const openTasks = tasks.filter((t) => t.clientId === clientId && t.status !== 'done')
  const overdue = openTasks.filter((t) => t.dueDate && isPast(t.dueDate.toDate()) && !isToday(t.dueDate.toDate()))
  const overdueHighPriority = overdue.some((t) => t.priority === 'high' || t.priority === 'urgent')
  const staleChecklist = openTasks.some((t) => {
    if (!t.checklist?.length || t.checklist.every((i) => i.done)) return false
    return differenceInDays(new Date(), t.createdAt.toDate()) > 3
  })

  if (overdue.length >= 2 || overdueHighPriority) return 'red'
  if (overdue.length === 1 || staleChecklist) return 'yellow'
  return 'green'
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
  const { data: contents } = useAllContents()
  const { data: clients } = useClients()
  const assigneeMap = useAssigneeMap()
  const { data: clientSuccessEvaluations } = useAllClientSuccessEvaluations()
  const latestClientSuccess = useMemo(() => latestClientSuccessByClient(clientSuccessEvaluations), [clientSuccessEvaluations])
  const { canSeeAllTasks, viewerId } = useTaskVisibility()
  const visibleTasks = useMemo(() => filterVisibleTasks(tasks, canSeeAllTasks, viewerId), [tasks, canSeeAllTasks, viewerId])
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
  const openContent = contents.find((c) => c.id === openContentId) ?? null

  const buckets = useMemo(() => {
    const openTasks = visibleTasks.filter((t) => t.status !== 'done')
    const today = openTasks.filter((t) => t.dueDate && isToday(t.dueDate.toDate()))
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
    return clients
      .filter((c) => c.status === 'active')
      .map((c) => {
        const nextTask = tasks
          .filter((t) => t.clientId === c.id && t.status !== 'done' && t.dueDate)
          .sort((a, b) => a.dueDate!.toMillis() - b.dueDate!.toMillis())[0]
        const ownerId = getClientOwnerIds(c)[0]
        return {
          client: c,
          health: getClientHealth(c.id, tasks),
          service: clientServiceLabel(c),
          ownerName: ownerId ? (assigneeMap[ownerId]?.name ?? '—') : '—',
          nextTask,
          successTier: latestClientSuccess[c.id]?.tier,
        }
      })
      .sort((a, b) => {
        const rank: Record<ClientHealth, number> = { red: 0, yellow: 1, green: 2 }
        return rank[a.health] - rank[b.health] || a.client.companyName.localeCompare(b.client.companyName)
      })
  }, [clients, tasks, assigneeMap, latestClientSuccess])

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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Dashboard Operacional</h2>
        {!editMode && (
          <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={enterEditMode}>
            Personalizar
          </Button>
        )}
      </div>

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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {gridWidgets.map((w) => (
            <div key={w.id} className={w.width === 'full' ? 'lg:col-span-2' : 'lg:col-span-1'}>
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

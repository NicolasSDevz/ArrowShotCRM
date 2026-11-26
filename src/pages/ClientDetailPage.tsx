import { socialPlanLabel } from '../types/socialPlan'
import { useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AlertTriangle, ArrowLeft, Pencil, Plus, Sparkles, CheckSquare, MoreVertical, Trash2, MessageCircle } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { useTasks } from '../hooks/useTasks'
import { useContents } from '../hooks/useContents'
import { useUsers } from '../hooks/useUsers'
import { ClientFormModal } from '../components/clients/ClientFormModal'
import { ClientPaidTrafficBriefingPanel } from '../components/clients/ClientPaidTrafficBriefingPanel'
import { ClientCampaignPlanningPanel } from '../components/clients/ClientCampaignPlanningPanel'
import { ClientLandingPagePanel } from '../components/clients/ClientLandingPagePanel'
import { ClientOverviewTab } from '../components/clients/ClientOverviewTab'
import { ClientLogoUpload } from '../components/clients/ClientLogoUpload'
import { DeleteClientModal } from '../components/clients/DeleteClientModal'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { PrivateData } from '../components/ui/PrivateData'
import { usePrivacy } from '../context/PrivacyContext'
import { Tabs } from '../components/ui/Tabs'
import { EmptyState } from '../components/ui/EmptyState'
import { FilesPanel } from '../components/files/FilesPanel'
import { CommentsPanel } from '../components/comments/CommentsPanel'
import { ActivityPanel } from '../components/activity/ActivityPanel'
import { TaskDrawer } from '../components/tasks/TaskDrawer'
import { TaskFormModal } from '../components/tasks/TaskFormModal'
import { ContentDrawer } from '../components/content/ContentDrawer'
import { ClientMeetingsTab } from '../components/clients/ClientMeetingsTab'
import { ClientOptimizationsTab } from '../components/clients/ClientOptimizationsTab'
import { ClientContentsTab } from '../components/clients/ClientContentsTab'
import { ClientSuccessTab } from '../components/clients/ClientSuccessTab'
import { ClientAccessTab } from '../components/clients/ClientAccessTab'
import { ClientJornadaTab } from '../components/clients/ClientJornadaTab'
import { WhatsappGroupLinkModal } from '../components/clients/WhatsappGroupLinkModal'
import { CLIENT_PACKAGE_LABEL, clientStatusLabel, CLIENT_STATUS_BADGE, CLIENT_CATEGORY_LABEL, CLIENT_CATEGORY_BADGE, STYLE_CATALOG_LABEL, getClientOwnerIds } from '../types/client'
import { TASK_STATUS_LABEL } from '../types/task'
import { useTaskVisibility, filterVisibleTasks } from '../utils/taskVisibility'
import { useAuth } from '../context/AuthContext'
import { resolveRoutinePersonKey } from '../services/dailyRoutineTemplates'
import { missingFieldsOfClient } from '../utils/clientCompleteness'

/** Onde o Jamilson parou na ficha (grupo e sub-aba), pra abrir o próximo
 *  cliente no mesmo lugar. Só pra ele: os outros sempre abrem na Visão geral. */
const FICHA_KEY = 'fichaCliente:ultimo:v2'
type FichaPos = { group: string; sub: Record<string, string> }
function loadFichaPos(): FichaPos | null {
  try {
    const raw = localStorage.getItem(FICHA_KEY)
    return raw ? (JSON.parse(raw) as FichaPos) : null
  } catch {
    return null
  }
}
function saveFichaPos(pos: FichaPos) {
  try {
    localStorage.setItem(FICHA_KEY, JSON.stringify(pos))
  } catch {
    /* sem storage: só não lembra */
  }
}

type SubTab = { label: string; content: ReactNode }

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: clients } = useClients()
  const { data: users } = useUsers()
  const client = clients.find((c) => c.id === id)

  const { data: allTasks } = useTasks({ clientId: id })
  const { canSeeAllTasks, viewerId } = useTaskVisibility()
  const tasks = filterVisibleTasks(allTasks, canSeeAllTasks, viewerId)
  const { data: contents } = useContents({ clientId: id })
  const [editing, setEditing] = useState(false)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [openContentId, setOpenContentId] = useState<string | null>(null)
  const [creatingTask, setCreatingTask] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [whatsappGroupModalOpen, setWhatsappGroupModalOpen] = useState(false)
  const { isPrivacyMode } = usePrivacy()
  const { profile } = useAuth()
  // Jamilson (CS) usa leitor de tela: a ficha abre direto no Briefing,
  // ou onde ele parou da última vez.
  const isJamilson = !!profile && resolveRoutinePersonKey(profile.name) === 'jamilson'
  const [pos, setPos] = useState<FichaPos | null>(null)
  const current: FichaPos = pos ?? (isJamilson ? loadFichaPos() : null) ?? { group: isJamilson ? '__padrao' : 'Visão geral', sub: {} }
  const updatePos = (next: FichaPos) => {
    setPos(next)
    if (isJamilson) saveFichaPos(next)
  }

  if (!client) {
    return <EmptyState title="Cliente não encontrado" action={<Button onClick={() => navigate('/clientes')}>Voltar</Button>} />
  }

  const owners = getClientOwnerIds(client)
    .map((uid) => users.find((u) => u.id === uid))
    .filter((u): u is (typeof users)[number] => !!u)
  const openTask = tasks.find((t) => t.id === openTaskId) ?? null
  const openContent = contents.find((c) => c.id === openContentId) ?? null
  const missingInfo = client.status === 'churned' ? [] : missingFieldsOfClient(client)

  const hasPT = !!client.modules?.paidTraffic
  const hasSM = !!client.modules?.socialMedia
  const hasLP = !!client.modules?.landingPage
  const platforms = [client.modules?.metaAds && 'Meta', client.modules?.googleAds && 'Google'].filter(Boolean).join(' e ')
  const serviceLine = [hasPT && (platforms ? `Tráfego (${platforms})` : 'Tráfego'), hasSM && 'Social Mídia', hasLP && 'Landing Page']
    .filter(Boolean)
    .join(', ')

  const tasksTab = (
    <div className="flex flex-col gap-2">
      <Button size="sm" icon={<Plus size={13} />} onClick={() => setCreatingTask(true)} className="self-end">
        Nova tarefa
      </Button>
      {tasks.length === 0 ? (
        <EmptyState title="Nenhuma tarefa para este cliente" />
      ) : (
        tasks.map((t) => (
          <button
            key={t.id}
            onClick={() => setOpenTaskId(t.id)}
            className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            <CheckSquare size={14} className="text-slate-300" aria-hidden="true" />
            <span className="flex-1 truncate text-slate-700">{t.title}</span>
            <span className="text-xs text-slate-400">{TASK_STATUS_LABEL[t.status]}</span>
          </button>
        ))
      )}
    </div>
  )

  const calendarTab = (
    <ScheduleList
      items={[
        ...tasks.filter((t) => t.dueDate).map((t) => ({ id: t.id, title: t.title, date: t.dueDate!.toDate(), kind: 'task' as const })),
        ...contents.filter((c) => c.scheduledDate).map((c) => ({ id: c.id, title: c.title, date: c.scheduledDate!.toDate(), kind: 'content' as const })),
      ]}
      onOpenTask={setOpenTaskId}
      onOpenContent={setOpenContentId}
    />
  )

  // Grupos da ficha. Cada grupo tem sub-abas com o mesmo componente acessível
  // (setas, aviso falado e "Sair de..."). Grupo com uma sub-aba só mostra o
  // conteúdo direto.
  const deliveryLabel = hasSM && hasLP ? 'Conteúdo e site' : hasSM ? 'Social Mídia' : 'Landing Page'
  const groups: { label: string; items: SubTab[] }[] = [
    {
      label: 'Visão geral',
      items: [{ label: 'Visão geral', content: <ClientOverviewTab client={client} owners={owners} tasks={tasks} onOpenTask={setOpenTaskId} /> }],
    },
    // Briefing é aba própria (não sub-aba de Tráfego): é o que o Jamilson mais usa.
    ...(hasPT ? [{ label: 'Briefing', items: [{ label: 'Briefing', content: <ClientPaidTrafficBriefingPanel client={client} /> }] }] : []),
    ...(hasPT
      ? [
          {
            label: 'Tráfego',
            items: [
              { label: 'Planejamento de Campanha', content: <ClientCampaignPlanningPanel client={client} /> },
              { label: 'Otimizações', content: <ClientOptimizationsTab client={client} /> },
              { label: 'Tarefas', content: tasksTab },
            ],
          },
        ]
      : []),
    ...(hasSM || hasLP
      ? [
          {
            label: deliveryLabel,
            items: [
              ...(hasSM ? [{ label: 'Conteúdos', content: <ClientContentsTab client={client} /> }] : []),
              ...(hasLP ? [{ label: 'Landing Page', content: <ClientLandingPagePanel client={client} /> }] : []),
            ],
          },
        ]
      : []),
    {
      label: 'Relacionamento',
      items: [
        { label: 'Reuniões', content: <ClientMeetingsTab client={client} /> },
        { label: 'Jornada do Cliente', content: <ClientJornadaTab client={client} /> },
        { label: 'Sucesso do Cliente', content: <ClientSuccessTab clientId={client.id} clientName={client.companyName} /> },
        { label: 'Calendário', content: calendarTab },
      ],
    },
    {
      label: 'Acessos e arquivos',
      items: [
        { label: 'Acessos', content: <ClientAccessTab client={client} /> },
        { label: 'Arquivos', content: <FilesPanel clientId={client.id} category="documents" relatedType="client" relatedId={client.id} /> },
        { label: 'Comentários', content: <CommentsPanel entityType="client" entityId={client.id} clientId={client.id} /> },
        { label: 'Histórico', content: <ActivityPanel entityType="client" entityId={client.id} /> },
      ],
    },
  ]
  // Jamilson sem posição salva: abre no Briefing (ou em Relacionamento, se o cliente não tem tráfego).
  const fallbackGroup = isJamilson ? (hasPT ? 'Briefing' : 'Relacionamento') : 'Visão geral'
  const foundIdx = groups.findIndex((g) => g.label === current.group)
  const groupIdx = foundIdx >= 0 ? foundIdx : Math.max(0, groups.findIndex((g) => g.label === fallbackGroup))
  const subIdxOf = (g: (typeof groups)[number]) => Math.max(0, g.items.findIndex((it) => it.label === current.sub[g.label]))

  return (
    <div className="flex flex-col gap-4">
      <button onClick={() => navigate('/clientes')} className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={13} aria-hidden="true" /> Clientes
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <ClientLogoUpload client={client} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[24px] font-bold leading-tight tracking-tight text-slate-900">
                <PrivateData value={client.companyName} />
              </h1>
              <Badge className={client.status === 'churned' && client.churnType === 'completed' ? 'bg-emerald-50 text-emerald-700' : CLIENT_STATUS_BADGE[client.status]}>
                {clientStatusLabel(client)}
              </Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              {client.categoria && <Badge className={CLIENT_CATEGORY_BADGE[client.categoria]}>{CLIENT_CATEGORY_LABEL[client.categoria]}</Badge>}
              {serviceLine && <span>{serviceLine}</span>}
              {client.segment && <span>· {client.segment}</span>}
              {client.socialPlan ? (
                <Badge className="bg-brand-50 text-brand-600">{socialPlanLabel(client.socialPlan)}</Badge>
              ) : (
                client.package && <Badge className="bg-brand-50 text-brand-600">{CLIENT_PACKAGE_LABEL[client.package]}</Badge>
              )}
              {client.styleCatalog && <Badge className="bg-slate-100 text-slate-500">{STYLE_CATALOG_LABEL[client.styleCatalog]}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isPrivacyMode ? (
            <span title="Grupo do WhatsApp oculto no modo apresentação" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-400">
              <MessageCircle size={14} aria-hidden="true" /> ••••••
            </span>
          ) : client.whatsappGroupLink ? (
            <a
              href={client.whatsappGroupLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-sm font-medium text-white transition-colors duration-150 ease-in-out hover:bg-emerald-600"
            >
              <MessageCircle size={14} aria-hidden="true" /> Grupo do WhatsApp
            </a>
          ) : (
            <button
              onClick={() => setWhatsappGroupModalOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-500 transition-colors duration-150 ease-in-out hover:bg-slate-200"
            >
              <MessageCircle size={14} aria-hidden="true" /> Adicionar grupo
            </button>
          )}
          <Button icon={<Pencil size={14} />} onClick={() => setEditing(true)}>
            Editar
          </Button>
          <div className="relative">
            <button
              onClick={() => setOptionsOpen((v) => !v)}
              aria-label="Mais opções do cliente"
              aria-expanded={optionsOpen}
              className="rounded-lg p-2 text-slate-400 transition-colors duration-150 ease-in-out hover:bg-slate-100 hover:text-slate-600"
            >
              <MoreVertical size={16} aria-hidden="true" />
            </button>
            {optionsOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOptionsOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-100 bg-white p-1 shadow-lg">
                  <button
                    onClick={() => {
                      setOptionsOpen(false)
                      setDeleting(true)
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={14} aria-hidden="true" /> Excluir cliente
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {missingInfo.length > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <AlertTriangle size={18} className="shrink-0 text-amber-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">Cadastro incompleto</p>
            <p className="text-xs text-slate-600">Falta: {missingInfo.join(', ')}</p>
          </div>
          <Button size="sm" variant="secondary" icon={<Pencil size={13} />} onClick={() => setEditing(true)}>
            Completar cadastro
          </Button>
        </div>
      )}

      <section aria-labelledby="client-sections-title" className="rounded-2xl border border-slate-200 bg-white">
        <h2 id="client-sections-title" className="sr-only">
          Ficha de {client.companyName}
        </h2>
        <Tabs
          compact
          label={`Ficha de ${client.companyName}`}
          active={groupIdx}
          onChange={(i) => updatePos({ ...current, group: groups[i].label })}
          tabs={groups.map((g) => ({
            label: g.label,
            content:
              g.items.length === 1 ? (
                g.items[0].content
              ) : (
                <Tabs
                  key={g.label}
                  variant="pills"
                  bare
                  label={g.label}
                  active={subIdxOf(g)}
                  onChange={(i) => updatePos({ group: g.label, sub: { ...current.sub, [g.label]: g.items[i].label } })}
                  tabs={g.items}
                />
              ),
          }))}
        />
      </section>

      <ClientFormModal open={editing} onClose={() => setEditing(false)} client={client} />
      <WhatsappGroupLinkModal open={whatsappGroupModalOpen} onClose={() => setWhatsappGroupModalOpen(false)} client={client} />
      <DeleteClientModal client={deleting ? client : null} onClose={() => setDeleting(false)} onDeleted={() => navigate('/clientes')} />
      <TaskFormModal open={creatingTask} onClose={() => setCreatingTask(false)} defaultClientId={client.id} />
      <TaskDrawer key={`task-${openTaskId ?? 'none'}`} task={openTask} onClose={() => setOpenTaskId(null)} />
      <ContentDrawer key={`content-${openContentId ?? 'none'}`} content={openContent} onClose={() => setOpenContentId(null)} />
    </div>
  )
}

function ScheduleList({
  items,
  onOpenTask,
  onOpenContent,
}: {
  items: { id: string; title: string; date: Date; kind: 'task' | 'content' }[]
  onOpenTask: (id: string) => void
  onOpenContent: (id: string) => void
}) {
  const sorted = [...items].sort((a, b) => a.date.getTime() - b.date.getTime())
  if (sorted.length === 0) return <EmptyState title="Nada agendado para este cliente" />

  return (
    <div className="flex flex-col gap-1.5">
      {sorted.map((item) => (
        <button
          key={`${item.kind}-${item.id}`}
          onClick={() => (item.kind === 'task' ? onOpenTask(item.id) : onOpenContent(item.id))}
          className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
        >
          {item.kind === 'content' ? <Sparkles size={14} className="text-brand-300" aria-hidden="true" /> : <CheckSquare size={14} className="text-blue-300" aria-hidden="true" />}
          <span className="flex-1 truncate text-slate-700">{item.title}</span>
          <span className="text-xs text-slate-400">{format(item.date, 'dd MMM yyyy', { locale: ptBR })}</span>
        </button>
      ))}
    </div>
  )
}

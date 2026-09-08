import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft, Pencil, Plus, Globe, Camera, ThumbsUp, Phone, Mail, MapPin, Sparkles, CheckSquare, MoreVertical, Trash2, Upload } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { useTasks } from '../hooks/useTasks'
import { useContents } from '../hooks/useContents'
import { useUsers } from '../hooks/useUsers'
import { ClientFormModal } from '../components/clients/ClientFormModal'
import { ClientBriefingTab } from '../components/clients/ClientBriefingTab'
import { ClientCampaignPlanningPanel } from '../components/clients/ClientCampaignPlanningPanel'
import { ClientLogoUpload } from '../components/clients/ClientLogoUpload'
import { DeleteClientModal } from '../components/clients/DeleteClientModal'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Tabs } from '../components/ui/Tabs'
import { EmptyState } from '../components/ui/EmptyState'
import { FilesPanel } from '../components/files/FilesPanel'
import { CommentsPanel } from '../components/comments/CommentsPanel'
import { ActivityPanel } from '../components/activity/ActivityPanel'
import { TaskDrawer } from '../components/tasks/TaskDrawer'
import { TaskFormModal } from '../components/tasks/TaskFormModal'
import { ContentDrawer } from '../components/content/ContentDrawer'
import { ContentFormModal } from '../components/content/ContentFormModal'
import { ImportEditorialCalendarModal } from '../components/content/ImportEditorialCalendarModal'
import { ClientMeetingsTab } from '../components/clients/ClientMeetingsTab'
import { ClientOptimizationsTab } from '../components/clients/ClientOptimizationsTab'
import { CLIENT_PACKAGE_LABEL, CLIENT_STATUS_LABEL, CLIENT_CATEGORY_LABEL, CLIENT_CATEGORY_BADGE, STYLE_CATALOG_LABEL, getClientOwnerIds } from '../types/client'
import { TASK_STATUS_LABEL } from '../types/task'
import { CONTENT_STATUS_LABEL } from '../types/content'
import { useTaskVisibility, filterVisibleTasks } from '../utils/taskVisibility'

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
  const [creatingContent, setCreatingContent] = useState(false)
  const [importingCalendar, setImportingCalendar] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (!client) {
    return <EmptyState title="Cliente não encontrado" action={<Button onClick={() => navigate('/clientes')}>Voltar</Button>} />
  }

  const owners = getClientOwnerIds(client)
    .map((uid) => users.find((u) => u.id === uid))
    .filter((u): u is (typeof users)[number] => !!u)
  const openTask = tasks.find((t) => t.id === openTaskId) ?? null
  const openContent = contents.find((c) => c.id === openContentId) ?? null

  return (
    <div className="flex flex-col gap-4">
      <button onClick={() => navigate('/clientes')} className="flex w-fit items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
        <ArrowLeft size={13} /> Clientes
      </button>

      <div className="rounded-xl border border-slate-100 bg-white p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <ClientLogoUpload client={client} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-slate-800">{client.companyName}</h1>
                <Badge className="bg-slate-100 text-slate-500">{CLIENT_STATUS_LABEL[client.status]}</Badge>
                {client.categoria && (
                  <Badge className={CLIENT_CATEGORY_BADGE[client.categoria]}>{CLIENT_CATEGORY_LABEL[client.categoria]}</Badge>
                )}
                {client.package && <Badge className="bg-brand-50 text-brand-600">{CLIENT_PACKAGE_LABEL[client.package]}</Badge>}
                {client.styleCatalog && (
                  <Badge className="bg-slate-100 text-slate-500">{STYLE_CATALOG_LABEL[client.styleCatalog]}</Badge>
                )}
              </div>
              {client.contactName && <p className="text-sm text-slate-400">{client.contactName}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={() => setEditing(true)}>
              Editar
            </Button>
            <div className="relative">
              <button
                onClick={() => setOptionsOpen((v) => !v)}
                className="rounded-lg p-2 text-slate-400 transition-colors duration-150 ease-in-out hover:bg-slate-100 hover:text-slate-600"
              >
                <MoreVertical size={16} />
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
                      <Trash2 size={14} /> Excluir cliente
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
          {client.whatsapp && <span className="flex items-center gap-1"><Phone size={12} /> {client.whatsapp}</span>}
          {client.email && <span className="flex items-center gap-1"><Mail size={12} /> {client.email}</span>}
          {client.city && <span className="flex items-center gap-1"><MapPin size={12} /> {client.city}</span>}
          {client.instagram && <span className="flex items-center gap-1"><Camera size={12} /> {client.instagram}</span>}
          {client.facebook && <span className="flex items-center gap-1"><ThumbsUp size={12} /> {client.facebook}</span>}
          {client.website && <span className="flex items-center gap-1"><Globe size={12} /> {client.website}</span>}
          {owners.length > 0 && (
            <span className="ml-auto flex items-center gap-1.5">
              Responsáveis:
              {owners.map((o) => (
                <span key={o.id} className="flex items-center gap-1">
                  <Avatar name={o.name} photoURL={o.photoURL} size="xs" /> {o.name}
                </span>
              ))}
            </span>
          )}
        </div>

        {client.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{client.notes}</p>}
      </div>

      <div className="rounded-xl border border-slate-100 bg-white">
        <Tabs
          tabs={[
            { label: 'Briefing', content: <ClientBriefingTab client={client} /> },
            { label: 'Planejamento de Campanha', content: <ClientCampaignPlanningPanel client={client} /> },
            {
              label: 'Tarefas',
              content: (
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
                        <CheckSquare size={14} className="text-slate-300" />
                        <span className="flex-1 truncate text-slate-700">{t.title}</span>
                        <span className="text-xs text-slate-400">{TASK_STATUS_LABEL[t.status]}</span>
                      </button>
                    ))
                  )}
                </div>
              ),
            },
            { label: 'Otimizações', content: <ClientOptimizationsTab client={client} /> },
            {
              label: 'Conteúdos',
              content: (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" icon={<Plus size={13} />} onClick={() => setCreatingContent(true)}>
                      Novo conteúdo
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Upload size={13} />}
                      onClick={() => setImportingCalendar(true)}
                    >
                      Importar calendário
                    </Button>
                  </div>
                  {contents.length === 0 ? (
                    <EmptyState title="Nenhum conteúdo para este cliente" />
                  ) : (
                    contents.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setOpenContentId(c.id)}
                        className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <Sparkles size={14} className="text-slate-300" />
                        <span className="flex-1 truncate text-slate-700">{c.title}</span>
                        <span className="text-xs text-slate-400">{CONTENT_STATUS_LABEL[c.status]}</span>
                      </button>
                    ))
                  )}
                </div>
              ),
            },
            {
              label: 'Calendário',
              content: (
                <ScheduleList
                  items={[
                    ...tasks.filter((t) => t.dueDate).map((t) => ({ id: t.id, title: t.title, date: t.dueDate!.toDate(), kind: 'task' as const })),
                    ...contents.filter((c) => c.scheduledDate).map((c) => ({ id: c.id, title: c.title, date: c.scheduledDate!.toDate(), kind: 'content' as const })),
                  ]}
                  onOpenTask={setOpenTaskId}
                  onOpenContent={setOpenContentId}
                />
              ),
            },
            { label: 'Reuniões', content: <ClientMeetingsTab client={client} /> },
            { label: 'Arquivos', content: <FilesPanel clientId={client.id} category="documents" relatedType="client" relatedId={client.id} /> },
            { label: 'Comentários', content: <CommentsPanel entityType="client" entityId={client.id} clientId={client.id} /> },
            { label: 'Histórico', content: <ActivityPanel entityType="client" entityId={client.id} /> },
          ]}
        />
      </div>

      <ClientFormModal open={editing} onClose={() => setEditing(false)} client={client} />
      <DeleteClientModal
        client={deleting ? client : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => navigate('/clientes')}
      />
      <TaskFormModal open={creatingTask} onClose={() => setCreatingTask(false)} defaultClientId={client.id} />
      <ContentFormModal open={creatingContent} onClose={() => setCreatingContent(false)} defaultClientId={client.id} />
      <ImportEditorialCalendarModal open={importingCalendar} onClose={() => setImportingCalendar(false)} clientId={client.id} />
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
          {item.kind === 'content' ? <Sparkles size={14} className="text-brand-300" /> : <CheckSquare size={14} className="text-blue-300" />}
          <span className="flex-1 truncate text-slate-700">{item.title}</span>
          <span className="text-xs text-slate-400">{format(item.date, 'dd MMM yyyy', { locale: ptBR })}</span>
        </button>
      ))}
    </div>
  )
}

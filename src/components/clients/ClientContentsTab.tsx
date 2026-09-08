import { Plus, Upload } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { KanbanBoard } from '../kanban/KanbanBoard'
import { ContentCard } from '../content/ContentCard'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { moveContentStatus } from '../../services/contentService'
import { CONTENT_STATUS_LABEL, CONTENT_STATUS_ORDER, type Content, type ContentStatus } from '../../types/content'
import type { Client } from '../../types'

const ACCENTS: Record<ContentStatus, string> = {
  ideas: 'bg-slate-400',
  production: 'bg-blue-500',
  review: 'bg-amber-500',
  waiting_client: 'bg-violet-500',
  approved: 'bg-teal-500',
  scheduled: 'bg-indigo-500',
  published: 'bg-emerald-500',
  cancelled: 'bg-red-400',
}

/** Kanban de conteúdos do cliente — mesma visualização do módulo Social
 *  Mídia, filtrada para este cliente. Os drawer/modais de conteúdo ficam no
 *  ClientDetailPage (reaproveitados via callbacks). */
export function ClientContentsTab({
  client,
  contents,
  onOpenContent,
  onNewContent,
  onImportCalendar,
}: {
  client: Client
  contents: Content[]
  onOpenContent: (id: string) => void
  onNewContent: () => void
  onImportCalendar: () => void
}) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  const columns = CONTENT_STATUS_ORDER.map((s) => ({ id: s, label: CONTENT_STATUS_LABEL[s], accent: ACCENTS[s] }))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<Plus size={13} />} onClick={onNewContent}>
          Novo conteúdo
        </Button>
        <Button size="sm" variant="secondary" icon={<Upload size={13} />} onClick={onImportCalendar}>
          Importar calendário
        </Button>
      </div>

      {contents.length === 0 ? (
        <EmptyState title="Nenhum conteúdo para este cliente" description='Clique em "Novo conteúdo" para começar o planejamento.' />
      ) : (
        <div className="overflow-x-auto">
          <KanbanBoard<Content, ContentStatus>
            columns={columns}
            items={contents}
            getStatus={(c) => c.status}
            renderCard={(c) => (
              <ContentCard
                content={c}
                client={client}
                assignee={c.assignedTo ? userMap[c.assignedTo] : undefined}
                onClick={() => onOpenContent(c.id)}
              />
            )}
            onMove={(content, newStatus, newOrder) => {
              if (!profile) return
              moveContentStatus(content, newStatus, newOrder, profile.id, profile.name, {
                clientName: client.companyName,
                users,
              })
            }}
          />
        </div>
      )}
    </div>
  )
}

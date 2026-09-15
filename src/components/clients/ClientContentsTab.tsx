import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Plus, Upload, CalendarPlus, Sparkles } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { useContents } from '../../hooks/useContents'
import { KanbanBoard } from '../kanban/KanbanBoard'
import { ContentCard } from '../content/ContentCard'
import { ContentDrawer } from '../content/ContentDrawer'
import { ContentFormModal } from '../content/ContentFormModal'
import { ImportEditorialCalendarModal } from '../content/ImportEditorialCalendarModal'
import { GenerateCalendarPromptModal } from '../content/GenerateCalendarPromptModal'
import { GeneratePautaModal } from '../content/GeneratePautaModal'
import { Tabs } from '../ui/Tabs'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { ContentMonthGrid } from '../socialMedia/ContentMonthGrid'
import { moveContentStatus } from '../../services/contentService'
import { CONTENT_STATUS_LABEL, CONTENT_STATUS_ORDER, type Content, type ContentStatus, type ContentType } from '../../types/content'
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

/** Cor do chip no calendário por cliente — por FORMATO (pedido: azul=Post,
 *  roxo=Reel, verde=Stories). Carrossel/Vídeo/Outro caem no padrão neutro. */
const FORMAT_CHIP_CLASS: Partial<Record<ContentType, string>> = {
  post: 'bg-blue-100 text-blue-700',
  reels: 'bg-violet-100 text-violet-700',
  story: 'bg-emerald-100 text-emerald-700',
}
const DEFAULT_FORMAT_CHIP_CLASS = 'bg-slate-100 text-slate-600'

/** Contexto de criação: qual data pré-preencher (calendário) ou nenhuma
 *  (botão "Novo conteúdo" simples). O `key` no ContentFormModal força
 *  remontar o form quando a data muda, senão o state antigo ficaria preso. */
interface CreatingContext {
  date?: string
}

/** Kanban + Calendário de conteúdos do cliente — mesma visualização usada
 *  tanto dentro da ficha do cliente (aba "Conteúdos") quanto na tela
 *  dedicada do módulo Social Mídia (/social-media/:clientId): é o MESMO
 *  componente, buscando os próprios dados, nos dois pontos de acesso — não
 *  duas cópias. */
export function ClientContentsTab({ client }: { client: Client }) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const { data: contents } = useContents({ clientId: client.id })
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  const [openContentId, setOpenContentId] = useState<string | null>(null)
  const [creating, setCreating] = useState<CreatingContext | null>(null)
  const [importingCalendar, setImportingCalendar] = useState(false)
  const [genCalendarOpen, setGenCalendarOpen] = useState(false)
  const [genPautaOpen, setGenPautaOpen] = useState(false)
  const [month, setMonth] = useState(() => new Date())
  const [searchParams, setSearchParams] = useSearchParams()

  // Deep link de notificação/dashboard (?content=id) — abre o drawer e
  // limpa o parâmetro. Funciona nos dois pontos de acesso (ficha do cliente
  // e /social-media/:clientId), já que os dois montam este componente.
  useEffect(() => {
    const id = searchParams.get('content')
    if (!id) return
    setOpenContentId(id)
    setSearchParams(
      (params) => {
        params.delete('content')
        return params
      },
      { replace: true }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const openContent = contents.find((c) => c.id === openContentId) ?? null
  const columns = CONTENT_STATUS_ORDER.map((s) => ({ id: s, label: CONTENT_STATUS_LABEL[s], accent: ACCENTS[s] }))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<Plus size={13} />} onClick={() => setCreating({})}>
          Novo conteúdo
        </Button>
        <Button size="sm" variant="secondary" icon={<CalendarPlus size={13} />} onClick={() => setGenCalendarOpen(true)}>
          Gerar calendário
        </Button>
        <Button size="sm" variant="secondary" icon={<Sparkles size={13} />} onClick={() => setGenPautaOpen(true)}>
          Gerar pauta
        </Button>
        <Button size="sm" variant="secondary" icon={<Upload size={13} />} onClick={() => setImportingCalendar(true)}>
          Importar calendário
        </Button>
      </div>

      <Tabs
        tabs={[
          {
            label: 'Kanban',
            content:
              contents.length === 0 ? (
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
                        onClick={() => setOpenContentId(c.id)}
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
              ),
          },
          {
            label: 'Calendário',
            content: (
              <ContentMonthGrid
                month={month}
                onMonthChange={setMonth}
                contents={contents}
                chipLabel={(c) => c.title}
                chipClassName={(c) => FORMAT_CHIP_CLASS[c.type] ?? DEFAULT_FORMAT_CHIP_CLASS}
                onOpenContent={setOpenContentId}
                onAddContent={(date) => setCreating({ date: format(date, 'yyyy-MM-dd') })}
              />
            ),
          },
        ]}
      />

      <ContentDrawer key={`content-${openContentId ?? 'none'}`} content={openContent} onClose={() => setOpenContentId(null)} />
      <ContentFormModal
        key={creating?.date ?? 'new'}
        open={!!creating}
        onClose={() => setCreating(null)}
        defaultClientId={client.id}
        defaultScheduledDate={creating?.date}
      />
      <ImportEditorialCalendarModal open={importingCalendar} onClose={() => setImportingCalendar(false)} clientId={client.id} />
      <GenerateCalendarPromptModal open={genCalendarOpen} onClose={() => setGenCalendarOpen(false)} defaultClientId={client.id} />
      <GeneratePautaModal open={genPautaOpen} onClose={() => setGenPautaOpen(false)} />
    </div>
  )
}

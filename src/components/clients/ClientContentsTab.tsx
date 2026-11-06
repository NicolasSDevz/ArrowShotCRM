import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Plus, Upload, CalendarPlus, Send, CalendarCheck } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { useContents } from '../../hooks/useContents'
import { KanbanBoard } from '../kanban/KanbanBoard'
import { ContentCard } from '../content/ContentCard'
import { ContentDrawer } from '../content/ContentDrawer'
import { ContentFormModal } from '../content/ContentFormModal'
import { ImportEditorialCalendarModal } from '../content/ImportEditorialCalendarModal'
import { GenerateMonthModal } from '../socialMedia/GenerateMonthModal'
import { SendMonthApprovalModal } from '../socialMedia/SendMonthApprovalModal'
import { Tabs } from '../ui/Tabs'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { ContentMonthGrid } from '../socialMedia/ContentMonthGrid'
import { moveContentStatus } from '../../services/contentService'
import { type Content, type ContentStatus, type ContentType } from '../../types/content'
import type { Client } from '../../types'

/** Kanban enxuto: três colunas. "Revisar" junta a revisão interna e o que
 *  está com o cliente; agendados/publicados saem do quadro (botão "Marcar como
 *  agendado" nos aprovados) e cancelados também. */
type BoardColumn = 'produzir' | 'revisar' | 'aprovado'
const BOARD_COLUMNS: { id: BoardColumn; label: string; accent: string }[] = [
  { id: 'produzir', label: 'Produzir', accent: 'bg-blue-500' },
  { id: 'revisar', label: 'Revisar', accent: 'bg-amber-500' },
  { id: 'aprovado', label: 'Aprovado', accent: 'bg-teal-500' },
]
const OFF_BOARD = new Set<ContentStatus>(['scheduled', 'published', 'cancelled'])
function boardColumn(status: ContentStatus): BoardColumn {
  if (status === 'review' || status === 'waiting_client') return 'revisar'
  if (status === 'approved') return 'aprovado'
  return 'produzir'
}
function statusForColumn(col: BoardColumn, current: ContentStatus): ContentStatus {
  if (boardColumn(current) === col) return current
  return col === 'produzir' ? 'production' : col === 'revisar' ? 'review' : 'approved'
}

/** Cor do chip no calendário por cliente — por FORMATO (pedido: azul=Post,
 *  roxo=Reel, verde=Stories). Carrossel/Vídeo/Outro caem no padrão neutro. */
const FORMAT_CHIP_CLASS: Partial<Record<ContentType, string>> = {
  post: 'bg-blue-100 text-blue-700',
  carousel: 'bg-amber-100 text-amber-700',
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
  const [genMonthOpen, setGenMonthOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
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
  const boardItems = contents.filter((c) => !OFF_BOARD.has(c.status))
  const scheduledCount = contents.filter((c) => c.status === 'scheduled' || c.status === 'published').length
  const moveTo = (content: Content, status: ContentStatus, order: number) => {
    if (!profile) return
    moveContentStatus(content, status, order, profile.id, profile.name, { clientName: client.companyName, users })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<Plus size={13} />} onClick={() => setCreating({})}>
          Novo conteúdo
        </Button>
        <Button size="sm" variant="secondary" icon={<CalendarPlus size={13} />} onClick={() => setGenMonthOpen(true)}>
          Gerar mês
        </Button>
        <Button size="sm" variant="secondary" icon={<Send size={13} />} onClick={() => setSendOpen(true)}>
          Enviar para aprovação
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
              boardItems.length === 0 && scheduledCount === 0 ? (
                <EmptyState title="Nenhum conteúdo para este cliente" description='Clique em "Novo conteúdo" para começar o planejamento.' />
              ) : (
                <div className="flex flex-col gap-2 overflow-x-auto">
                  <KanbanBoard<Content, BoardColumn>
                    columns={BOARD_COLUMNS}
                    items={boardItems}
                    getStatus={(c) => boardColumn(c.status)}
                    renderCard={(c) => (
                      <div className="flex flex-col gap-1.5">
                        <ContentCard
                          content={c}
                          client={client}
                          assignee={c.assignedTo ? userMap[c.assignedTo] : undefined}
                          onClick={() => setOpenContentId(c.id)}
                        />
                        {c.status === 'waiting_client' && (
                          <p className="px-1 text-[11px] font-semibold text-violet-500">Com o cliente para aprovar</p>
                        )}
                        {c.status === 'approved' && (
                          <button
                            type="button"
                            onClick={() => moveTo(c, 'scheduled', c.order)}
                            className="flex items-center justify-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 py-1.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-100"
                          >
                            <CalendarCheck size={13} /> Marcar como agendado
                          </button>
                        )}
                      </div>
                    )}
                    onMove={(content, col, newOrder) => moveTo(content, statusForColumn(col, content.status), newOrder)}
                  />
                  {scheduledCount > 0 && (
                    <p className="text-xs text-slate-500">
                      {scheduledCount} post(s) já agendados ou publicados saíram do quadro. Eles continuam na aba Calendário.
                    </p>
                  )}
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
      {genMonthOpen && <GenerateMonthModal open onClose={() => setGenMonthOpen(false)} client={client} contents={contents} />}
      {sendOpen && <SendMonthApprovalModal open onClose={() => setSendOpen(false)} client={client} contents={contents} />}
    </div>
  )
}

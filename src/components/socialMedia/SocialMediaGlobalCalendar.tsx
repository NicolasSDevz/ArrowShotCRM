import { useMemo, useState } from 'react'
import { useAllContents } from '../../hooks/useContents'
import { useClients } from '../../hooks/useClients'
import { useUsers } from '../../hooks/useUsers'
import { ContentDrawer } from '../content/ContentDrawer'
import { ContentMonthGrid } from './ContentMonthGrid'
import { clientHashChip } from '../../utils/clientColor'
import { CONTENT_FORMAT_LABEL, CONTENT_TYPE_LABEL, type Content, type ContentStatus } from '../../types/content'
import { getClientOwnerIds } from '../../types/client'

const MANAGER_FILTER_NAMES = ['Ciane', 'Nicolas']

const APPROVED_STATUSES: ContentStatus[] = ['approved', 'scheduled', 'published']
const PENDING_STATUSES: ContentStatus[] = ['ideas', 'production', 'review', 'waiting_client']

function statusIcon(status: ContentStatus): string {
  if (APPROVED_STATUSES.includes(status)) return '✅'
  if (status === 'cancelled') return '❌'
  if (status === 'ideas') return '📝'
  return '⏳' // production, review, waiting_client
}

/** Aba "Calendário geral" do módulo Social Mídia — todos os clientes juntos,
 *  chip colorido por cliente (mesma cor em toda a app, ver clientColor.ts),
 *  ícone de status, filtros de gestor e status. */
export function SocialMediaGlobalCalendar() {
  const { data: contents } = useAllContents()
  const { data: clients } = useClients()
  const { data: users } = useUsers()
  const [month, setMonth] = useState(() => new Date())
  const [managerFilter, setManagerFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'pending' | 'approved'>('')
  const [openContentId, setOpenContentId] = useState<string | null>(null)

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])
  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])

  const clientMatchesManager = (clientId: string) => {
    if (!managerFilter) return true
    const client = clientMap[clientId]
    if (!client) return false
    const names = getClientOwnerIds(client)
      .map((id) => userMap[id]?.name)
      .filter((n): n is string => !!n)
    return names.includes(managerFilter)
  }

  const visibleContents = useMemo(() => {
    return contents.filter((c) => {
      if (statusFilter === 'pending' && !PENDING_STATUSES.includes(c.status)) return false
      if (statusFilter === 'approved' && !APPROVED_STATUSES.includes(c.status)) return false
      if (!clientMatchesManager(c.clientId)) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contents, statusFilter, managerFilter, clientMap, userMap])

  const openContent = contents.find((c) => c.id === openContentId) ?? null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <select
          value={managerFilter}
          onChange={(e) => setManagerFilter(e.target.value)}
          className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Todos os gestores</option>
          {MANAGER_FILTER_NAMES.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | 'pending' | 'approved')}
          className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Todos os status</option>
          <option value="pending">Pendentes</option>
          <option value="approved">Aprovados</option>
        </select>
      </div>

      <ContentMonthGrid
        month={month}
        onMonthChange={setMonth}
        contents={visibleContents}
        chipLabel={(c: Content) => `${clientMap[c.clientId]?.companyName ?? '—'} — ${CONTENT_FORMAT_LABEL[c.type] ?? CONTENT_TYPE_LABEL[c.type]}`}
        chipClassName={(c: Content) => clientHashChip(c.clientId)}
        chipIcon={(c: Content) => <span>{statusIcon(c.status)}</span>}
        onOpenContent={setOpenContentId}
      />

      <ContentDrawer key={`content-${openContentId ?? 'none'}`} content={openContent} onClose={() => setOpenContentId(null)} />
    </div>
  )
}

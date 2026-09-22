import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, LayoutGrid, List, X } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { useUsers } from '../hooks/useUsers'
import { useAuth } from '../context/AuthContext'
import { ClientsTable } from '../components/clients/ClientsTable'
import { ClientsGrid } from '../components/clients/ClientsGrid'
import { ClientFormModal } from '../components/clients/ClientFormModal'
import { DeleteClientModal } from '../components/clients/DeleteClientModal'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { CLIENT_CATEGORY_LABEL, getClientOwnerIds, type Client, type ClientStatus } from '../types/client'

type ViewMode = 'table' | 'grid'
type SortOption = 'name' | 'value_desc' | 'recent'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name', label: 'Nome (A-Z)' },
  { value: 'value_desc', label: 'Maior mensalidade' },
  { value: 'recent', label: 'Mais recentes' },
]

/** A ordem que já vem do Firestore (subscribeClients) é por companyName —
 *  então "name" não precisa reordenar nada, só os outros dois critérios. */
function sortClients(list: Client[], sort: SortOption): Client[] {
  if (sort === 'name') return list
  const arr = [...list]
  if (sort === 'value_desc') {
    arr.sort((a, b) => (b.monthlyValue ?? 0) - (a.monthlyValue ?? 0))
  } else if (sort === 'recent') {
    const start = (c: Client) => c.contractStartDate?.toMillis?.() ?? c.createdAt?.toMillis?.() ?? 0
    arr.sort((a, b) => start(b) - start(a))
  }
  return arr
}

/** Gestores para o filtro. Os responsáveis são gravados no cliente como
 *  `ownerIds` (ids de usuário), então o filtro resolve id → nome via userMap
 *  e compara pelo nome. */
const MANAGER_FILTER_NAMES = ['Ciane', 'Nicolas']

/** Opções do filtro de status. "ativos" = tudo menos Encerrado (padrão);
 *  "all" = inclui Encerrado. */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ativos', label: 'Ativos' },
  { value: 'active', label: 'Ativo' },
  { value: 'prospect', label: 'Onboarding' },
  { value: 'paused', label: 'Pausado' },
  { value: 'churned', label: 'Encerrado' },
  { value: 'all', label: 'Todos' },
]

function statusMatches(filter: string, status: ClientStatus): boolean {
  if (filter === 'all') return true
  if (filter === 'ativos') return status !== 'churned'
  return status === filter
}

const SERVICE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos os serviços' },
  { value: 'paidTraffic', label: 'Tráfego Pago' },
  { value: 'socialMedia', label: 'Social Mídia' },
  { value: 'landingPage', label: 'Landing Page' },
  { value: 'both', label: 'Ambos (Tráfego + Social Mídia)' },
]

function serviceMatches(filter: string, modules: Client['modules']): boolean {
  if (!filter) return true
  if (filter === 'both') return !!modules?.paidTraffic && !!modules?.socialMedia
  return !!modules?.[filter as 'paidTraffic' | 'socialMedia' | 'landingPage']
}

export function ClientsPage() {
  const navigate = useNavigate()
  const { data: clients, loading } = useClients()
  const { data: users } = useUsers()
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ativos')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  // null = ainda não interagido → deriva do usuário logado (Ciane/Nicolas
  // começam vendo só os deles). Qualquer escolha do usuário passa a mandar.
  const [managerFilterChoice, setManagerFilterChoice] = useState<string | null>(null)
  const [sort, setSort] = useState<SortOption>('name')
  const [view, setView] = useState<ViewMode>('table')
  const [creating, setCreating] = useState(false)
  const [deletingClient, setDeletingClient] = useState<Client | null>(null)

  const managerFilter =
    managerFilterChoice ?? (MANAGER_FILTER_NAMES.includes(profile?.name ?? '') ? (profile?.name ?? '') : '')

  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])

  /** Nomes dos responsáveis internos de um cliente (resolvidos de ownerIds). */
  const ownerNames = (c: Client) =>
    getClientOwnerIds(c)
      .map((id) => userMap[id]?.name)
      .filter((n): n is string => !!n)

  const filtered = useMemo(() => {
    const matched = clients.filter((c) => {
      if (search && !c.companyName.toLowerCase().includes(search.toLowerCase())) return false
      if (!statusMatches(statusFilter, c.status)) return false
      if (categoryFilter && c.categoria !== categoryFilter) return false
      if (!serviceMatches(serviceFilter, c.modules)) return false
      if (managerFilter && !ownerNames(c).includes(managerFilter)) return false
      return true
    })
    return sortClients(matched, sort)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, search, statusFilter, categoryFilter, serviceFilter, managerFilter, sort, userMap])

  const ownersByClientId = useMemo(() => {
    return Object.fromEntries(
      filtered.map((c) => [c.id, getClientOwnerIds(c).map((id) => userMap[id]).filter(Boolean)]),
    )
  }, [filtered, userMap])

  const hasActiveFilters = !!search || statusFilter !== 'ativos' || !!categoryFilter || !!serviceFilter || managerFilterChoice !== null
  const clearFilters = () => {
    setSearch('')
    setStatusFilter('ativos')
    setCategoryFilter('')
    setServiceFilter('')
    setManagerFilterChoice(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900">Clientes</h1>
          <p className="text-[15px] text-[#64748B]">{filtered.length} cliente(s)</p>
        </div>
        <Button style={{ height: '40px' }} icon={<Plus size={14} />} onClick={() => setCreating(true)}>
          Novo cliente
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="h-[38px] rounded-lg border border-slate-200 pl-8 pr-3 text-sm outline-none transition-all duration-150 ease-in-out focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100">
            <option value="">Todas as categorias</option>
            {Object.entries(CLIENT_CATEGORY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select value={managerFilter} onChange={(e) => setManagerFilterChoice(e.target.value)} className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100">
            <option value="">Todos os gestores</option>
            {MANAGER_FILTER_NAMES.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100">
            {SERVICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex h-[38px] items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={13} /> Limpar filtros
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-50 pt-2.5">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-slate-400">Ordenar por</label>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)} className="h-8 rounded-lg border border-slate-200 px-2 text-xs transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100">
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
            <button
              onClick={() => setView('table')}
              title="Visualizar em tabela"
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                view === 'table' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setView('grid')}
              title="Visualizar em cartões"
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                view === 'grid' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {!loading && filtered.length === 0 ? (
        <EmptyState title="Nenhum cliente encontrado" description="Ajuste os filtros ou cadastre um novo cliente." />
      ) : view === 'grid' ? (
        <ClientsGrid clients={filtered} ownersByClientId={ownersByClientId} onRowClick={(c) => navigate(`/clientes/${c.id}`)} />
      ) : (
        <ClientsTable
          clients={filtered}
          ownersByClientId={ownersByClientId}
          onRowClick={(c) => navigate(`/clientes/${c.id}`)}
          onDelete={(c) => setDeletingClient(c)}
        />
      )}

      <ClientFormModal open={creating} onClose={() => setCreating(false)} />
      <DeleteClientModal client={deletingClient} onClose={() => setDeletingClient(null)} />
    </div>
  )
}

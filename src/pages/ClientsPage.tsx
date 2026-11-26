import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, LayoutGrid, List, X, SlidersHorizontal } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { useUsers } from '../hooks/useUsers'
import { useAuth } from '../context/AuthContext'
import { usePersistedViewMode } from '../hooks/usePersistedViewMode'
import { ClientsTable } from '../components/clients/ClientsTable'
import { ClientsGrid } from '../components/clients/ClientsGrid'
import { OnboardingClientsBoard } from '../components/clients/OnboardingClientsBoard'
import { ClientFormModal } from '../components/clients/ClientFormModal'
import { DeleteClientModal } from '../components/clients/DeleteClientModal'
import { JornadaMigrationBanner } from '../components/clients/JornadaMigrationBanner'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, Select } from '../components/ui/Field'
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

/** Abas de status. "Ativos" mostra só quem já está ativo — quem ainda está
 *  nas reuniões de onboarding fica na aba própria, com o andamento. */
const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'active', label: 'Ativos' },
  { value: 'prospect', label: 'Em onboarding' },
  { value: 'paused', label: 'Pausados' },
  { value: 'churned', label: 'Encerrados' },
  { value: 'all', label: 'Todos' },
]

function statusMatches(filter: string, status: ClientStatus): boolean {
  if (filter === 'all') return true
  return status === filter
}

const SERVICE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos os serviços' },
  { value: 'paidTraffic', label: 'Tráfego Pago' },
  { value: 'metaAds', label: 'Tráfego: Meta Ads' },
  { value: 'googleAds', label: 'Tráfego: Google Ads' },
  { value: 'socialMedia', label: 'Social Mídia' },
  { value: 'landingPage', label: 'Landing Page' },
  { value: 'both', label: 'Ambos (Tráfego + Social Mídia)' },
]

function serviceMatches(filter: string, modules: Client['modules']): boolean {
  if (!filter) return true
  if (filter === 'both') return !!modules?.paidTraffic && !!modules?.socialMedia
  if (filter === 'metaAds' || filter === 'googleAds') return !!modules?.paidTraffic && !!modules?.[filter]
  return !!modules?.[filter as 'paidTraffic' | 'socialMedia' | 'landingPage']
}

export function ClientsPage() {
  const navigate = useNavigate()
  const { data: clients, loading } = useClients()
  const { data: users } = useUsers()
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  // null = ainda não interagido → deriva do usuário logado (Ciane/Nicolas
  // começam vendo só os deles). Qualquer escolha do usuário passa a mandar.
  const [managerFilterChoice, setManagerFilterChoice] = useState<string | null>(null)
  const [sort, setSort] = useState<SortOption>('name')
  const [view, setView] = usePersistedViewMode<ViewMode>('clientsView', 'table')
  const [creating, setCreating] = useState(false)
  const [deletingClient, setDeletingClient] = useState<Client | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

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

  /** Quantos clientes cada aba de status teria com os outros filtros atuais. */
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 }
    for (const c of clients) {
      if (search && !c.companyName.toLowerCase().includes(search.toLowerCase())) continue
      if (categoryFilter && c.categoria !== categoryFilter) continue
      if (!serviceMatches(serviceFilter, c.modules)) continue
      if (managerFilter && !ownerNames(c).includes(managerFilter)) continue
      counts[c.status] = (counts[c.status] ?? 0) + 1
      counts.all++
    }
    return counts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, search, categoryFilter, serviceFilter, managerFilter, userMap])

  const ownersByClientId = useMemo(() => {
    return Object.fromEntries(
      filtered.map((c) => [c.id, getClientOwnerIds(c).map((id) => userMap[id]).filter(Boolean)]),
    )
  }, [filtered, userMap])

  const extraFilterCount = [categoryFilter, serviceFilter, managerFilter].filter(Boolean).length + (sort !== 'name' ? 1 : 0)
  const hasActiveFilters = !!search || statusFilter !== 'active' || !!categoryFilter || !!serviceFilter || managerFilterChoice !== null
  const clearFilters = () => {
    setSearch('')
    setStatusFilter('active')
    setCategoryFilter('')
    setServiceFilter('')
    setManagerFilterChoice(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <JornadaMigrationBanner clients={clients} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900">
          Clientes{' '}
          <span className="text-base font-normal text-slate-500" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'}
          </span>
        </h1>
        <Button style={{ height: '40px' }} icon={<Plus size={14} />} onClick={() => setCreating(true)}>
          Novo cliente
        </Button>
      </div>

      {/* Uma linha só: busca, status, filtros e modo de exibição */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            aria-label="Buscar cliente pelo nome"
            className="h-[38px] w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none transition-all duration-150 ease-in-out focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div role="group" aria-label="Status dos clientes" className="flex flex-wrap items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-0.5">
          {STATUS_TABS.map((t) => {
            const selected = statusFilter === t.value
            const count = statusCounts[t.value] ?? 0
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setStatusFilter(t.value)}
                aria-pressed={selected}
                className={`flex h-[32px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ease-in-out ${
                  selected ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t.label}
                <span className={`text-xs ${selected ? 'text-white/80' : 'text-slate-400'}`}>{count}</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          aria-controls="clients-filters"
          className={`flex h-[38px] items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
            filtersOpen || extraFilterCount > 0 ? 'border-brand-600 bg-brand-50 text-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
          }`}
        >
          <SlidersHorizontal size={14} aria-hidden="true" /> Filtros
          {extraFilterCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">{extraFilterCount}</span>}
        </button>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex h-[38px] items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={13} aria-hidden="true" /> Limpar
          </button>
        )}
        <div role="group" aria-label="Modo de exibição" className="ml-auto flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => setView('table')}
            aria-pressed={view === 'table'}
            title="Ver em tabela"
            aria-label="Ver em tabela"
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${view === 'table' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <List size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setView('grid')}
            aria-pressed={view === 'grid'}
            title="Ver em cartões"
            aria-label="Ver em cartões"
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${view === 'grid' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <LayoutGrid size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {filtersOpen && (
        <div id="clients-filters" className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Categoria">
            <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(CLIENT_CATEGORY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Gestor">
            <Select value={managerFilter} onChange={(e) => setManagerFilterChoice(e.target.value)}>
              <option value="">Todos</option>
              {MANAGER_FILTER_NAMES.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Serviço">
            <Select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
              {SERVICE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ordenar por">
            <Select value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      {!loading && filtered.length === 0 ? (
        <EmptyState title="Nenhum cliente encontrado" description="Ajuste os filtros ou cadastre um novo cliente." />
      ) : statusFilter === 'prospect' ? (
        <OnboardingClientsBoard clients={filtered} onOpen={(c) => navigate(`/clientes/${c.id}`)} />
      ) : view === 'grid' ? (
        <ClientsGrid clients={filtered} ownersByClientId={ownersByClientId} onRowClick={(c) => navigate(`/clientes/${c.id}`)} />
      ) : (
        <ClientsTable
          clients={filtered}
          ownersByClientId={ownersByClientId}
          onRowClick={(c) => navigate(`/clientes/${c.id}`)}
          onDelete={(c) => setDeletingClient(c)}
          showStatus={statusFilter === 'all'}
        />
      )}

      <ClientFormModal open={creating} onClose={() => setCreating(false)} />
      <DeleteClientModal client={deletingClient} onClose={() => setDeletingClient(null)} />
    </div>
  )
}

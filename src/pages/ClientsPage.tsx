import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { useUsers } from '../hooks/useUsers'
import { ClientsTable } from '../components/clients/ClientsTable'
import { ClientFormModal } from '../components/clients/ClientFormModal'
import { DeleteClientModal } from '../components/clients/DeleteClientModal'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { CLIENT_STATUS_LABEL, CLIENT_CATEGORY_LABEL, getClientOwnerIds, type Client } from '../types/client'

export function ClientsPage() {
  const navigate = useNavigate()
  const { data: clients, loading } = useClients()
  const { data: users } = useUsers()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingClient, setDeletingClient] = useState<Client | null>(null)

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (search && !c.companyName.toLowerCase().includes(search.toLowerCase())) return false
      if (statusFilter && c.status !== statusFilter) return false
      if (categoryFilter && c.categoria !== categoryFilter) return false
      return true
    })
  }, [clients, search, statusFilter, categoryFilter])

  const ownersByClientId = useMemo(() => {
    return Object.fromEntries(
      filtered.map((c) => [c.id, getClientOwnerIds(c).map((id) => userMap[id]).filter(Boolean)]),
    )
  }, [filtered, userMap])

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
          <option value="">Todos os status</option>
          {Object.entries(CLIENT_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100">
          <option value="">Todas as categorias</option>
          {Object.entries(CLIENT_CATEGORY_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {!loading && filtered.length === 0 ? (
        <EmptyState title="Nenhum cliente encontrado" description="Ajuste os filtros ou cadastre um novo cliente." />
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

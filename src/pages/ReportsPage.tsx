import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, FileDown, Eye, FileBarChart, Search, Trash2, X, LayoutGrid, List as ListIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { useReports } from '../hooks/useReports'
import { useClients } from '../hooks/useClients'
import { useAuth } from '../context/AuthContext'
import { usePersistedViewMode } from '../hooks/usePersistedViewMode'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { ReportFormModal } from '../components/reports/ReportFormModal'
import { ReportViewModal } from '../components/reports/ReportViewModal'
import { ReportsClientCard } from '../components/reports/ReportsClientCard'
import { ClientReportsDrawer } from '../components/reports/ClientReportsDrawer'
import { generateWeeklyReportPdf } from '../utils/weeklyReportPdf'
import { deleteReport } from '../services/reportService'
import { REPORT_TYPE_LABEL, type Report, type ReportType } from '../types'

const TYPE_OPTIONS: { value: ReportType | ''; label: string }[] = [
  { value: '', label: 'Todos os tipos' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'weekly', label: 'Semanal' },
]

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <p className="text-[13px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-[22px] font-extrabold leading-tight text-slate-900">{value}</p>
    </div>
  )
}

export function ReportsPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: reports } = useReports()
  const { data: clients } = useClients()
  const [view, setView] = usePersistedViewMode<'blocks' | 'list'>('reportsView', 'blocks')
  const [creating, setCreating] = useState(false)
  const [viewingWeeklyId, setViewingWeeklyId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ReportType | ''>('')
  const [clientFilter, setClientFilter] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openClientId, setOpenClientId] = useState<string | null>(null)

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])
  const viewingWeekly = reports.find((r) => r.id === viewingWeeklyId) ?? null
  const openClient = openClientId ? (clientMap[openClientId] ?? null) : null

  // Só clientes que já têm ao menos um relatório aparecem no filtro/blocos —
  // uma lista de todos os clientes da agência aqui ficaria enorme e inútil.
  const clientsWithReports = useMemo(() => {
    const ids = new Set(reports.map((r) => r.clientId))
    return [...ids]
      .map((id) => clientMap[id])
      .filter((c): c is NonNullable<typeof c> => !!c)
      .sort((a, b) => a.companyName.localeCompare(b.companyName))
  }, [reports, clientMap])

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      const clientName = clientMap[r.clientId]?.companyName ?? ''
      if (search && !clientName.toLowerCase().includes(search.toLowerCase())) return false
      if (typeFilter && r.type !== typeFilter) return false
      if (clientFilter && r.clientId !== clientFilter) return false
      return true
    })
  }, [reports, clientMap, search, typeFilter, clientFilter])

  const visibleClients = useMemo(
    () => (search ? clientsWithReports.filter((c) => c.companyName.toLowerCase().includes(search.toLowerCase())) : clientsWithReports),
    [clientsWithReports, search]
  )

  const stats = useMemo(() => {
    const now = new Date()
    const monthRange = { start: startOfMonth(now), end: endOfMonth(now) }
    const thisMonth = reports.filter((r) => r.createdAt && isWithinInterval(r.createdAt.toDate(), monthRange))
    return {
      total: reports.length,
      thisMonth: thisMonth.length,
      clients: clientsWithReports.length,
    }
  }, [reports, clientsWithReports])

  const hasActiveFilters = !!search || !!typeFilter || !!clientFilter
  const clearFilters = () => {
    setSearch('')
    setTypeFilter('')
    setClientFilter('')
  }

  const openReport = (report: Report) => {
    if (report.type === 'monthly') navigate(`/relatorios/${report.id}`)
    else setViewingWeeklyId(report.id)
  }

  const handleExportWeekly = (report: Report) => {
    const clientName = clientMap[report.clientId]?.companyName ?? 'Cliente'
    try {
      generateWeeklyReportPdf(clientName, report.weeklyText ?? '')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao exportar PDF')
    }
  }

  const handleDelete = async (report: Report) => {
    if (!profile) return
    const clientName = clientMap[report.clientId]?.companyName ?? 'este cliente'
    if (!confirm(`Excluir o relatório ${REPORT_TYPE_LABEL[report.type].toLowerCase()} de ${clientName}? Essa ação não pode ser desfeita.`)) return
    setDeletingId(report.id)
    try {
      await deleteReport(report, profile.id, profile.name)
      toast.success('Relatório excluído')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao excluir relatório')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900">Relatórios</h1>
          <p className="text-[15px] text-[#64748B]">Desempenho mensal e semanal por cliente</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
            <button
              onClick={() => setView('blocks')}
              title="Ver por cliente (blocos)"
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                view === 'blocks' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setView('list')}
              title="Ver em lista"
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                view === 'list' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <ListIcon size={15} />
            </button>
          </div>
          <Button icon={<Plus size={14} />} onClick={() => setCreating(true)}>
            Novo relatório
          </Button>
        </div>
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon={<FileBarChart size={28} />}
          title="Nenhum relatório gerado ainda"
          action={
            <Button size="sm" icon={<Plus size={13} />} onClick={() => setCreating(true)}>
              Novo relatório
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Total de relatórios" value={stats.total} />
            <StatCard label="Gerados este mês" value={stats.thisMonth} />
            <StatCard label="Clientes com relatório" value={stats.clients} />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white p-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por cliente..."
                className="h-[38px] rounded-lg border border-slate-200 pl-8 pr-3 text-sm outline-none transition-all duration-150 ease-in-out focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            {view === 'list' && (
              <>
                <select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">Todos os clientes</option>
                  {clientsWithReports.map((c) => (
                    <option key={c.id} value={c.id}>{c.companyName}</option>
                  ))}
                </select>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as ReportType | '')}
                  className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </>
            )}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex h-[38px] items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={13} /> Limpar filtros
              </button>
            )}
          </div>

          {view === 'blocks' ? (
            visibleClients.length === 0 ? (
              <EmptyState title="Nenhum cliente encontrado" description="Ajuste a busca para ver outros clientes." />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleClients.map((c) => (
                  <ReportsClientCard
                    key={c.id}
                    client={c}
                    reports={reports.filter((r) => r.clientId === c.id)}
                    onClick={() => setOpenClientId(c.id)}
                  />
                ))}
              </div>
            )
          ) : filtered.length === 0 ? (
            <EmptyState title="Nenhum relatório encontrado" description="Ajuste os filtros para ver outros relatórios." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Cliente</th>
                      <th className="px-4 py-2.5">Período</th>
                      <th className="px-4 py-2.5">Tipo</th>
                      <th className="px-4 py-2.5">Gerado em</th>
                      <th className="px-4 py-2.5">Gerado por</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {/* r.createdAt vem de serverTimestamp() — no primeiro snapshot local
                        logo após criar o relatório (antes do servidor confirmar) ele chega
                        null, e .toDate() nisso quebrava a tela até o valor real sincronizar. */}
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-b border-slate-50 text-slate-700 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium">{clientMap[r.clientId]?.companyName ?? '—'}</td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {format(r.periodStart.toDate(), 'dd/MM/yyyy', { locale: ptBR })} – {format(r.periodEnd.toDate(), 'dd/MM/yyyy', { locale: ptBR })}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge className={r.type === 'weekly' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'}>
                            {REPORT_TYPE_LABEL[r.type]}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {r.createdAt ? format(r.createdAt.toDate(), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{r.generatedByName}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button variant="ghost" size="sm" icon={<Eye size={13} />} onClick={() => openReport(r)}>
                              Ver
                            </Button>
                            {r.type === 'weekly' && (
                              <Button variant="secondary" size="sm" icon={<FileDown size={13} />} onClick={() => handleExportWeekly(r)}>
                                Exportar PDF
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Trash2 size={13} />}
                              loading={deletingId === r.id}
                              onClick={() => handleDelete(r)}
                              className="text-red-500 hover:bg-red-50"
                            >
                              Excluir
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <ReportFormModal open={creating} onClose={() => setCreating(false)} />
      <ReportViewModal
        report={viewingWeekly}
        clientName={viewingWeekly ? clientMap[viewingWeekly.clientId]?.companyName ?? 'Cliente' : ''}
        onClose={() => setViewingWeeklyId(null)}
      />
      <ClientReportsDrawer client={openClient} reports={reports} onClose={() => setOpenClientId(null)} onOpenReport={openReport} />
    </div>
  )
}

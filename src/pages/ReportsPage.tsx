import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, FileDown, Eye, FileBarChart } from 'lucide-react'
import toast from 'react-hot-toast'
import { useReports } from '../hooks/useReports'
import { useClients } from '../hooks/useClients'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { ReportFormModal } from '../components/reports/ReportFormModal'
import { ReportViewModal } from '../components/reports/ReportViewModal'
import { generateWeeklyReportPdf } from '../utils/weeklyReportPdf'
import { REPORT_TYPE_LABEL, type Report } from '../types'

export function ReportsPage() {
  const navigate = useNavigate()
  const { data: reports } = useReports()
  const { data: clients } = useClients()
  const [creating, setCreating] = useState(false)
  const [viewingWeeklyId, setViewingWeeklyId] = useState<string | null>(null)

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])
  const viewingWeekly = reports.find((r) => r.id === viewingWeeklyId) ?? null

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900">Relatórios</h1>
          <p className="text-[15px] text-[#64748B]">Desempenho mensal e semanal por cliente</p>
        </div>
        <Button icon={<Plus size={14} />} onClick={() => setCreating(true)}>
          Novo relatório
        </Button>
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
                {reports.map((r) => (
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
                    <td className="px-4 py-2.5 text-slate-500">{format(r.createdAt.toDate(), 'dd/MM/yyyy', { locale: ptBR })}</td>
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ReportFormModal open={creating} onClose={() => setCreating(false)} />
      <ReportViewModal
        report={viewingWeekly}
        clientName={viewingWeekly ? clientMap[viewingWeekly.clientId]?.companyName ?? 'Cliente' : ''}
        onClose={() => setViewingWeeklyId(null)}
      />
    </div>
  )
}

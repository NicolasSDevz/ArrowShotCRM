import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Eye, FileDown, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Drawer } from '../ui/Drawer'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import { useAuth } from '../../context/AuthContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { generateWeeklyReportPdf } from '../../utils/weeklyReportPdf'
import { deleteReport } from '../../services/reportService'
import { REPORT_TYPE_LABEL, type Client, type Report } from '../../types'

/** Histórico completo de relatórios (mensal + semanal) de UM cliente,
 *  ordenado do mais recente pro mais antigo — aberto a partir do card do
 *  cliente na visão "Blocos" de Relatórios. Mesmas ações da tabela (ver/
 *  exportar/excluir), só que já filtradas pra esse cliente, sem precisar
 *  navegar pelos filtros da lista geral. */
export function ClientReportsDrawer({
  client,
  reports,
  onClose,
  onOpenReport,
}: {
  client: Client | null
  reports: Report[]
  onClose: () => void
  onOpenReport: (report: Report) => void
}) {
  const { profile } = useAuth()
  const { isPrivacyMode } = usePrivacy()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...reports].filter((r) => r.clientId === client?.id).sort((a, b) => b.periodEnd.toMillis() - a.periodEnd.toMillis()),
    [reports, client?.id]
  )

  if (!client) return null

  const handleExport = (report: Report) => {
    try {
      generateWeeklyReportPdf(client.companyName, report.weeklyText ?? '')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao exportar PDF')
    }
  }

  const handleDelete = async (report: Report) => {
    if (!profile) return
    if (!confirm(`Excluir o relatório ${REPORT_TYPE_LABEL[report.type].toLowerCase()} de ${client.companyName}? Essa ação não pode ser desfeita.`)) return
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
    <Drawer
      open={!!client}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <Avatar name={isPrivacyMode ? 'Cliente' : client.companyName} photoURL={isPrivacyMode ? null : client.logoUrl} size="sm" />
          <span>{isPrivacyMode ? '••••••' : client.companyName}</span>
        </div>
      }
    >
      <div className="flex flex-col gap-2.5 p-5">
        {sorted.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum relatório ainda.</p>
        ) : (
          sorted.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={r.type === 'weekly' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'}>
                  {REPORT_TYPE_LABEL[r.type]}
                </Badge>
                <p className="text-sm font-medium text-slate-700">
                  {format(r.periodStart.toDate(), 'dd/MM/yyyy', { locale: ptBR })} – {format(r.periodEnd.toDate(), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
              <p className="text-xs text-slate-400">
                Gerado por {r.generatedByName}
                {r.createdAt ? ` em ${format(r.createdAt.toDate(), 'dd/MM/yyyy', { locale: ptBR })}` : ''}
              </p>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" icon={<Eye size={13} />} onClick={() => onOpenReport(r)}>
                  Ver
                </Button>
                {r.type === 'weekly' && (
                  <Button variant="secondary" size="sm" icon={<FileDown size={13} />} onClick={() => handleExport(r)}>
                    Exportar PDF
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={13} />}
                  loading={deletingId === r.id}
                  onClick={() => handleDelete(r)}
                  className="ml-auto text-red-500 hover:bg-red-50"
                >
                  Excluir
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Drawer>
  )
}

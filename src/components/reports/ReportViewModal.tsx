import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { Copy } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { REPORT_PLATFORM_LABEL, type Report } from '../../types'

/** Só para relatórios semanais (texto para WhatsApp). O mensal abre a página
 *  dedicada /relatorios/:id (ver ReportsPage.openReport). */
export function ReportViewModal({
  report,
  clientName,
  onClose,
}: {
  report: Report | null
  clientName: string
  onClose: () => void
}) {
  if (!report) return null

  const periodLabel = `${format(report.periodStart.toDate(), 'dd/MM/yyyy', { locale: ptBR })} até ${format(report.periodEnd.toDate(), 'dd/MM/yyyy', { locale: ptBR })}`

  const handleCopy = async () => {
    if (!report.weeklyText) return
    try {
      await navigator.clipboard.writeText(report.weeklyText)
      toast.success('Texto copiado')
    } catch {
      toast.error('Não foi possível copiar — copie manualmente')
    }
  }

  return (
    <Modal open={!!report} onClose={onClose} title={`Relatório Semanal — ${clientName}`} width="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-slate-100 text-slate-600">{periodLabel}</Badge>
          {report.platforms.map((p) => (
            <Badge key={p} className="bg-blue-50 text-blue-600">{REPORT_PLATFORM_LABEL[p]}</Badge>
          ))}
          <span className="ml-auto text-xs text-slate-400">
            Gerado por {report.generatedByName} em {format(report.createdAt.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </span>
        </div>

        <textarea
          rows={14}
          readOnly
          value={report.weeklyText ?? ''}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[13px] leading-relaxed text-slate-700 outline-none"
        />
        <Button variant="secondary" icon={<Copy size={14} />} onClick={handleCopy} className="self-start">
          Copiar texto
        </Button>
      </div>
    </Modal>
  )
}

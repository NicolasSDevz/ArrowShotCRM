import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { X } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { ReportLineChart, type ChartSeries } from '../reports/ReportLineChart'
import { useRecentMetricsSnapshots } from '../../hooks/useMetricsSnapshot'

export interface ChurnedClientRow {
  id: string
  companyName: string
  churnReason?: string
  when: Date
  monthlyValue?: number
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Modal completo do Churn Rate — evolução histórica (a partir dos
 *  snapshots diários) + lista de TODOS os clientes que já deram churn (não
 *  só o mês atual, ao contrário do popup rápido do card). Aberto pelo ícone
 *  "i" do card Churn Rate (ver onInfoClick em MetricCard). */
export function ChurnDetailModal({
  open,
  onClose,
  churned,
  currentChurnRate,
}: {
  open: boolean
  onClose: () => void
  churned: ChurnedClientRow[]
  currentChurnRate: number
}) {
  const navigate = useNavigate()
  const { data: snapshots } = useRecentMetricsSnapshots(120)

  const chart = useMemo(() => {
    if (snapshots.length < 2) return null
    const labels = snapshots.map((s) => format(new Date(`${s.id}T12:00:00`), 'dd/MM'))
    const series: ChartSeries = {
      label: 'Taxa de Churn',
      color: '#DC2626',
      values: snapshots.map((s) => s.churnRate),
      format: (v) => `${v.toFixed(1)}%`,
    }
    return { labels, series }
  }, [snapshots])

  const totalValueLost = churned.reduce((sum, c) => sum + (c.monthlyValue ?? 0), 0)

  const goToClient = (id: string) => {
    onClose()
    navigate(`/clientes/${id}`)
  }

  return (
    <Modal open={open} onClose={onClose} title="Churn Rate — detalhes" width="max-w-2xl">
      <div className="flex flex-col gap-5">
        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          Taxa de churn atual: <span className="font-bold text-slate-900">{currentChurnRate.toFixed(1)}%</span>
          {' · '}
          {churned.length} cliente{churned.length === 1 ? '' : 's'} perdido{churned.length === 1 ? '' : 's'} no histórico
          {totalValueLost > 0 && (
            <>
              {' · '}
              <span className="font-bold text-red-600">{fmtBRL(totalValueLost)}</span> em MRR perdido ao todo
            </>
          )}
        </div>

        {chart && (
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Evolução da taxa de churn</p>
            <ReportLineChart labels={chart.labels} seriesA={chart.series} height={200} />
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Histórico completo de churn</p>
          {churned.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum cliente deu churn ainda. 🎉</p>
          ) : (
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {churned.map((c) => (
                <button
                  key={c.id}
                  onClick={() => goToClient(c.id)}
                  className="flex flex-col rounded-lg border border-slate-100 px-3 py-2 text-left transition-colors hover:bg-slate-50"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{c.companyName}</span>
                    <span className="shrink-0 text-xs text-slate-400">{format(c.when, 'dd/MM/yyyy', { locale: ptBR })}</span>
                  </span>
                  <span className="text-xs text-slate-500">{c.churnReason || 'Motivo não informado'}</span>
                  {c.monthlyValue != null && c.monthlyValue > 0 && (
                    <span className="mt-0.5 text-xs font-medium text-red-600">-{fmtBRL(c.monthlyValue)}/mês</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" icon={<X size={14} />} onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

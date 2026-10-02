import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { X } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { ReportLineChart, type ChartSeries } from '../reports/ReportLineChart'
import { useRecentMetricsSnapshots } from '../../hooks/useMetricsSnapshot'
import { usePrivacy } from '../../context/PrivacyContext'
import { CHURN_TYPE_LABEL, type Activity, type ChurnType } from '../../types'

export interface ChurnedClientRow {
  id: string
  companyName: string
  churnReason?: string
  churnType?: ChurnType
  /** Entra no Churn Rate? */
  counts: boolean
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
  currentMrr,
  upsells,
  downsells,
}: {
  open: boolean
  onClose: () => void
  churned: ChurnedClientRow[]
  currentChurnRate: number
  currentMrr: number
  upsells: Activity[]
  downsells: Activity[]
}) {
  const navigate = useNavigate()
  const { isPrivacyMode } = usePrivacy()
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

  const totalValueLost = churned.filter((c) => c.churnType !== 'completed').reduce((sum, c) => sum + (c.monthlyValue ?? 0), 0)

  /** Churn de Receita do mês: o dinheiro perdido, não a quantidade de
   *  clientes. Bruto = encerrados + reduções de contrato; Líquido = bruto
   *  menos o que entrou de upsell. Percentual sobre o MRR do início do mês
   *  (MRR atual + o que saiu - o que entrou). */
  const revenue = useMemo(() => {
    const start = startOfMonth(new Date())
    const inMonth = (d?: Date | null) => !!d && d >= start
    const lostChurn = churned.filter((c) => inMonth(c.when) && c.churnType !== 'completed').reduce((s, c) => s + (c.monthlyValue ?? 0), 0)
    const lostDownsell = downsells.filter((a) => inMonth(a.createdAt?.toDate?.())).reduce((s, a) => s + (a.amount ?? 0), 0)
    const gained = upsells.filter((a) => inMonth(a.createdAt?.toDate?.())).reduce((s, a) => s + (a.amount ?? 0), 0)
    const gross = lostChurn + lostDownsell
    const net = gross - gained
    const baseMrr = currentMrr + gross - gained
    return {
      lostChurn,
      lostDownsell,
      gained,
      gross,
      net,
      grossPct: baseMrr > 0 ? (gross / baseMrr) * 100 : 0,
      netPct: baseMrr > 0 ? (net / baseMrr) * 100 : 0,
    }
  }, [churned, upsells, downsells, currentMrr])
  const money = (v: number) => (isPrivacyMode ? 'R$ •.•••' : fmtBRL(v))
  const notCounted = churned.filter((c) => !c.counts).length

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
              <span className="font-bold text-red-600">{isPrivacyMode ? 'R$ ••.•••' : fmtBRL(totalValueLost)}</span> em MRR perdido ao todo
            </>
          )}
        </div>

        {notCounted > 0 && (
          <p className="-mt-3 text-xs text-slate-500">
            {notCounted} encerramento{notCounted === 1 ? '' : 's'} marcado{notCounted === 1 ? '' : 's'} para não contar na taxa (ex.: churn involuntário).
          </p>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Churn de Receita deste mês</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-red-100 bg-red-50 p-3">
              <p className="text-xs font-medium text-red-700">Bruto (Gross Revenue Churn)</p>
              <p className="text-xl font-bold text-red-700">
                {money(revenue.gross)} <span className="text-sm font-semibold">({revenue.grossPct.toFixed(1)}%)</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Encerrados {money(revenue.lostChurn)} · Reduções de contrato {money(revenue.lostDownsell)}
              </p>
            </div>
            <div className={`rounded-xl border p-3 ${revenue.net > 0 ? 'border-amber-100 bg-amber-50' : 'border-emerald-100 bg-emerald-50'}`}>
              <p className={`text-xs font-medium ${revenue.net > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>Líquido (Net Revenue Churn)</p>
              <p className={`text-xl font-bold ${revenue.net > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {money(revenue.net)} <span className="text-sm font-semibold">({revenue.netPct.toFixed(1)}%)</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">Bruto menos upsell do mês ({money(revenue.gained)}). Negativo = a carteira cresceu.</p>
            </div>
          </div>
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
                    <span className="font-semibold text-slate-900">{isPrivacyMode ? '••••••' : c.companyName}</span>
                    <span className="shrink-0 text-xs text-slate-400">{format(c.when, 'dd/MM/yyyy', { locale: ptBR })}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        c.churnType === 'completed' ? 'bg-emerald-50 text-emerald-700' : c.churnType ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {c.churnType ? CHURN_TYPE_LABEL[c.churnType] : 'Tipo não informado'}
                    </span>
                    {!c.counts && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">Não conta na taxa</span>
                    )}
                  </span>
                  <span className="text-xs text-slate-500">{c.churnReason || 'Motivo não informado'}</span>
                  {c.monthlyValue != null && c.monthlyValue > 0 && (
                    <span className="mt-0.5 text-xs font-medium text-red-600">-{isPrivacyMode ? 'R$ •.•••,••' : fmtBRL(c.monthlyValue)}/mês</span>
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

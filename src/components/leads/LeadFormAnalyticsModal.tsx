import { useEffect, useState, type ReactNode } from 'react'
import { X, Eye, Play, CheckCircle2, Percent, Clock, TrendingDown } from 'lucide-react'
import { Spinner } from '../ui/FullPageSpinner'
import { getLeadFormAnalytics, type LeadFormAnalytics } from '../../services/leadFormAnalyticsService'
import type { LeadForm } from '../../types/leadForm'

function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  const totalSeconds = Math.round(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function StatBlock({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-white/10 px-3 py-3 text-center">
      <div className="text-white/70">{icon}</div>
      <p className="text-xl font-extrabold text-white">{value}</p>
      <p className="text-[11px] text-white/70">{label}</p>
    </div>
  )
}

/** Painel de métricas de UM formulário — visualizações, início, respostas,
 *  taxa de conclusão, tempo médio e o funil de desistência por pergunta
 *  (quantas sessões chegaram em cada uma, na ordem do formulário). Dados
 *  vêm de leadFormEvents (ver leadFormAnalyticsService), gravados
 *  anonimamente pela própria página pública. Busca sob demanda (não é
 *  live) — reabrir/atualizar pega os números mais recentes. */
export function LeadFormAnalyticsModal({ open, onClose, form }: { open: boolean; onClose: () => void; form: LeadForm | null }) {
  const [data, setData] = useState<LeadFormAnalytics | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !form) return
    setLoading(true)
    setData(null)
    getLeadFormAnalytics(form.id, form.questions.map((q) => ({ id: q.id, label: q.label })))
      .then(setData)
      .finally(() => setLoading(false))
  }, [open, form])

  if (!open || !form) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-50 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-base font-semibold text-slate-800">Métricas — {form.name}</p>
            <p className="text-xs text-slate-400">/captura/{form.id}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-6 w-6" />
            </div>
          ) : !data ? null : (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-2 rounded-2xl p-4 sm:grid-cols-5" style={{ backgroundColor: '#334155' }}>
                <StatBlock icon={<Eye size={16} />} label="Visualizações" value={String(data.views)} />
                <StatBlock icon={<Play size={16} />} label="Início" value={String(data.starts)} />
                <StatBlock icon={<CheckCircle2 size={16} />} label="Respostas" value={String(data.submissions)} />
                <StatBlock icon={<Percent size={16} />} label="Taxa de conclusão" value={`${(data.completionRate * 100).toFixed(1)}%`} />
                <StatBlock icon={<Clock size={16} />} label="Tempo médio" value={formatDuration(data.avgDurationMs)} />
              </div>

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <TrendingDown size={14} className="text-slate-400" /> Funil por pergunta
                </p>
                {data.funnel.length === 0 ? (
                  <p className="text-sm text-slate-400">Sem perguntas pra mostrar no funil.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.funnel.map((step, i) => (
                      <div key={step.questionId} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-medium text-slate-700">
                            {i + 1}. {step.label || '(sem texto)'}
                          </p>
                          <p className="shrink-0 text-xs font-semibold text-slate-500">{step.views} viu</p>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-brand-500"
                            style={{ width: `${data.starts > 0 ? (step.views / data.starts) * 100 : 0}%` }}
                          />
                        </div>
                        {step.dropOff > 0 && (
                          <p className="mt-1 text-xs text-red-500">
                            -{step.dropOff} desistiram aqui ({step.dropOffPct.toFixed(0)}%)
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {data.views === 0 && (
                <p className="text-center text-sm text-slate-400">
                  Ainda sem visitas registradas. Os números aparecem assim que alguém abrir o link público.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

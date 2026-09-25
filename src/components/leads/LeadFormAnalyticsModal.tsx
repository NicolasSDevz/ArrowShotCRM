import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { X, Eye, Play, CheckCircle2, Clock, TrendingDown, RefreshCw, AlertTriangle, Eraser, UserPlus, Target } from 'lucide-react'
import { Spinner } from '../ui/FullPageSpinner'
import { getLeadFormAnalytics, type LeadFormAnalytics } from '../../services/leadFormAnalyticsService'
import { FORM_VIZ_STYLE, FormTrendChart, AnswerBars, type AnswerBreakdown } from './FormMetricsCharts'
import { visibleOptions, isChoiceType } from './leadFormMeta'
import type { LeadForm } from '../../types/leadForm'
import type { Lead } from '../../types/lead'

type Period = '7' | '30' | 'all'
const PERIOD_LABEL: Record<Period, string> = { '7': 'Últimos 7 dias', '30': 'Últimos 30 dias', all: 'Desde o início' }

function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  const totalSeconds = Math.round(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return m > 0 ? `${m}min ${String(s).padStart(2, '0')}s` : `${s}s`
}

const pct = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '—')

function Kpi({ icon, label, value, hint, tone = 'slate' }: { icon: ReactNode; label: string; value: string; hint?: string; tone?: 'slate' | 'blue' | 'green' | 'amber' | 'violet' }) {
  const toneClass = {
    slate: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
  }[tone]
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneClass}`}>{icon}</span>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <p className="text-2xl font-extrabold leading-tight text-slate-900">{value}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

function Section({ title, icon, children, hint }: { title: string; icon?: ReactNode; children: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        {icon}
        {title}
      </p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  )
}

/** "O que responderam": contagem por opção de cada pergunta de escolha, a
 *  partir das respostas guardadas nos leads que vieram pelo formulário. */
function buildAnswerBreakdowns(form: LeadForm, leads: Lead[]): AnswerBreakdown[] {
  return form.questions
    .filter((q) => isChoiceType(q.type))
    .map((q) => {
      const opts = visibleOptions(q)
      const answers = leads.map((l) => l.formAnswers?.find((a) => a.questionId === q.id)?.value).filter((v): v is string => !!v)
      const options = opts.map((o) => {
        const isOther = o.id === '__other__'
        const count = answers.filter((v) =>
          v.split(', ').some((part) => part === o.label || part === o.id || (isOther && part.startsWith(`${o.label}:`)))
        ).length
        return { label: o.label, count }
      })
      return { questionId: q.id, label: q.label, total: answers.length, options }
    })
    .filter((b) => b.options.length > 0)
}

/** Painel de métricas de UM formulário: números principais (visitas,
 *  começaram, enviaram, leads, conversão e tempo), gráfico por dia, funil,
 *  onde mais desistem, desistência por pergunta e o que as pessoas
 *  responderam nas perguntas de escolha. Filtra por período. */
export function LeadFormAnalyticsModal({
  open,
  onClose,
  form,
  leads = [],
  onClearData,
}: {
  open: boolean
  onClose: () => void
  form: LeadForm | null
  /** Todos os leads (o painel filtra os que vieram por este formulário). */
  leads?: Lead[]
  /** Abre o "Limpar dados" desse formulário. */
  onClearData?: (form: LeadForm) => void
}) {
  const [data, setData] = useState<LeadFormAnalytics | null>(null)
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState<Period>('30')
  const [reloadKey, setReloadKey] = useState(0)

  const since = useMemo(() => (period === 'all' ? undefined : new Date(Date.now() - (Number(period) - 1) * 24 * 60 * 60 * 1000)), [period])

  useEffect(() => {
    if (!open || !form) return
    setLoading(true)
    const start = since ? new Date(since.getFullYear(), since.getMonth(), since.getDate()) : undefined
    getLeadFormAnalytics(
      form.id,
      form.questions.map((q) => ({ id: q.id, label: q.label })),
      start
    )
      .then(setData)
      .finally(() => setLoading(false))
  }, [open, form, since, reloadKey])

  const formLeads = useMemo(() => {
    if (!form) return []
    const startMs = since ? new Date(since.getFullYear(), since.getMonth(), since.getDate()).getTime() : 0
    return leads.filter((l) => l.sourceFormId === form.id && (l.createdAt?.toMillis?.() ?? Date.now()) >= startMs)
  }, [leads, form, since])

  const answers = useMemo(() => (form ? buildAnswerBreakdowns(form, formLeads) : []), [form, formLeads])

  if (!open || !form) return null

  const worst = data?.funnel.reduce<(typeof data.funnel)[number] | null>((acc, s) => (s.dropOff > 0 && (!acc || s.dropOff > acc.dropOff) ? s : acc), null)
  const maxViews = data ? Math.max(data.starts, ...data.funnel.map((s) => s.views), 1) : 1

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <style>{FORM_VIZ_STYLE}</style>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-50 flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-slate-800">Métricas — {form.name}</p>
            <p className="text-xs text-slate-400">/captura/{form.id}</p>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${period === p ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
          <button onClick={() => setReloadKey((k) => k + 1)} title="Atualizar" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/60 p-5">
          {loading && !data ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-6 w-6" />
            </div>
          ) : !data ? null : data.views === 0 && formLeads.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm font-medium text-slate-600">Nenhuma visita em "{PERIOD_LABEL[period].toLowerCase()}".</p>
              <p className="mt-1 text-xs text-slate-400">Os números aparecem assim que alguém abrir o link público do formulário.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Kpi icon={<Eye size={15} />} label="Visualizações" value={String(data.views)} hint="Pessoas que abriram o link" />
                <Kpi icon={<Play size={15} />} label="Começaram" value={String(data.starts)} hint={`${pct(data.starts, data.views)} de quem abriu`} tone="blue" />
                <Kpi icon={<CheckCircle2 size={15} />} label="Enviaram" value={String(data.submissions)} hint={`${pct(data.submissions, data.starts)} de quem começou`} tone="green" />
                <Kpi icon={<UserPlus size={15} />} label="Leads recebidos" value={String(formLeads.length)} hint="Chegaram no pipeline de Leads" tone="violet" />
                <Kpi icon={<Target size={15} />} label="Conversão" value={pct(data.submissions, data.views)} hint="De quem abriu, quantos enviaram" tone="green" />
                <Kpi icon={<Clock size={15} />} label="Tempo médio" value={formatDuration(data.avgDurationMs)} hint="Pra responder tudo" tone="amber" />
              </div>

              <Section title="Movimento por dia" hint="Passe o mouse no gráfico pra ver os números de cada dia.">
                <FormTrendChart daily={data.daily} />
              </Section>

              <Section title="Resumo do funil">
                <div className="flex flex-col gap-2.5">
                  {[
                    { label: 'Abriram o link', value: data.views, color: 'var(--fm-s1)' },
                    { label: 'Começaram a responder', value: data.starts, color: 'var(--fm-s2)' },
                    { label: 'Enviaram as respostas', value: data.submissions, color: 'var(--fm-s3)' },
                  ].map((row) => (
                    <div key={row.label} className="fm-viz grid grid-cols-[175px_1fr_76px] items-center gap-3 text-sm">
                      <span className="truncate text-slate-600">{row.label}</span>
                      <div className="h-3 overflow-hidden rounded-full" style={{ background: 'var(--fm-track)' }}>
                        <div className="h-full rounded-full" style={{ width: `${(row.value / Math.max(data.views, 1)) * 100}%`, background: row.color }} />
                      </div>
                      <span className="text-right font-semibold tabular-nums text-slate-800">
                        {row.value} <span className="text-xs font-normal text-slate-400">{pct(row.value, data.views)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </Section>

              {worst && worst.dropOff > 0 && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <p>
                    <strong>Onde mais desistem:</strong> "{worst.label || 'pergunta sem texto'}" — {worst.dropOff} pessoa(s) pararam aqui ({worst.dropOffPct.toFixed(0)}%). Vale
                    simplificar essa pergunta ou deixar ela opcional.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Section title="Pergunta por pergunta" icon={<TrendingDown size={14} className="text-slate-400" />} hint="Quantas pessoas chegaram em cada pergunta.">
                  {data.funnel.length === 0 ? (
                    <p className="text-sm text-slate-400">Sem perguntas pra mostrar.</p>
                  ) : (
                    <div className="fm-viz flex flex-col divide-y divide-slate-100">
                      {data.funnel.map((step, i) => {
                        const isWorst = worst?.questionId === step.questionId
                        return (
                          <div key={step.questionId} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 py-2">
                            <p className="min-w-0 truncate text-sm text-slate-700">
                              <span className="mr-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-slate-100 px-1 text-[10px] font-bold text-slate-500">{i + 1}</span>
                              {step.label || '(sem texto)'}
                            </p>
                            <p className="text-right text-xs tabular-nums text-slate-500">
                              <span className="font-semibold text-slate-800">{step.views}</span>
                              {step.dropOff > 0 && <span className={`ml-2 font-semibold ${isWorst ? 'text-amber-600' : 'text-red-500'}`}>−{step.dropOff}</span>}
                            </p>
                            <div className="col-span-2 h-2 overflow-hidden rounded-full" style={{ background: 'var(--fm-track)' }}>
                              <div className="h-full rounded-full" style={{ width: `${(step.views / maxViews) * 100}%`, background: isWorst ? '#F59E0B' : 'var(--fm-s1)' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Section>

                <Section title="O que responderam" hint="Nas perguntas de escolha, dos leads recebidos no período.">
                  {answers.length === 0 ? (
                    <p className="text-sm text-slate-400">{formLeads.length === 0 ? 'Nenhum lead recebido no período.' : 'Este formulário não tem perguntas de escolha.'}</p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {answers.map((a) => (
                        <AnswerBars key={a.questionId} item={a} />
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            </div>
          )}
        </div>

        {onClearData && (
          <div className="flex justify-end border-t border-slate-100 px-5 py-3">
            <button type="button" onClick={() => onClearData(form)} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600">
              <Eraser size={13} /> Limpar dados de teste
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

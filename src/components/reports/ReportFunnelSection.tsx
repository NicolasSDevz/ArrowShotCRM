import { useEffect, useState, type ReactNode } from 'react'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { Save, ChevronDown, TrendingUp, Wallet, Tag, Target, Handshake, Percent } from 'lucide-react'
import { Field, Input, Select } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { updateReportFunnel } from '../../services/reportService'
import { maskCurrencyInput, parseCurrencyToNumber } from '../../utils/masks'
import {
  getBenchmarkLevel,
  getStageThreshold,
  getStageRange,
  percentOf,
  divide,
  type BenchmarkLevel,
} from '../../utils/salesFunnelCalc'
import {
  SALES_FUNNEL_NETWORK_LABEL,
  SALES_FUNNEL_SERVICE_LABEL,
  type Report,
  type ReportFunnel,
  type SalesFunnelNetwork,
  type SalesFunnelService,
} from '../../types'

const INPUT_STYLE = { height: '40px' }

const toPositiveInt = (v: string): number | undefined => {
  if (v === '') return undefined
  const n = Math.floor(Number(v))
  return Number.isNaN(n) || n < 0 ? undefined : n
}
const moneyMask = (v?: number) => (v == null ? '' : maskCurrencyInput(String(Math.round(v * 100))))
const fmtBRL = (v?: number) => (v == null || Number.isNaN(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const fmtPct = (v?: number) => (v == null || Number.isNaN(v) ? '—' : `${v.toFixed(1)}%`)
const fmtInt = (v?: number) => (v == null || Number.isNaN(v) ? '—' : Math.round(v).toLocaleString('pt-BR'))

function stageColor(level: BenchmarkLevel): string {
  if (level === 'yellow') return '#F59E0B'
  if (level === 'red') return '#EF4444'
  return '#10B981'
}

interface StageData {
  label: string
  value?: number
  percent?: number
  level: BenchmarkLevel
}

function FunnelVisual({ stages, baseline }: { stages: StageData[]; baseline: number }) {
  const placeholder = [100, 88, 74, 60, 48, 36, 24]
  return (
    <div className="flex flex-col items-center">
      {stages.map((s, i) => {
        const width =
          baseline > 0 ? (s.value ? Math.min(100, Math.max(14, (s.value / baseline) * 100)) : 14) : placeholder[i]
        return (
          <div key={s.label} className="flex w-full flex-col items-center">
            <div
              className="flex flex-col items-center justify-center py-2.5 text-center text-white transition-all duration-300"
              style={{
                width: `${width}%`,
                minWidth: '38%',
                backgroundColor: stageColor(s.level),
                clipPath: 'polygon(4% 0, 96% 0, 100% 100%, 0% 100%)',
              }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide">{s.label}</span>
              <span className="text-sm font-bold">
                {fmtInt(s.value)}
                {s.percent != null && <span className="font-medium opacity-90"> · {s.percent.toFixed(1)}%</span>}
              </span>
            </div>
            {i < stages.length - 1 && <ChevronDown size={14} className="my-0.5 shrink-0 text-slate-300" />}
          </div>
        )
      })}
    </div>
  )
}

function MetricCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone?: 'good' | 'bad' }) {
  const cls = tone === 'good' ? 'text-emerald-500' : tone === 'bad' ? 'text-red-500' : 'text-[#0F172A]'
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-slate-400">{icon}</div>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${cls}`}>{value}</p>
    </div>
  )
}

function GoalBar({ label, actualText, pct }: { label: string; actualText: string; pct?: number }) {
  const barPct = pct != null ? Math.min(100, Math.max(0, pct)) : 0
  const color = pct != null && pct >= 100 ? '#10B981' : '#2563EB'
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="font-medium">{label}</span>
        <span>{actualText}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#E2E8F0]">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${barPct}%`, backgroundColor: color }} />
        </div>
        <span className="w-11 shrink-0 text-right text-xs font-semibold text-slate-600">
          {pct != null ? `${pct.toFixed(0)}%` : '—'}
        </span>
      </div>
    </div>
  )
}

interface FormState {
  rede?: SalesFunnelNetwork
  servico?: SalesFunnelService
  visitasAgendadas?: number
  visitasRealizadas?: number
  fechamentos?: number
  faturamentoTotalStr: string
  custoOperacionalStr: string
  metaFaturamentoStr: string
  metaFechamentos?: number
  metaLeads?: number
}

function buildForm(report: Report): FormState {
  const f = report.funnel
  return {
    rede: f?.rede ?? (report.platforms.includes('meta') ? 'meta_ads' : undefined),
    servico: f?.servico,
    visitasAgendadas: f?.visitasAgendadas,
    visitasRealizadas: f?.visitasRealizadas,
    fechamentos: f?.fechamentos,
    faturamentoTotalStr: moneyMask(f?.faturamentoTotal),
    custoOperacionalStr: moneyMask(f?.custoOperacional),
    metaFaturamentoStr: moneyMask(f?.metaFaturamento),
    metaFechamentos: f?.metaFechamentos,
    metaLeads: f?.metaLeads,
  }
}

export function ReportFunnelSection({ report, editable = true }: { report: Report; editable?: boolean }) {
  const { profile } = useAuth()
  const [form, setForm] = useState<FormState>(buildForm(report))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(buildForm(report))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id, report.funnel])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((s) => ({ ...s, [k]: v }))

  // --- dados automáticos (API do Meta) ---
  const cur = report.meta?.metrics.current ?? {}
  const investimentoAds = cur.spend
  const impressoes = cur.impressions
  const alcance = cur.reach
  const cliquesLink = cur.linkClicks ?? cur.clicks
  const conversas = cur.conversations

  // --- dados manuais ---
  const faturamentoTotal = parseCurrencyToNumber(form.faturamentoTotalStr)
  const custoOperacional = parseCurrencyToNumber(form.custoOperacionalStr)
  const metaFaturamento = parseCurrencyToNumber(form.metaFaturamentoStr)
  const { visitasAgendadas, visitasRealizadas, fechamentos, metaFechamentos, metaLeads } = form

  // --- % de cada etapa (sobre a anterior) ---
  const pCliques = percentOf(cliquesLink, impressoes)
  const pConversas = percentOf(conversas, cliquesLink)
  const pAgendadas = percentOf(visitasAgendadas, conversas)
  const pRealizadas = percentOf(visitasRealizadas, visitasAgendadas)
  const pFechamentos = percentOf(fechamentos, visitasRealizadas)

  const th = (stage: Parameters<typeof getStageThreshold>[0]) => getStageThreshold(stage, form.rede, form.servico)

  const stages: StageData[] = [
    { label: 'Impressões', value: impressoes, level: null },
    { label: 'Alcance', value: alcance, percent: percentOf(alcance, impressoes), level: null },
    { label: 'Cliques no link', value: cliquesLink, percent: pCliques, level: getBenchmarkLevel(pCliques, th('ctr')) },
    { label: 'Conversas iniciadas', value: conversas, percent: pConversas, level: getBenchmarkLevel(pConversas, th('conversao')) },
    { label: 'Visitas agendadas', value: visitasAgendadas, percent: pAgendadas, level: getBenchmarkLevel(pAgendadas, th('qualificacao')) },
    { label: 'Visitas realizadas', value: visitasRealizadas, percent: pRealizadas, level: getBenchmarkLevel(pRealizadas, th('visita')) },
    { label: 'Fechamentos', value: fechamentos, percent: pFechamentos, level: getBenchmarkLevel(pFechamentos, th('fechamento')) },
  ]

  // --- métricas financeiras ---
  const lucroLiquido = faturamentoTotal != null ? faturamentoTotal - (investimentoAds ?? 0) - (custoOperacional ?? 0) : undefined
  const roi = investimentoAds && lucroLiquido != null ? (lucroLiquido / investimentoAds) * 100 : undefined
  const ticketMedio = divide(faturamentoTotal, fechamentos)
  const custoPorLead = divide(investimentoAds, conversas)
  const custoPorContrato = divide(investimentoAds, fechamentos)
  const conversaoLeadVenda = percentOf(fechamentos, conversas)
  const comparecimento = percentOf(visitasRealizadas, visitasAgendadas)

  // --- metas ---
  const pctFat = faturamentoTotal && metaFaturamento ? (faturamentoTotal / metaFaturamento) * 100 : undefined
  const pctFech = fechamentos && metaFechamentos ? (fechamentos / metaFechamentos) * 100 : undefined
  const pctLeads = conversas && metaLeads ? (conversas / metaLeads) * 100 : undefined

  // --- diagnóstico automático ---
  const alerts: string[] = []
  if (form.rede) {
    const range = getStageRange('ctr', form.rede)
    if (pCliques != null && range && pCliques < range.min) {
      alerts.push(
        `⚠️ Taxa de cliques abaixo do esperado para ${SALES_FUNNEL_NETWORK_LABEL[form.rede]} — revise segmentação e criativos. (atual: ${pCliques.toFixed(1)}%, esperado: ${range.min}%–${range.max}%)`
      )
    }
  }
  if (conversaoLeadVenda != null && conversaoLeadVenda < 10) {
    alerts.push(
      `⚠️ Conversão de conversa para venda abaixo do mínimo — avalie agendamento, visita e fechamento. (atual: ${conversaoLeadVenda.toFixed(1)}%, mínimo: 10%)`
    )
  }
  if (comparecimento != null && comparecimento < 70) {
    alerts.push(
      `⚠️ Alto no-show nas visitas — confirme por WhatsApp 24h antes. (atual: ${comparecimento.toFixed(1)}%, ideal: acima de 70%)`
    )
  }
  if (pAgendadas != null && pAgendadas < 20) {
    alerts.push(
      `⚠️ Poucas conversas viram visita agendada — reforce a abordagem e a qualificação no atendimento. (atual: ${pAgendadas.toFixed(1)}%, meta: 20%)`
    )
  }

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    try {
      const payload: ReportFunnel = {
        rede: form.rede,
        servico: form.servico,
        visitasAgendadas: form.visitasAgendadas,
        visitasRealizadas: form.visitasRealizadas,
        fechamentos: form.fechamentos,
        faturamentoTotal,
        custoOperacional,
        metaFaturamento,
        metaFechamentos: form.metaFechamentos,
        metaLeads: form.metaLeads,
        preenchidoPor: profile.name,
        filledAt: Timestamp.now(),
      }
      await updateReportFunnel(report, payload, profile.id, profile.name)
      toast.success('Dados do funil salvos')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar os dados do funil')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {editable && (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
          <p className="mb-3 text-[13px] font-semibold text-slate-600">Preencher antes da apresentação</p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Rede de anúncios">
              <Select style={INPUT_STYLE} value={form.rede ?? ''} onChange={(e) => set('rede', (e.target.value || undefined) as SalesFunnelNetwork)}>
                <option value="">Selecione...</option>
                {(Object.entries(SALES_FUNNEL_NETWORK_LABEL) as [SalesFunnelNetwork, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo de oferta / serviço">
              <Select style={INPUT_STYLE} value={form.servico ?? ''} onChange={(e) => set('servico', (e.target.value || undefined) as SalesFunnelService)}>
                <option value="">Selecione...</option>
                {(Object.entries(SALES_FUNNEL_SERVICE_LABEL) as [SalesFunnelService, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
          </div>

          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Dados do time comercial</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Visitas agendadas">
              <Input style={INPUT_STYLE} type="number" min="0" step="1" value={form.visitasAgendadas ?? ''} onChange={(e) => set('visitasAgendadas', toPositiveInt(e.target.value))} />
            </Field>
            <Field label="Visitas realizadas">
              <Input style={INPUT_STYLE} type="number" min="0" step="1" value={form.visitasRealizadas ?? ''} onChange={(e) => set('visitasRealizadas', toPositiveInt(e.target.value))} />
            </Field>
            <Field label="Fechamentos">
              <Input style={INPUT_STYLE} type="number" min="0" step="1" value={form.fechamentos ?? ''} onChange={(e) => set('fechamentos', toPositiveInt(e.target.value))} />
            </Field>
            <Field label="Faturamento total (R$)">
              <Input style={INPUT_STYLE} value={form.faturamentoTotalStr} onChange={(e) => set('faturamentoTotalStr', maskCurrencyInput(e.target.value))} placeholder="R$ 0,00" />
            </Field>
            <Field label="Custo operacional (R$)">
              <Input style={INPUT_STYLE} value={form.custoOperacionalStr} onChange={(e) => set('custoOperacionalStr', maskCurrencyInput(e.target.value))} placeholder="R$ 0,00" />
            </Field>
          </div>

          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Metas do período</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Meta de faturamento (R$)">
              <Input style={INPUT_STYLE} value={form.metaFaturamentoStr} onChange={(e) => set('metaFaturamentoStr', maskCurrencyInput(e.target.value))} placeholder="R$ 0,00" />
            </Field>
            <Field label="Meta de fechamentos">
              <Input style={INPUT_STYLE} type="number" min="0" step="1" value={form.metaFechamentos ?? ''} onChange={(e) => set('metaFechamentos', toPositiveInt(e.target.value))} />
            </Field>
            <Field label="Meta de leads">
              <Input style={INPUT_STYLE} type="number" min="0" step="1" value={form.metaLeads ?? ''} onChange={(e) => set('metaLeads', toPositiveInt(e.target.value))} />
            </Field>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button icon={<Save size={14} />} onClick={handleSave} loading={saving}>
              Salvar dados do funil
            </Button>
            {report.funnel?.filledAt && (
              <span className="text-xs text-slate-400">
                Última vez por {report.funnel.preenchidoPor} — {report.funnel.filledAt.toDate().toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* FUNIL VISUAL */}
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Funil — do anúncio ao contrato</p>
        <FunnelVisual stages={stages} baseline={impressoes ?? 0} />
        <p className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#10B981]" /> Dentro do esperado</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#F59E0B]" /> Abaixo</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#EF4444]" /> Muito abaixo</span>
        </p>
      </div>

      {/* MÉTRICAS FINANCEIRAS */}
      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Métricas financeiras</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricCard icon={<TrendingUp size={20} />} label="ROI" value={fmtPct(roi)} tone={roi == null ? undefined : roi > 0 ? 'good' : roi < 0 ? 'bad' : undefined} />
          <MetricCard icon={<Wallet size={20} />} label="Lucro líquido" value={fmtBRL(lucroLiquido)} tone={lucroLiquido == null ? undefined : lucroLiquido > 0 ? 'good' : lucroLiquido < 0 ? 'bad' : undefined} />
          <MetricCard icon={<Tag size={20} />} label="Ticket médio" value={fmtBRL(ticketMedio)} />
          <MetricCard icon={<Target size={20} />} label="Custo por lead" value={fmtBRL(custoPorLead)} />
          <MetricCard icon={<Handshake size={20} />} label="Custo por contrato" value={fmtBRL(custoPorContrato)} />
          <MetricCard icon={<Percent size={20} />} label="Conversão lead → venda" value={fmtPct(conversaoLeadVenda)} tone={conversaoLeadVenda == null ? undefined : conversaoLeadVenda >= 10 ? 'good' : 'bad'} />
        </div>
      </div>

      {/* METAS */}
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Metas do período</p>
        <div className="flex flex-col gap-3">
          <GoalBar label="Meta de faturamento" actualText={`${fmtBRL(faturamentoTotal)} / ${fmtBRL(metaFaturamento)}`} pct={pctFat} />
          <GoalBar label="Meta de fechamentos" actualText={`${fmtInt(fechamentos)} / ${fmtInt(metaFechamentos)}`} pct={pctFech} />
          <GoalBar label="Meta de leads" actualText={`${fmtInt(conversas)} / ${fmtInt(metaLeads)}`} pct={pctLeads} />
        </div>
      </div>

      {/* DIAGNÓSTICO */}
      <div
        className="rounded-2xl border p-4"
        style={alerts.length > 0 ? { backgroundColor: '#FEF9EC', borderColor: '#F59E0B' } : { backgroundColor: '#ECFDF5', borderColor: '#10B981' }}
      >
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Diagnóstico automático</p>
        {alerts.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm text-slate-700">
            {alerts.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-emerald-700">✅ Funil saudável — indicadores dentro do esperado.</p>
        )}
      </div>
    </div>
  )
}

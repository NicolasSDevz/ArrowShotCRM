import { useEffect, useState, type ReactNode } from 'react'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Save, ChevronDown, TrendingUp, Wallet, Tag, Target, Handshake, Percent } from 'lucide-react'
import { Field, Input, Select } from '../ui/Field'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { updateClient } from '../../services/clientService'
import { createNotification } from '../../services/notificationService'
import { findUserIdByName } from '../../utils/userLookup'
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
  SALES_FUNNEL_META_OBJECTIVE_LABEL,
  type Client,
  type SalesFunnel,
  type SalesFunnelCaptacao,
  type SalesFunnelNetwork,
  type SalesFunnelService,
  type SalesFunnelMetaObjective,
} from '../../types'

const INPUT_STYLE = { height: '40px' }

function toPositiveInt(v: string): number | undefined {
  if (v === '') return undefined
  const n = Math.floor(Number(v))
  if (Number.isNaN(n) || n < 0) return undefined
  return n
}

function moneyToMasked(v?: number): string {
  if (v == null) return ''
  return maskCurrencyInput(String(Math.round(v * 100)))
}

function fmtBRLorDash(v?: number): string {
  if (v == null || v === 0 || Number.isNaN(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtPercentOrDash(v?: number): string {
  if (v == null || Number.isNaN(v)) return '—'
  return `${v.toFixed(1)}%`
}

function fmtIntOrDash(v?: number): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('pt-BR')
}

interface FormState {
  rede?: SalesFunnelNetwork
  servico?: SalesFunnelService
  metaObjetivo?: SalesFunnelMetaObjective
  captacao: SalesFunnelCaptacao
  investimentoAdsStr: string
  faturamentoTotalStr: string
  custoOperacionalStr: string
  metaFaturamentoStr: string
  metaFechamentos?: number
  metaLeads?: number
}

function buildInitialForm(client: Client): FormState {
  const sf = client.salesFunnel
  return {
    rede: sf?.rede,
    servico: sf?.servico,
    metaObjetivo: sf?.metaObjetivo,
    captacao: { ...sf?.captacao },
    investimentoAdsStr: moneyToMasked(sf?.financeiro?.investimentoAds),
    faturamentoTotalStr: moneyToMasked(sf?.financeiro?.faturamentoTotal),
    custoOperacionalStr: moneyToMasked(sf?.financeiro?.custoOperacional),
    metaFaturamentoStr: moneyToMasked(sf?.metas?.metaFaturamento),
    metaFechamentos: sf?.metas?.metaFechamentos,
    metaLeads: sf?.metas?.metaLeads,
  }
}

/** Card branco padrão da coluna esquerda/direita — fundo branco, borda
 *  #E2E8F0, cantos de 16px, sombra sutil. */
function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>
}

function CardTitle({ children }: { children: string }) {
  return <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{children}</p>
}

function stageColor(level: BenchmarkLevel): string {
  if (level === 'yellow') return '#F59E0B'
  if (level === 'red') return '#EF4444'
  // 'green' e null (sem benchmark calculável, ex.: primeira etapa ou
  // rede ainda não selecionada) usam o mesmo verde neutro/positivo.
  return '#10B981'
}

interface FunnelStageData {
  label: string
  value?: number
  percent?: number
  level: BenchmarkLevel
}

/** Bloco 1 — funil visual: 6 etapas empilhadas em trapézio invertido, largura
 *  proporcional ao volume relativo às Impressões, cor por benchmark. */
function FunnelVisual({ stages, baseline }: { stages: FunnelStageData[]; baseline: number }) {
  const placeholderWidths = [100, 85, 70, 58, 46, 34]

  return (
    <div className="flex flex-col items-center">
      {stages.map((stage, i) => {
        const width =
          baseline > 0
            ? stage.value
              ? Math.min(100, Math.max(16, (stage.value / baseline) * 100))
              : 16
            : placeholderWidths[i]
        return (
          <div key={stage.label} className="flex w-full flex-col items-center">
            <div
              className="flex flex-col items-center justify-center py-2.5 text-center text-white transition-all duration-300"
              style={{
                width: `${width}%`,
                minWidth: '40%',
                backgroundColor: stageColor(stage.level),
                clipPath: 'polygon(4% 0, 96% 0, 100% 100%, 0% 100%)',
              }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide">{stage.label}</span>
              <span className="text-sm font-bold">
                {fmtIntOrDash(stage.value)}
                {stage.percent != null && <span className="font-medium opacity-90"> · {stage.percent.toFixed(1)}%</span>}
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
  const toneClass = tone === 'good' ? 'text-emerald-500' : tone === 'bad' ? 'text-red-500' : 'text-[#0F172A]'
  return (
    <Card>
      <div className="text-slate-400">{icon}</div>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${toneClass}`}>{value}</p>
    </Card>
  )
}

function GoalBar({ label, actualText, pct }: { label: string; actualText: string; pct?: number }) {
  const barPct = pct != null ? Math.min(100, Math.max(0, pct)) : 0
  const barColor = pct != null && pct >= 100 ? '#10B981' : '#2563EB'
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="font-medium">{label}</span>
        <span>{actualText}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#E2E8F0]">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${barPct}%`, backgroundColor: barColor }}
          />
        </div>
        <span className="w-11 shrink-0 text-right text-xs font-semibold text-slate-600">
          {pct != null ? `${pct.toFixed(0)}%` : '—'}
        </span>
      </div>
    </div>
  )
}

export function ClientSalesFunnelPanel({ client }: { client: Client }) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const [form, setForm] = useState<FormState>(buildInitialForm(client))
  const [saving, setSaving] = useState(false)

  // Resync only on client switch — see ClientBriefingPanel: depending on the
  // sub-object identity would wipe unsaved edits on every `clients` snapshot.
  useEffect(() => {
    setForm(buildInitialForm(client))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  const setCaptacao = <K extends keyof SalesFunnelCaptacao>(key: K, value: SalesFunnelCaptacao[K]) =>
    setForm((f) => ({ ...f, captacao: { ...f.captacao, [key]: value } }))

  const c = form.captacao
  const investimentoAds = parseCurrencyToNumber(form.investimentoAdsStr)
  const faturamentoTotal = parseCurrencyToNumber(form.faturamentoTotalStr)
  const custoOperacional = parseCurrencyToNumber(form.custoOperacionalStr)
  const metaFaturamento = parseCurrencyToNumber(form.metaFaturamentoStr)

  // Jornada do cliente — % sempre em relação à etapa anterior.
  const ctrPercent = percentOf(c.cliques, c.impressoes)
  const conversaoPercent = percentOf(c.conversoes, c.cliques)
  const qualificacaoPercent = percentOf(c.qualificados, c.conversoes)
  const visitaPercent = percentOf(c.visitasRealizadas, c.qualificados)
  const fechamentoPercent = percentOf(c.fechamentos, c.visitasRealizadas)

  const ctrLevel = getBenchmarkLevel(ctrPercent, getStageThreshold('ctr', form.rede, form.servico, form.metaObjetivo))
  const conversaoLevel = getBenchmarkLevel(conversaoPercent, getStageThreshold('conversao', form.rede, form.servico, form.metaObjetivo))
  const qualificacaoLevel = getBenchmarkLevel(
    qualificacaoPercent,
    getStageThreshold('qualificacao', form.rede, form.servico, form.metaObjetivo)
  )
  const visitaLevel = getBenchmarkLevel(visitaPercent, getStageThreshold('visita', form.rede, form.servico, form.metaObjetivo))
  const fechamentoLevel = getBenchmarkLevel(
    fechamentoPercent,
    getStageThreshold('fechamento', form.rede, form.servico, form.metaObjetivo)
  )

  const funnelStages: FunnelStageData[] = [
    { label: 'Impressões', value: c.impressoes, level: null },
    { label: 'Cliques', value: c.cliques, percent: ctrPercent, level: ctrLevel },
    { label: 'Conversões', value: c.conversoes, percent: conversaoPercent, level: conversaoLevel },
    { label: 'Qualificados', value: c.qualificados, percent: qualificacaoPercent, level: qualificacaoLevel },
    { label: 'Visita Técnica', value: c.visitasRealizadas, percent: visitaPercent, level: visitaLevel },
    { label: 'Fechamento', value: c.fechamentos, percent: fechamentoPercent, level: fechamentoLevel },
  ]

  // Métricas financeiras
  const lucroLiquido = faturamentoTotal ? faturamentoTotal - (investimentoAds ?? 0) - (custoOperacional ?? 0) : undefined
  const roi = investimentoAds && lucroLiquido != null ? (lucroLiquido / investimentoAds) * 100 : undefined
  const ticketMedio = divide(faturamentoTotal, c.fechamentos)
  const custoPorLead = divide(investimentoAds, c.cliques)
  const custoPorContrato = divide(investimentoAds, c.fechamentos)
  const conversaoLeadVenda = percentOf(c.fechamentos, c.cliques)
  const comparecimentoVisita = percentOf(c.visitasRealizadas, c.visitasAgendadas)

  // Metas do período
  const pctFaturamento = faturamentoTotal && metaFaturamento ? (faturamentoTotal / metaFaturamento) * 100 : undefined
  const pctFechamentos = c.fechamentos && form.metaFechamentos ? (c.fechamentos / form.metaFechamentos) * 100 : undefined
  const pctLeads = c.cliques && form.metaLeads ? (c.cliques / form.metaLeads) * 100 : undefined

  // Diagnóstico automático
  const alerts: string[] = []
  if (form.rede) {
    const ctrRange = getStageRange('ctr', form.rede, form.metaObjetivo)
    if (ctrPercent != null && ctrRange && ctrPercent < ctrRange.min) {
      alerts.push(
        `⚠️ CTR abaixo do esperado para ${SALES_FUNNEL_NETWORK_LABEL[form.rede]} — revise segmentação e criativos. (atual: ${ctrPercent.toFixed(1)}%, esperado: ${ctrRange.min}%–${ctrRange.max}%)`
      )
    }
  }
  if (conversaoLeadVenda != null && conversaoLeadVenda < 10) {
    alerts.push(
      `⚠️ Conversão geral de lead para venda abaixo do mínimo — avalie qualificação, visita técnica e fechamento em conjunto. (atual: ${conversaoLeadVenda.toFixed(1)}%, mínimo: 10%)`
    )
  }
  const qualificadosSobreLeads = percentOf(c.qualificados, c.cliques)
  if (qualificadosSobreLeads != null && qualificadosSobreLeads < 30) {
    alerts.push(
      `⚠️ Poucos leads qualificados — reforce os critérios de triagem na abordagem inicial. (atual: ${qualificadosSobreLeads.toFixed(1)}%, meta: 30%)`
    )
  }
  if (comparecimentoVisita != null && comparecimentoVisita < 70) {
    alerts.push(
      `⚠️ Alto índice de no-show nas visitas — considere confirmação por WhatsApp 24h antes. (atual: ${comparecimentoVisita.toFixed(1)}%, ideal: acima de 70%)`
    )
  }

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    try {
      const payload: SalesFunnel = {
        rede: form.rede,
        servico: form.servico,
        metaObjetivo: form.rede === 'meta_ads' ? form.metaObjetivo : undefined,
        captacao: form.captacao,
        financeiro: {
          investimentoAds,
          faturamentoTotal,
          custoOperacional,
        },
        metas: {
          metaFaturamento,
          metaFechamentos: form.metaFechamentos,
          metaLeads: form.metaLeads,
        },
        preenchidoPor: profile.name,
        filledAt: Timestamp.now(),
      }
      await updateClient(client.id, { salesFunnel: payload }, profile.id, profile.name)

      const brunoId = findUserIdByName(users, 'Bruno')
      if (brunoId && brunoId !== profile.id) {
        const dateLabel = format(new Date(), 'dd/MM/yyyy', { locale: ptBR })
        await createNotification({
          userId: brunoId,
          type: 'funnel_saved',
          message: `📊 Funil comercial atualizado — ${client.companyName}\nSalvo por ${profile.name} em ${dateLabel}`,
          actorName: profile.name,
          entityType: 'client',
          entityId: client.id,
        })
      }

      toast.success('Funil comercial salvo')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar funil comercial')
    } finally {
      setSaving(false)
    }
  }

  const lastFilled = client.salesFunnel?.filledAt

  return (
    <div className="-mx-5 -my-4 rounded-b-xl bg-[#F8FAFC] px-5 py-4 text-[#0F172A]">
      <p className="mb-6 text-xs text-slate-400">
        Cálculos em tempo real — nada é salvo automaticamente.
        {lastFilled && (
          <>
            {' '}
            Última vez salvo por <strong>{client.salesFunnel?.preenchidoPor}</strong> em{' '}
            {format(lastFilled.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
          </>
        )}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr] lg:items-start">
        {/* COLUNA ESQUERDA (40%) — INPUTS */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle>Parâmetros de mercado</CardTitle>
            <div className="flex flex-col gap-3">
              <Field label="Rede de anúncios">
                <Select
                  style={INPUT_STYLE}
                  value={form.rede ?? ''}
                  onChange={(e) => set('rede', (e.target.value || undefined) as SalesFunnelNetwork)}
                >
                  <option value="">Selecione...</option>
                  {(Object.entries(SALES_FUNNEL_NETWORK_LABEL) as [SalesFunnelNetwork, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Tipo de oferta / serviço">
                <Select
                  style={INPUT_STYLE}
                  value={form.servico ?? ''}
                  onChange={(e) => set('servico', (e.target.value || undefined) as SalesFunnelService)}
                >
                  <option value="">Selecione...</option>
                  {(Object.entries(SALES_FUNNEL_SERVICE_LABEL) as [SalesFunnelService, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
              </Field>
              {form.rede === 'meta_ads' && (
                <Field label="Objetivo da campanha">
                  <Select
                    style={INPUT_STYLE}
                    value={form.metaObjetivo ?? ''}
                    onChange={(e) => set('metaObjetivo', (e.target.value || undefined) as SalesFunnelMetaObjective)}
                  >
                    <option value="">Selecione...</option>
                    {(Object.entries(SALES_FUNNEL_META_OBJECTIVE_LABEL) as [SalesFunnelMetaObjective, string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>Funil de captação</CardTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Impressões / Visitantes">
                <Input
                  style={INPUT_STYLE}
                  type="number"
                  min="0"
                  step="1"
                  value={c.impressoes ?? ''}
                  onChange={(e) => setCaptacao('impressoes', toPositiveInt(e.target.value))}
                />
              </Field>
              <Field label="Cliques / Leads">
                <Input
                  style={INPUT_STYLE}
                  type="number"
                  min="0"
                  step="1"
                  value={c.cliques ?? ''}
                  onChange={(e) => setCaptacao('cliques', toPositiveInt(e.target.value))}
                />
              </Field>
              <Field label="Conversões (abordagens)">
                <Input
                  style={INPUT_STYLE}
                  type="number"
                  min="0"
                  step="1"
                  value={c.conversoes ?? ''}
                  onChange={(e) => setCaptacao('conversoes', toPositiveInt(e.target.value))}
                />
              </Field>
              <Field label="Qualificados">
                <Input
                  style={INPUT_STYLE}
                  type="number"
                  min="0"
                  step="1"
                  value={c.qualificados ?? ''}
                  onChange={(e) => setCaptacao('qualificados', toPositiveInt(e.target.value))}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle>Visita técnica e fechamento</CardTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Visitas agendadas">
                <Input
                  style={INPUT_STYLE}
                  type="number"
                  min="0"
                  step="1"
                  value={c.visitasAgendadas ?? ''}
                  onChange={(e) => setCaptacao('visitasAgendadas', toPositiveInt(e.target.value))}
                />
              </Field>
              <div>
                <Field label="Visitas realizadas">
                  <Input
                    style={INPUT_STYLE}
                    type="number"
                    min="0"
                    step="1"
                    value={c.visitasRealizadas ?? ''}
                    onChange={(e) => setCaptacao('visitasRealizadas', toPositiveInt(e.target.value))}
                  />
                </Field>
                <p className="mt-1 text-xs text-slate-400">Separar do agendado revela o no-show.</p>
              </div>
              <Field label="Fechamentos (contratos assinados)">
                <Input
                  style={INPUT_STYLE}
                  type="number"
                  min="0"
                  step="1"
                  value={c.fechamentos ?? ''}
                  onChange={(e) => setCaptacao('fechamentos', toPositiveInt(e.target.value))}
                />
              </Field>
              <Field label="Tempo médio de resposta da proposta (dias)">
                <Input
                  style={INPUT_STYLE}
                  type="number"
                  min="0"
                  step="1"
                  value={c.tempoMedioRespostaDias ?? ''}
                  onChange={(e) => setCaptacao('tempoMedioRespostaDias', toPositiveInt(e.target.value))}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle>Financeiro</CardTitle>
            <div className="flex flex-col gap-3">
              <Field label="Investimento em ADS (R$)">
                <Input
                  style={INPUT_STYLE}
                  value={form.investimentoAdsStr}
                  onChange={(e) => set('investimentoAdsStr', maskCurrencyInput(e.target.value))}
                  placeholder="R$ 0,00"
                />
              </Field>
              <Field label="Faturamento total (R$)">
                <Input
                  style={INPUT_STYLE}
                  value={form.faturamentoTotalStr}
                  onChange={(e) => set('faturamentoTotalStr', maskCurrencyInput(e.target.value))}
                  placeholder="R$ 0,00"
                />
              </Field>
              <Field label="Custo operacional (R$)">
                <Input
                  style={INPUT_STYLE}
                  value={form.custoOperacionalStr}
                  onChange={(e) => set('custoOperacionalStr', maskCurrencyInput(e.target.value))}
                  placeholder="R$ 0,00"
                />
              </Field>
            </div>
            <p className="mt-2 text-xs text-slate-400">Custo operacional: custos além do investimento em ADS.</p>
          </Card>

          <Card>
            <CardTitle>Metas do período</CardTitle>
            <div className="flex flex-col gap-3">
              <Field label="Meta de faturamento (R$)">
                <Input
                  style={INPUT_STYLE}
                  value={form.metaFaturamentoStr}
                  onChange={(e) => set('metaFaturamentoStr', maskCurrencyInput(e.target.value))}
                  placeholder="R$ 0,00"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Meta de fechamentos">
                  <Input
                    style={INPUT_STYLE}
                    type="number"
                    min="0"
                    step="1"
                    value={form.metaFechamentos ?? ''}
                    onChange={(e) => set('metaFechamentos', toPositiveInt(e.target.value))}
                  />
                </Field>
                <Field label="Meta de leads / cliques">
                  <Input
                    style={INPUT_STYLE}
                    type="number"
                    min="0"
                    step="1"
                    value={form.metaLeads ?? ''}
                    onChange={(e) => set('metaLeads', toPositiveInt(e.target.value))}
                  />
                </Field>
              </div>
            </div>
          </Card>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{ height: '44px', borderRadius: '10px', fontSize: '15px', fontWeight: 600 }}
            className="flex w-full items-center justify-center gap-2 bg-brand-600 text-white transition-colors duration-150 ease-in-out hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
          >
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar funil'}
          </button>
        </div>

        {/* COLUNA DIREITA (60%) — RESULTADOS VISUAIS */}
        <div className="flex flex-col gap-4">
          {/* BLOCO 1 — FUNIL VISUAL */}
          <Card className="!p-5">
            <CardTitle>Funil visual</CardTitle>
            <FunnelVisual stages={funnelStages} baseline={c.impressoes ?? 0} />
          </Card>

          {/* BLOCO 2 — MÉTRICAS FINANCEIRAS */}
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Métricas financeiras</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetricCard
                icon={<TrendingUp size={20} />}
                label="ROI"
                value={fmtPercentOrDash(roi)}
                tone={roi == null ? undefined : roi > 0 ? 'good' : roi < 0 ? 'bad' : undefined}
              />
              <MetricCard
                icon={<Wallet size={20} />}
                label="Lucro líquido"
                value={fmtBRLorDash(lucroLiquido)}
                tone={lucroLiquido == null ? undefined : lucroLiquido > 0 ? 'good' : lucroLiquido < 0 ? 'bad' : undefined}
              />
              <MetricCard icon={<Tag size={20} />} label="Ticket médio" value={fmtBRLorDash(ticketMedio)} />
              <MetricCard icon={<Target size={20} />} label="Custo por lead" value={fmtBRLorDash(custoPorLead)} />
              <MetricCard icon={<Handshake size={20} />} label="Custo por contrato" value={fmtBRLorDash(custoPorContrato)} />
              <MetricCard
                icon={<Percent size={20} />}
                label="Conversão lead → venda"
                value={fmtPercentOrDash(conversaoLeadVenda)}
                tone={conversaoLeadVenda == null ? undefined : conversaoLeadVenda >= 10 ? 'good' : 'bad'}
              />
            </div>
          </div>

          {/* BLOCO 3 — METAS DO PERÍODO */}
          <Card>
            <CardTitle>Metas do período</CardTitle>
            <div className="flex flex-col gap-3">
              <GoalBar
                label="Meta de faturamento"
                actualText={`${fmtBRLorDash(faturamentoTotal)} / ${fmtBRLorDash(metaFaturamento)}`}
                pct={pctFaturamento}
              />
              <GoalBar
                label="Meta de fechamentos"
                actualText={`${fmtIntOrDash(c.fechamentos)} / ${fmtIntOrDash(form.metaFechamentos)}`}
                pct={pctFechamentos}
              />
              <GoalBar
                label="Meta de leads"
                actualText={`${fmtIntOrDash(c.cliques)} / ${fmtIntOrDash(form.metaLeads)}`}
                pct={pctLeads}
              />
            </div>
          </Card>

          {/* BLOCO 4 — DIAGNÓSTICO AUTOMÁTICO */}
          <div
            className="rounded-xl border p-4"
            style={
              alerts.length > 0
                ? { backgroundColor: '#FEF9EC', borderColor: '#F59E0B' }
                : { backgroundColor: '#ECFDF5', borderColor: '#10B981' }
            }
          >
            <CardTitle>Diagnóstico automático</CardTitle>
            {alerts.length > 0 ? (
              <ul className="flex flex-col gap-2 text-sm text-slate-700">
                {alerts.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-emerald-700">✅ Funil saudável — todos os indicadores dentro do esperado.</p>
            )}
          </div>

          <p className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#10B981' }} /> Dentro do esperado
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#F59E0B' }} /> Abaixo
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#EF4444' }} /> Muito abaixo
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}

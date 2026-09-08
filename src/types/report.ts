import type { Timestamp } from 'firebase/firestore'
import type { BaseDoc } from './common'
import type { SalesFunnelNetwork, SalesFunnelService } from './salesFunnel'

export type ReportType = 'weekly' | 'monthly'

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
}

export type ReportPlatform = 'meta' | 'google'

export const REPORT_PLATFORM_LABEL: Record<ReportPlatform, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
}

/** Métricas de um período — todas opcionais porque a API do Meta nem
 *  sempre retorna todos os campos (ex: sem conversas iniciadas quando a
 *  campanha não tem esse objetivo). */
export interface ReportMetricSet {
  spend?: number
  impressions?: number
  clicks?: number
  reach?: number
  ctr?: number
  cpc?: number
  cpm?: number
  /** "Conversas iniciadas" — onsite_conversion.messaging_*. */
  conversations?: number
  linkClicks?: number
}

export interface ReportMetricComparison {
  current: ReportMetricSet
  previous?: ReportMetricSet
}

export interface ReportEntitySummary {
  id: string
  name: string
  status?: string
  objective?: string
  spend?: number
  impressions?: number
  clicks?: number
  ctr?: number
  cpc?: number
  reach?: number
  /** "Conversas iniciadas" atribuídas a esta campanha/anúncio. */
  conversations?: number
}

export interface ReportPlatformBreakdownRow {
  platform: string
  reach?: number
  impressions?: number
  clicks?: number
  spend?: number
}

export interface ReportActionSummary {
  type: string
  label: string
  value: number
}

/** Um dia do período — para o gráfico "Desempenho ao longo do período".
 *  Só existe em relatórios gerados a partir da v2 do painel; relatórios
 *  antigos não têm série diária e a seção mostra um aviso. */
export interface ReportDailyPoint {
  /** "yyyy-MM-dd" */
  date: string
  spend?: number
  impressions?: number
  clicks?: number
  reach?: number
  conversations?: number
}

/** Snapshot completo do Meta Ads no momento em que o relatório foi gerado —
 *  guardado no Firestore para que "Ver"/"Exportar PDF" nunca precisem
 *  rebater na API do Meta (o histórico fica estável mesmo se as campanhas
 *  mudarem depois). */
export interface ReportMetaSnapshot {
  accountId: string
  metrics: ReportMetricComparison
  balance?: number
  currency?: string
  topCampaigns: ReportEntitySummary[]
  topAdSets: ReportEntitySummary[]
  topAds: ReportEntitySummary[]
  platformBreakdown: ReportPlatformBreakdownRow[]
  actionsSummary: ReportActionSummary[]
  /** Série diária para o gráfico de evolução (ver ReportDailyPoint). */
  dailySeries?: ReportDailyPoint[]
}

/** Placeholder até a integração com Google Ads existir (ver
 *  api/google/insights.js). */
export interface ReportGoogleSnapshot {
  available: false
}

/** Funil Comercial do relatório mensal — parte puxada da API do Meta
 *  (investimento/impressões/alcance/cliques/conversas ficam em
 *  `report.meta.metrics.current`), parte preenchida à mão pelo gestor antes
 *  da apresentação e persistida aqui. Substitui a antiga aba "Funil
 *  Comercial" da ficha do cliente. */
export interface ReportFunnel {
  /** Rede de anúncios — pré-selecionada como Meta Ads em relatórios de Meta. */
  rede?: SalesFunnelNetwork
  /** Tipo de oferta / serviço (afina os benchmarks). */
  servico?: SalesFunnelService

  // Campos manuais
  visitasAgendadas?: number
  visitasRealizadas?: number
  fechamentos?: number
  /** R$ */
  faturamentoTotal?: number
  custoOperacional?: number
  metaFaturamento?: number
  metaFechamentos?: number
  metaLeads?: number

  preenchidoPor?: string
  filledAt?: Timestamp | null
}

export interface Report extends BaseDoc {
  clientId: string
  type: ReportType
  platforms: ReportPlatform[]
  periodStart: Timestamp
  periodEnd: Timestamp
  meta?: ReportMetaSnapshot
  google?: ReportGoogleSnapshot
  /** Só para type === 'monthly' — dados manuais do Funil Comercial (ver
   *  ReportFunnel). Preenchido/salvo no próprio painel do relatório. */
  funnel?: ReportFunnel
  /** Só para type === 'weekly' — texto pronto para WhatsApp, editável antes
   *  de copiar (ver components/reports). */
  weeklyText?: string
  generatedBy: string
  generatedByName: string
}

export type ReportInput = Omit<Report, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>

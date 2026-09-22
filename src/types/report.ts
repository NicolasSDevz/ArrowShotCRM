import type { Timestamp } from 'firebase/firestore'
import type { BaseDoc } from './common'
import type { SalesFunnelNetwork, SalesFunnelService } from './salesFunnel'
import type { ChecklistItem } from './task'
import type { LandingPagePlatform, LandingPageStatus } from './landingPage'

export type ReportType = 'weekly' | 'monthly'

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
}

export type ReportPlatform = 'meta' | 'google' | 'landingPage'

export const REPORT_PLATFORM_LABEL: Record<ReportPlatform, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  landingPage: 'Landing Page',
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

/** Métricas de campanhas do Google Ads — nomes de campo próprios (não reusa
 *  ReportMetricSet, que é modelado nos termos do Meta: reach/conversas/
 *  linkClicks não existem no Google Ads, e "conversions"/"custo por
 *  conversão" lá não tem equivalente direto no Meta). */
export interface ReportGoogleMetricSet {
  cost?: number
  impressions?: number
  clicks?: number
  ctr?: number
  averageCpc?: number
  conversions?: number
  costPerConversion?: number
}

export interface ReportGoogleMetricComparison {
  current: ReportGoogleMetricSet
  previous?: ReportGoogleMetricSet
}

export interface ReportGoogleCampaignSummary {
  name: string
  status: string
  impressions: number
  clicks: number
  cost: number
  ctr: number
  conversions: number
}

/** Um dia do período, para o gráfico de evolução do Google Ads (ver
 *  ReportDailyPoint, a versão Meta). */
export interface ReportGoogleDailyPoint {
  /** "yyyy-MM-dd" */
  date: string
  cost?: number
  impressions?: number
  clicks?: number
  conversions?: number
}

/** Snapshot completo do Google Ads no momento em que o relatório foi gerado
 *  (mesma convenção do `ReportMetaSnapshot`: guardado no Firestore, nunca
 *  rebatido na API depois). Relatórios salvos antes da integração real
 *  existir (ver api/google/insights.js) ficaram com `{ available: false }` —
 *  o union cobre os dois casos sem quebrar o histórico. */
export type ReportGoogleSnapshot =
  | { available: false }
  | {
      available: true
      accountId: string
      metrics: ReportGoogleMetricComparison
      topCampaigns: ReportGoogleCampaignSummary[]
      dailySeries?: ReportGoogleDailyPoint[]
    }

/** Snapshot da aba "Landing Page" do cliente no momento em que o relatório
 *  foi gerado — não é lido ao vivo depois (mesma convenção do Meta Ads: o
 *  relatório não muda se o cliente atualizar a ficha depois). */
export interface ReportLandingPageSnapshot {
  url?: string
  status: LandingPageStatus
  platform?: LandingPagePlatform
  checklist: ChecklistItem[]
  observations?: string
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
  landingPage?: ReportLandingPageSnapshot
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

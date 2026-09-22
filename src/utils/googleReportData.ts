import { format } from 'date-fns'
import { getGoogleAdsInsights } from '../services/googleAdsApi'
import { previousPeriod } from './metaReportData'
import type { GoogleAdsInsights } from '../services/googleAdsApi'
import type { ReportGoogleCampaignSummary, ReportGoogleMetricSet, ReportGoogleSnapshot } from '../types'

function toDateParam(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function toMetricSet(summary: GoogleAdsInsights['summary']): ReportGoogleMetricSet {
  return {
    cost: summary.cost,
    impressions: summary.impressions,
    clicks: summary.clicks,
    ctr: summary.ctr,
    averageCpc: summary.average_cpc,
    conversions: summary.conversions,
    costPerConversion: summary.cost_per_conversion,
  }
}

function topN(campaigns: GoogleAdsInsights['campaigns'], n: number): ReportGoogleCampaignSummary[] {
  return [...campaigns].sort((a, b) => b.cost - a.cost).slice(0, n)
}

/** Busca o snapshot do Google Ads pro relatório (mensal ou semanal) — mesma
 *  convenção do `fetchMetaReportSnapshot`: período atual + anterior (para a
 *  variação %), já no formato pronto pra salvar no Firestore. A chamada do
 *  período anterior falhando não derruba o relatório (só fica sem
 *  comparativo). */
export async function fetchGoogleReportSnapshot(
  accountIdRaw: string,
  start: Date,
  end: Date
): Promise<ReportGoogleSnapshot> {
  const accountId = accountIdRaw.trim().replace(/\D/g, '')
  const prev = previousPeriod(start, end)

  const [current, previous] = await Promise.allSettled([
    getGoogleAdsInsights(accountId, toDateParam(start), toDateParam(end)),
    getGoogleAdsInsights(accountId, toDateParam(prev.start), toDateParam(prev.end)),
  ])

  if (current.status === 'rejected') {
    throw current.reason instanceof Error ? current.reason : new Error('Erro ao buscar dados do Google Ads')
  }

  const c = current.value
  const p = previous.status === 'fulfilled' ? previous.value : null
  if (previous.status === 'rejected') {
    console.warn('[googleReport] período anterior falhou — relatório fica sem comparativo:', previous.reason)
  }

  return {
    available: true,
    accountId,
    metrics: { current: toMetricSet(c.summary), previous: p ? toMetricSet(p.summary) : undefined },
    topCampaigns: topN(c.campaigns, 10),
    dailySeries: c.daily?.length ? c.daily : undefined,
  }
}

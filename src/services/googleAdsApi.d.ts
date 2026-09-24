// Ambient types for googleAdsApi.js — kept as plain JS per spec (Vercel
// Functions convention). See metaApi.d.ts for the same pattern.

export interface GoogleAdsInsightsSummary {
  impressions: number
  clicks: number
  cost: number
  ctr: number
  average_cpc: number
  conversions: number
  cost_per_conversion: number
}

export interface GoogleAdsInsightsCampaign {
  name: string
  status: string
  impressions: number
  clicks: number
  cost: number
  ctr: number
  conversions: number
}

export interface GoogleAdsInsightsDaily {
  date: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
}

export interface GoogleAdsInsights {
  summary: GoogleAdsInsightsSummary
  campaigns: GoogleAdsInsightsCampaign[]
  daily: GoogleAdsInsightsDaily[]
}

export function getGoogleAdsInsights(customerId: string, dateFrom: string, dateTo: string): Promise<GoogleAdsInsights>

export interface GoogleAdsKeywordInsight {
  campanha: string
  grupoDeAnuncios: string
  palavraChave: string
  tipoDeCorrespondencia: string
  impressoes: number
  cliques: number
  custo: number
  ctr: number
  conversoes: number
  custoPorConversao: number
}

export interface GoogleAdsSearchTermInsight {
  termoDePesquisa: string
  tipoDeCorrespondencia: string
  campanha: string
  grupoDeAnuncios: string
  impressoes: number
  cliques: number
  custo: number
  ctr: number
  conversoes: number
  custoPorConversao: number
}

export function getGoogleAdsKeywordInsights(
  customerId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ level: 'keywords'; keywords: GoogleAdsKeywordInsight[] }>

export function getGoogleAdsSearchTermInsights(
  customerId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ level: 'search_terms'; searchTerms: GoogleAdsSearchTermInsight[] }>

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

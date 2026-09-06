// Ambient types for metaApi.js — kept as plain JS per spec (Vercel
// Functions convention). This only types the function signatures so
// TypeScript stops treating the module import as an implicit `any`; the
// Graph API's response shape is inherently dynamic, so callers (see
// utils/metaReportData.ts) narrow the payload into their own typed shapes
// rather than this file trying to model Meta's API in full.

/* eslint-disable @typescript-eslint/no-explicit-any */

export function getMetaInsights(accountId: string, datePreset: string): Promise<any>
export function getMetaCampaigns(accountId: string): Promise<any>
export function getMetaAdSets(accountId: string, campaignId?: string): Promise<any>
export function getMetaAds(accountId: string, adSetId?: string): Promise<any>

export interface MetaInsightsRangeOptions {
  timeRange?: { since: string; until: string }
  fields?: string
  level?: 'account' | 'campaign' | 'adset' | 'ad'
  breakdowns?: string
  limit?: number
  /** `1` = uma linha por dia (série diária para o gráfico de evolução). */
  timeIncrement?: number
}

export function getMetaInsightsRange(accountId: string, options?: MetaInsightsRangeOptions): Promise<any>
export function getMetaAccountInfo(accountId: string): Promise<any>

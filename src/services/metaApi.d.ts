// Ambient types for metaApi.js — kept as plain JS per spec (Vercel
// Functions convention). This only types the function signatures so
// TypeScript stops treating the module import as an implicit `any`; the
// Graph API's response shape is inherently dynamic, so callers (see
// utils/metaReportData.ts) narrow the payload into their own typed shapes
// rather than this file trying to model Meta's API in full.

/* eslint-disable @typescript-eslint/no-explicit-any */

export function getMetaInsights(accountId: string, datePreset: string, clientId?: string): Promise<any>
export function getMetaCampaigns(accountId: string, clientId?: string): Promise<any>
export function getMetaAdSets(accountId: string, campaignId?: string, clientId?: string): Promise<any>
export function getMetaAds(accountId: string, adSetId?: string, clientId?: string): Promise<any>

export interface MetaInsightsRangeOptions {
  timeRange?: { since: string; until: string }
  fields?: string
  level?: 'account' | 'campaign' | 'adset' | 'ad'
  breakdowns?: string
  limit?: number
  /** `1` = uma linha por dia (série diária para o gráfico de evolução). */
  timeIncrement?: number
  /** Se o cliente tiver token próprio salvo, é ele que é usado — ver
   *  api/_lib/metaTokenStore.js. */
  clientId?: string
}

export function getMetaInsightsRange(accountId: string, options?: MetaInsightsRangeOptions): Promise<any>
export function getMetaAccountInfo(accountId: string, clientId?: string): Promise<any>

export interface MetaTokenStatus {
  hasToken: boolean
  updatedAt?: string | null
  updatedBy?: string | null
  /** ISO string, quando conhecida (troca de token longo / debug_token).
   *  `null` = token salvo mas validade desconhecida. */
  expiresAt?: string | null
}

export interface MetaClientTokenRow {
  clientId: string
  updatedAt: string | null
  updatedBy: string | null
  expiresAt: string | null
}

export function getMetaTokenStatus(clientId: string): Promise<MetaTokenStatus>
export function listMetaTokenStatuses(): Promise<MetaClientTokenRow[]>
export function saveMetaToken(clientId: string, token: string): Promise<{ ok: true; expiresAt: string | null }>
export function deleteMetaToken(clientId: string): Promise<{ ok: true }>
export function exchangeMetaToken(
  clientId: string,
  shortToken: string
): Promise<{ ok: true; expires_in: number; expires_at: string }>

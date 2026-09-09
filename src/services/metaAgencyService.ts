import { auth } from '../firebase/config'

export type MetaPeriodPreset = 'last_7d' | 'last_14d' | 'last_30d' | 'this_month' | 'last_month' | 'custom'

export const META_PERIOD_LABEL: Record<Exclude<MetaPeriodPreset, 'custom'>, string> = {
  last_7d: 'Últimos 7 dias',
  last_14d: 'Últimos 14 dias',
  last_30d: 'Últimos 30 dias',
  this_month: 'Este mês',
  last_month: 'Mês passado',
}

export interface MetaClientMetrics {
  spend: number
  conversations: number
  reach: number
  impressions: number
  ctr: number
  costPerConversation: number
}

export interface MetaAgencyRow {
  clientId: string
  companyName: string
  logoUrl: string | null
  ownerIds: string[]
  accountId: string | null
  hasToken: boolean
  tokenExpiresAt: string | null
  accountStatus: number | null
  restricted: boolean
  balance: number | null
  currency: string
  metrics: MetaClientMetrics | null
  graphError: string | null
  fromCache: boolean
}

export interface MetaAgencyOverview {
  ok: true
  period: { preset: MetaPeriodPreset; since: string; until: string }
  fetchedAt: string
  totals: {
    spend: number
    conversations: number
    costPerConversation: number
    reach: number
    impressions: number
    ctr: number
  }
  prevTotals: { spend: number; conversations: number; reach: number }
  daily: { date: string; spend: number }[]
  rows: MetaAgencyRow[]
}

export async function fetchMetaAgencyOverview(params: {
  preset: MetaPeriodPreset
  since?: string
  until?: string
  force?: boolean
}): Promise<MetaAgencyOverview> {
  const user = auth.currentUser
  if (!user) throw new Error('Usuário não autenticado')
  const idToken = await user.getIdToken()

  const q = new URLSearchParams()
  if (params.preset === 'custom' && params.since && params.until) {
    q.set('since', params.since)
    q.set('until', params.until)
  } else {
    q.set('preset', params.preset)
  }
  if (params.force) q.set('force', '1')

  const res = await fetch(`/api/meta/agency-overview?${q.toString()}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.ok) throw new Error(body.error || 'Falha ao carregar a visão consolidada do Meta Ads')
  return body as MetaAgencyOverview
}

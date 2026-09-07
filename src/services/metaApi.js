// Cliente do frontend para o backend seguro do Meta Ads (Vercel Functions em
// /api/meta/*). O access_token nunca passa por aqui — fica no servidor,
// resolvido por cliente (token próprio salvo em Firestore, criptografado)
// ou pelo token global da agência (process.env.META_ACCESS_TOKEN),
// conforme api/_lib/metaTokenStore.js. Nunca chame graph.facebook.com
// diretamente do frontend.
//
// `clientId`, quando informado, é enviado como `client_id` — é o que
// permite ao backend usar o token específico daquele cliente quando a
// conta de anúncios dele vive em outro Business Manager.

import { auth } from '../firebase/config'

export async function getMetaInsights(accountId, datePreset, clientId) {
  const params = new URLSearchParams({ account_id: accountId, date_preset: datePreset })
  if (clientId) params.set('client_id', clientId)
  const response = await fetch(`/api/meta/insights?${params.toString()}`)
  if (!response.ok) throw new Error('Erro ao buscar dados do Meta')
  return response.json()
}

export async function getMetaCampaigns(accountId, clientId) {
  const params = new URLSearchParams({ account_id: accountId })
  if (clientId) params.set('client_id', clientId)
  const response = await fetch(`/api/meta/campaigns?${params.toString()}`)
  if (!response.ok) throw new Error('Erro ao buscar campanhas')
  return response.json()
}

export async function getMetaAdSets(accountId, campaignId, clientId) {
  const params = new URLSearchParams({ account_id: accountId })
  if (campaignId) params.set('campaign_id', campaignId)
  if (clientId) params.set('client_id', clientId)
  const response = await fetch(`/api/meta/adsets?${params.toString()}`)
  if (!response.ok) throw new Error('Erro ao buscar conjuntos de anúncios')
  return response.json()
}

export async function getMetaAds(accountId, adSetId, clientId) {
  const params = new URLSearchParams({ account_id: accountId })
  if (adSetId) params.set('adset_id', adSetId)
  if (clientId) params.set('client_id', clientId)
  const response = await fetch(`/api/meta/ads?${params.toString()}`)
  if (!response.ok) throw new Error('Erro ao buscar anúncios')
  return response.json()
}

/** Insights com controle total dos parâmetros — usado pelo módulo de
 *  Relatórios (período customizado, nível de detalhe, breakdown por
 *  plataforma). `timeRange` é um objeto { since, until } ("yyyy-MM-dd"). */
export async function getMetaInsightsRange(accountId, { timeRange, fields, level, breakdowns, limit, timeIncrement, clientId } = {}) {
  const params = new URLSearchParams({ account_id: accountId })
  if (timeRange) params.set('time_range', JSON.stringify(timeRange))
  if (fields) params.set('fields', fields)
  if (level) params.set('level', level)
  if (breakdowns) params.set('breakdowns', breakdowns)
  if (limit) params.set('limit', String(limit))
  if (timeIncrement) params.set('time_increment', String(timeIncrement))
  if (clientId) params.set('client_id', clientId)

  const requestUrl = `/api/meta/insights?${params.toString()}`
  console.log('[metaApi] GET', requestUrl)
  const response = await fetch(requestUrl)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    console.error('[metaApi] insights ERRO', response.status, body)
    throw new Error(body.error || 'Erro ao buscar dados do Meta')
  }
  const json = await response.json()
  console.log('[metaApi] insights OK', requestUrl, '— linhas:', Array.isArray(json?.data) ? json.data.length : '(sem data[])', json)
  return json
}

/** Nome, moeda e saldo da conta de anúncios — usado no campo "Saldo Atual"
 *  dos relatórios. */
export async function getMetaAccountInfo(accountId, clientId) {
  const params = new URLSearchParams({ account_id: accountId })
  if (clientId) params.set('client_id', clientId)
  const response = await fetch(`/api/meta/account?${params.toString()}`)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'Erro ao buscar dados da conta do Meta')
  }
  return response.json()
}

// --- Gerenciamento do token de acesso por cliente ---------------------
//
// Essas três chamadas exigem um usuário interno logado (o backend confere
// isso via Firebase ID token — ver api/_lib/auth.js) e nunca devolvem o
// token em si, só o status ("configurado?", "por quem?", "quando?").

async function authHeaders() {
  const user = auth.currentUser
  if (!user) throw new Error('Usuário não autenticado')
  const idToken = await user.getIdToken()
  return { Authorization: `Bearer ${idToken}` }
}

/** { hasToken: boolean, updatedAt?: string, updatedBy?: string } */
export async function getMetaTokenStatus(clientId) {
  const headers = await authHeaders()
  const response = await fetch(`/api/meta/token?client_id=${encodeURIComponent(clientId)}`, { headers })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'Erro ao consultar status do token')
  }
  return response.json()
}

/** Salva (ou substitui) o token de acesso Meta Ads de um cliente. O
 *  backend valida o token com a Graph API antes de gravar. */
export async function saveMetaToken(clientId, token) {
  const headers = await authHeaders()
  const response = await fetch('/api/meta/token', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, token }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Erro ao salvar token')
  return body
}

/** Remove o token salvo do cliente — relatórios voltam a usar o token
 *  global da agência (se houver). */
export async function deleteMetaToken(clientId) {
  const headers = await authHeaders()
  const response = await fetch(`/api/meta/token?client_id=${encodeURIComponent(clientId)}`, {
    method: 'DELETE',
    headers,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Erro ao remover token')
  return body
}

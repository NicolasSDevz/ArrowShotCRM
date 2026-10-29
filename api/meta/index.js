// Vercel Function — /api/meta/:acao (rewrite no vercel.json → /api/meta?acao=:acao)
//
// Rota dinâmica que consolida todas as sub-rotas do Meta Ads num único arquivo,
// respeitando o limite de 12 funções do plano Hobby da Vercel.
//
// Ações disponíveis:
//   account         → GET  nome/moeda/saldo da conta de anúncios
//   ads             → GET  anúncios (filtro opcional por adset)
//   adsets          → GET  conjuntos de anúncios (filtro opcional por campanha)
//   agency-overview → GET  visão consolidada de todos os clientes com Meta Ads
//   campaigns       → GET  campanhas ativas da conta
//   insights        → GET  insights (impressões, cliques, gasto, conversões…)
//   form-visit      → POST visita do formulário de captura (público)
//   token           → GET/POST/DELETE gerenciamento de token por cliente
//                     + ?scope=credentials → acessos (login/senha)
//                     + ?scope=exchange   → troca token curto por longo

import '../_lib/quietDeprecation.js'
import { withInternalAuth, withMetaReadAuth } from '../_lib/auth.js'
import { respondMetaGraphRequest, fetchAccountInsights, fetchAccountInfo, normalizeAccountId, isAccountRestricted } from '../_lib/metaGraph.js'
import { listDocs, getDoc, setDoc } from '../_lib/firebaseAdmin.js'
import { resolveMetaToken, listAllTokenStatuses, setClientToken, deleteClientToken, getClientTokenStatus } from '../_lib/metaTokenStore.js'
import { credentialsHandler } from '../_lib/credentialsHandler.js'
import { exchangeTokenHandler } from '../_lib/exchangeTokenHandler.js'
import { errorReportHandler } from '../_lib/errorReport.js'
import { formVisitHandler } from '../_lib/leadFormVisits.js'

// ─── account ────────────────────────────────────────────────────────────────

async function accountHandler(req, res) {
  try {
    const { account_id } = req.query
    if (!account_id) {
      return res.status(400).json({ error: 'Parâmetro obrigatório ausente: account_id' })
    }
    const params = new URLSearchParams({ fields: 'name,currency,balance,amount_spent' })
    await respondMetaGraphRequest(req, res, {
      label: 'dados da conta do Meta Ads',
      path: `act_${account_id}`,
      params,
    })
  } catch (err) {
    console.error('[meta/account] erro interno:', err)
    return res.status(500).json({ error: 'Erro interno ao buscar dados da conta do Meta Ads' })
  }
}

// ─── ads ────────────────────────────────────────────────────────────────────

async function adsHandler(req, res) {
  try {
    const { account_id, adset_id } = req.query
    if (!account_id) {
      return res.status(400).json({ error: 'Parâmetro obrigatório ausente: account_id' })
    }
    const params = new URLSearchParams({ fields: 'id,name,status,adset_id,campaign_id,creative' })
    if (adset_id) {
      params.set('filtering', JSON.stringify([{ field: 'adset.id', operator: 'EQUAL', value: adset_id }]))
    }
    await respondMetaGraphRequest(req, res, {
      label: 'anúncios do Meta Ads',
      path: `act_${account_id}/ads`,
      params,
    })
  } catch (err) {
    console.error('[meta/ads] erro interno:', err)
    return res.status(500).json({ error: 'Erro interno ao buscar anúncios do Meta Ads' })
  }
}

// ─── adsets ─────────────────────────────────────────────────────────────────

async function adsetsHandler(req, res) {
  try {
    const { account_id, campaign_id } = req.query
    if (!account_id) {
      return res.status(400).json({ error: 'Parâmetro obrigatório ausente: account_id' })
    }
    const params = new URLSearchParams({
      fields: 'id,name,status,campaign_id,daily_budget,lifetime_budget,optimization_goal,targeting',
    })
    if (campaign_id) {
      params.set('filtering', JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: campaign_id }]))
    }
    await respondMetaGraphRequest(req, res, {
      label: 'conjuntos de anúncios do Meta Ads',
      path: `act_${account_id}/adsets`,
      params,
    })
  } catch (err) {
    console.error('[meta/adsets] erro interno:', err)
    return res.status(500).json({ error: 'Erro interno ao buscar conjuntos de anúncios do Meta Ads' })
  }
}

// ─── campaigns ──────────────────────────────────────────────────────────────

async function campaignsHandler(req, res) {
  try {
    const { account_id } = req.query
    if (!account_id) {
      return res.status(400).json({ error: 'Parâmetro obrigatório ausente: account_id' })
    }
    const params = new URLSearchParams({
      fields: 'id,name,status,objective,daily_budget,lifetime_budget',
      effective_status: JSON.stringify(['ACTIVE']),
    })
    await respondMetaGraphRequest(req, res, {
      label: 'campanhas do Meta Ads',
      path: `act_${account_id}/campaigns`,
      params,
    })
  } catch (err) {
    console.error('[meta/campaigns] erro interno:', err)
    return res.status(500).json({ error: 'Erro interno ao buscar campanhas do Meta Ads' })
  }
}

// ─── insights ───────────────────────────────────────────────────────────────

const DEFAULT_FIELDS = 'campaign_name,impressions,clicks,spend,cpc,ctr,reach,actions,cost_per_action_type'

async function insightsHandler(req, res) {
  try {
    const { account_id, date_preset, time_range, fields, level, breakdowns, limit, time_increment } = req.query
    if (!account_id) {
      return res.status(400).json({ error: 'Parâmetro obrigatório ausente: account_id' })
    }
    if (!date_preset && !time_range) {
      return res.status(400).json({ error: 'Informe date_preset ou time_range' })
    }
    const params = new URLSearchParams({ fields: fields || DEFAULT_FIELDS })
    if (date_preset) params.set('date_preset', date_preset)
    if (time_range) params.set('time_range', time_range)
    if (level) params.set('level', level)
    if (breakdowns) params.set('breakdowns', breakdowns)
    if (limit) params.set('limit', limit)
    if (time_increment) params.set('time_increment', time_increment)
    await respondMetaGraphRequest(req, res, {
      label: 'insights do Meta Ads',
      path: `act_${account_id}/insights`,
      params,
    })
  } catch (err) {
    console.error('[meta/insights] erro interno:', err)
    return res.status(500).json({ error: 'Erro interno ao buscar dados do Meta Ads' })
  }
}

// ─── agency-overview ────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1000
const SP_TZ = 'America/Sao_Paulo'

function spToday() {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: SP_TZ }).format(new Date())
  return new Date(`${s}T12:00:00`)
}
function iso(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SP_TZ }).format(d)
}
function addDays(d, n) {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}
function rangeWithPrev(start, end) {
  const days = Math.round((end - start) / 86400000) + 1
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(days - 1))
  return { since: iso(start), until: iso(end), prevSince: iso(prevStart), prevUntil: iso(prevEnd) }
}
function resolveRange(preset, since, until) {
  if (since && until) {
    return rangeWithPrev(new Date(`${since}T12:00:00`), new Date(`${until}T12:00:00`))
  }
  const today = spToday()
  const y = addDays(today, -1)
  switch (preset) {
    case 'last_14d': return rangeWithPrev(addDays(y, -13), y)
    case 'last_30d': return rangeWithPrev(addDays(y, -29), y)
    case 'this_month': return rangeWithPrev(new Date(today.getFullYear(), today.getMonth(), 1, 12), today)
    case 'last_month': return rangeWithPrev(
      new Date(today.getFullYear(), today.getMonth() - 1, 1, 12),
      new Date(today.getFullYear(), today.getMonth(), 0, 12)
    )
    case 'last_7d':
    default:
      return rangeWithPrev(addDays(y, -6), y)
  }
}

function ownerIdsOf(c) {
  if (Array.isArray(c.ownerIds) && c.ownerIds.length > 0) return c.ownerIds
  return c.ownerId ? [c.ownerId] : []
}

const EMPTY_METRICS = { spend: 0, impressions: 0, reach: 0, clicks: 0, ctr: 0, conversations: 0 }

async function loadClient(client, range, periodKey, force) {
  const accountId = normalizeAccountId(client.campaignPlanning?.acessos?.metaAdsAccountId || '')
  const base = {
    clientId: client.id,
    companyName: client.companyName || '—',
    logoUrl: client.logoUrl || null,
    ownerIds: ownerIdsOf(client),
    accountId: accountId || null,
    hasToken: true,
  }

  if (!accountId) return { ...base, hasToken: true, metrics: null, note: 'sem_account_id' }

  if (!force) {
    const snap = await getDoc(`metaSnapshots/${client.id}`).catch(() => ({ exists: false }))
    if (snap.exists) {
      const d = snap.data()
      const fetchedAt = d.fetchedAt ? new Date(d.fetchedAt).getTime() : 0
      if (d.periodKey === periodKey && Date.now() - fetchedAt < CACHE_TTL_MS) {
        return {
          ...base,
          metrics: d.metrics || EMPTY_METRICS,
          prevMetrics: d.prevMetrics || EMPTY_METRICS,
          daily: d.daily || [],
          balance: d.balance ?? null,
          currency: d.currency || 'BRL',
          accountStatus: d.accountStatus ?? null,
          disableReason: d.disableReason ?? null,
          fetchedAt: d.fetchedAt,
          fromCache: true,
        }
      }
    }
  }

  let token
  try {
    const resolved = await resolveMetaToken(client.id)
    token = resolved?.token
  } catch (err) {
    return { ...base, metrics: null, error: err.message }
  }
  if (!token) return { ...base, hasToken: false, metrics: null }

  const [cur, prev, daily, info] = await Promise.allSettled([
    fetchAccountInsights(token, accountId, range.since, range.until),
    fetchAccountInsights(token, accountId, range.prevSince, range.prevUntil),
    fetchAccountInsights(token, accountId, range.since, range.until, { daily: true }),
    fetchAccountInfo(token, accountId),
  ])

  const metrics = cur.status === 'fulfilled' ? cur.value.totals : EMPTY_METRICS
  const prevMetrics = prev.status === 'fulfilled' ? prev.value.totals : EMPTY_METRICS
  const dailySeries = daily.status === 'fulfilled' ? daily.value.daily : []
  const account = info.status === 'fulfilled' ? info.value : {}
  const graphError =
    cur.status === 'rejected' ? cur.reason?.message : info.status === 'rejected' ? info.reason?.message : null

  const result = {
    ...base,
    metrics, prevMetrics,
    daily: dailySeries,
    balance: account.balance ?? null,
    currency: account.currency || 'BRL',
    accountStatus: account.accountStatus ?? null,
    disableReason: account.disableReason ?? null,
    fetchedAt: new Date().toISOString(),
    graphError: graphError || null,
  }

  await setDoc(`metaSnapshots/${client.id}`, {
    periodKey,
    fetchedAt: new Date(),
    metrics, prevMetrics,
    daily: dailySeries,
    balance: result.balance,
    currency: result.currency,
    accountStatus: result.accountStatus,
    disableReason: result.disableReason,
  }).catch((e) => console.error('[agency-overview] falha ao gravar snapshot', client.id, e.message))

  return result
}

async function agencyOverviewHandler(req, res, user) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' })

  try {
    const preset = String(req.query.preset || 'last_7d')
    const since = req.query.since ? String(req.query.since) : null
    const until = req.query.until ? String(req.query.until) : null
    const force = req.query.force === '1' || req.query.force === 'true'
    const range = resolveRange(preset, since, until)
    const periodKey = `${range.since}_${range.until}`

    const [clients, tokenStatuses] = await Promise.all([listDocs('clients'), listAllTokenStatuses()])
    const tokenByClient = new Map(tokenStatuses.map((t) => [t.clientId, t]))

    let eligible = clients.filter(
      (c) => c.status !== 'churned' && c.status !== 'paused' && (c.modules?.metaAds || c.campaignPlanning?.acessos?.metaAdsAccountId)
    )
    if (user.role !== 'admin') {
      eligible = eligible.filter((c) => ownerIdsOf(c).includes(user.uid))
    }

    const rows = await Promise.all(
      eligible.map(async (c) => {
        const tokenRow = tokenByClient.get(c.id) || null
        if (!tokenRow) {
          return {
            clientId: c.id,
            companyName: c.companyName || '—',
            logoUrl: c.logoUrl || null,
            ownerIds: ownerIdsOf(c),
            accountId: normalizeAccountId(c.campaignPlanning?.acessos?.metaAdsAccountId || '') || null,
            hasToken: false,
            tokenExpiresAt: null,
            metrics: null,
          }
        }
        const loaded = await loadClient(c, range, periodKey, force)
        return { ...loaded, tokenExpiresAt: tokenRow.expiresAt || null }
      })
    )

    const withData = rows.filter((r) => r.metrics)
    const sum = (key) => withData.reduce((s, r) => s + (r.metrics[key] || 0), 0)
    const sumPrev = (key) => withData.reduce((s, r) => s + ((r.prevMetrics || {})[key] || 0), 0)

    const totalSpend = sum('spend')
    const totalConversations = sum('conversations')
    const totalReach = sum('reach')
    const totalImpressions = sum('impressions')
    const totalClicks = sum('clicks')

    const totals = {
      spend: totalSpend,
      conversations: totalConversations,
      costPerConversation: totalConversations > 0 ? totalSpend / totalConversations : 0,
      reach: totalReach,
      impressions: totalImpressions,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    }
    const prevTotals = {
      spend: sumPrev('spend'),
      conversations: sumPrev('conversations'),
      reach: sumPrev('reach'),
    }

    const dailyMap = new Map()
    for (const r of withData) {
      for (const p of r.daily || []) {
        dailyMap.set(p.date, (dailyMap.get(p.date) || 0) + (p.spend || 0))
      }
    }
    const daily = [...dailyMap.entries()]
      .map(([date, spend]) => ({ date, spend }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const fetchedAts = rows.map((r) => r.fetchedAt).filter(Boolean).sort()
    const oldestFetchedAt = fetchedAts[0] || new Date().toISOString()

    const publicRows = rows.map((r) => ({
      clientId: r.clientId,
      companyName: r.companyName,
      logoUrl: r.logoUrl,
      ownerIds: r.ownerIds,
      accountId: r.accountId,
      hasToken: r.hasToken,
      tokenExpiresAt: r.tokenExpiresAt ?? null,
      accountStatus: r.accountStatus ?? null,
      restricted: isAccountRestricted(r.accountStatus),
      balance: r.balance ?? null,
      currency: r.currency ?? 'BRL',
      metrics: r.metrics
        ? {
            spend: r.metrics.spend || 0,
            conversations: r.metrics.conversations || 0,
            reach: r.metrics.reach || 0,
            impressions: r.metrics.impressions || 0,
            ctr: r.metrics.ctr || 0,
            costPerConversation: r.metrics.conversations > 0 ? r.metrics.spend / r.metrics.conversations : 0,
          }
        : null,
      graphError: r.graphError || r.error || null,
      fromCache: !!r.fromCache,
    }))

    return res.status(200).json({
      ok: true,
      period: { preset: since && until ? 'custom' : preset, since: range.since, until: range.until },
      fetchedAt: oldestFetchedAt,
      totals,
      prevTotals,
      daily,
      rows: publicRows,
    })
  } catch (err) {
    console.error('[agency-overview] erro:', err)
    return res.status(500).json({ error: err.message || 'Erro ao carregar visão consolidada' })
  }
}

// ─── token ──────────────────────────────────────────────────────────────────

const GRAPH_VERSION = 'v19.0'

async function inspectToken(token) {
  try {
    const meRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me?access_token=${encodeURIComponent(token)}`)
    const meData = await meRes.json()
    if (!meRes.ok) return { ok: false, message: meData?.error?.message || 'Token rejeitado pela API do Meta' }

    let expiresAt = null
    const appId = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET
    if (appId && appSecret) {
      try {
        const dbg = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=${encodeURIComponent(token)}` +
            `&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`
        )
        const dbgData = await dbg.json()
        const exp = dbgData?.data?.expires_at
        if (typeof exp === 'number' && exp > 0) expiresAt = new Date(exp * 1000).toISOString()
      } catch {
        /* expiração é opcional */
      }
    }
    return { ok: true, expiresAt }
  } catch {
    return { ok: false, message: 'Não foi possível validar o token com a API do Meta (falha de rede)' }
  }
}

async function tokenHandler(req, res, user) {
  if (req.method === 'GET') {
    const clientId = req.query.client_id
    if (!clientId) {
      const tokens = await listAllTokenStatuses()
      return res.status(200).json({ tokens })
    }
    const status = await getClientTokenStatus(clientId)
    return res.status(200).json(status)
  }

  if (req.method === 'POST') {
    const { clientId, token } = req.body || {}
    if (!clientId) return res.status(400).json({ error: 'Parâmetro obrigatório ausente: clientId' })
    if (!token || typeof token !== 'string' || token.trim().length < 20) {
      return res.status(400).json({ error: 'Token ausente ou inválido' })
    }

    const trimmed = token.trim()
    console.log(`[meta/token] POST clientId=${clientId} por ${user.name} — validando com o Graph…`)
    const inspection = await inspectToken(trimmed)
    if (!inspection.ok) {
      console.warn('[meta/token] validação recusada:', inspection.message)
      return res.status(400).json({ error: `Token não pôde ser validado: ${inspection.message}` })
    }

    await setClientToken(clientId, trimmed, user.name, inspection.expiresAt)
    console.log(`[meta/token] token do cliente ${clientId} gravado (expira: ${inspection.expiresAt ?? 'desconhecido'})`)
    return res.status(200).json({ ok: true, expiresAt: inspection.expiresAt ?? null })
  }

  if (req.method === 'DELETE') {
    const clientId = req.query.client_id
    if (!clientId) return res.status(400).json({ error: 'Parâmetro obrigatório ausente: client_id' })
    await deleteClientToken(clientId)
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, POST, DELETE')
  return res.status(405).json({ error: 'Método não permitido' })
}

// ─── wrappers de autenticação ────────────────────────────────────────────────

const accountRoute = withMetaReadAuth(accountHandler)
const adsRoute = withInternalAuth(adsHandler)
const adsetsRoute = withInternalAuth(adsetsHandler)
const campaignsRoute = withMetaReadAuth(campaignsHandler)
const insightsRoute = withMetaReadAuth(insightsHandler)
const agencyOverviewRoute = withInternalAuth(agencyOverviewHandler)
const tokenRoute = withInternalAuth(tokenHandler)

// ─── dispatcher ─────────────────────────────────────────────────────────────

export default function route(req, res) {
  const acao = req.query.acao

  if (acao === 'token') {
    if (req.query.scope === 'credentials') return credentialsHandler(req, res)
    if (req.query.scope === 'exchange') return exchangeTokenHandler(req, res)
    return tokenRoute(req, res)
  }

  switch (acao) {
    case 'account':          return accountRoute(req, res)
    case 'ads':              return adsRoute(req, res)
    case 'adsets':           return adsetsRoute(req, res)
    case 'campaigns':        return campaignsRoute(req, res)
    case 'insights':         return insightsRoute(req, res)
    case 'agency-overview':  return agencyOverviewRoute(req, res)
    // Aviso de erro das telas (público: o checkout não tem login). Ver _lib/errorReport.js.
    case 'erro':             return errorReportHandler(req, res)
    // Visitas dos formulários de captura + Lead pela API de Conversões (público). Ver _lib/leadFormVisits.js.
    case 'form-visit':       return formVisitHandler(req, res)
    default:
      return res.status(404).json({ error: `Rota Meta inválida: ${acao}` })
  }
}

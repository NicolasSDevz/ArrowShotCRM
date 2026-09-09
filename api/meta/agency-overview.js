// GET /api/meta/agency-overview — visão consolidada do módulo "Meta Ads".
//
// Para todos os clientes com Meta Ads + token configurado (respeitando a
// permissão de quem chama), busca insights + dados da conta na Graph API,
// soma tudo e devolve o consolidado da agência + a linha de cada cliente.
//
// Cache: cada resultado por cliente é gravado em metaSnapshots/{clientId}.
// Se < 1h e mesmo período, reusa em vez de bater na Graph de novo.
// `?force=1` ignora o cache.
//
// Query:
//   preset  last_7d | last_14d | last_30d | this_month | last_month  (default last_7d)
//   since,until  yyyy-MM-dd  (período personalizado — sobrepõe preset)
//   force   1  força recálculo

import { withInternalAuth } from '../_lib/auth.js'
import { listDocs, getDoc, setDoc } from '../_lib/firebaseAdmin.js'
import { resolveMetaToken, listAllTokenStatuses } from '../_lib/metaTokenStore.js'
import { fetchAccountInsights, fetchAccountInfo, normalizeAccountId, isAccountRestricted } from '../_lib/metaGraph.js'

const CACHE_TTL_MS = 60 * 60 * 1000 // 1h
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
    case 'last_14d':
      return rangeWithPrev(addDays(y, -13), y)
    case 'last_30d':
      return rangeWithPrev(addDays(y, -29), y)
    case 'this_month':
      return rangeWithPrev(new Date(today.getFullYear(), today.getMonth(), 1, 12), today)
    case 'last_month':
      return rangeWithPrev(
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

/** Busca (ou lê do cache) os dados de um cliente. */
async function loadClient(client, range, periodKey, force) {
  const accountId = normalizeAccountId(client.campaignPlanning?.access?.metaAdsAccountId || '')
  const base = {
    clientId: client.id,
    companyName: client.companyName || '—',
    logoUrl: client.logoUrl || null,
    ownerIds: ownerIdsOf(client),
    accountId: accountId || null,
    hasToken: true,
  }

  if (!accountId) {
    return { ...base, hasToken: true, metrics: null, note: 'sem_account_id' }
  }

  // cache
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
    metrics,
    prevMetrics,
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
    metrics,
    prevMetrics,
    daily: dailySeries,
    balance: result.balance,
    currency: result.currency,
    accountStatus: result.accountStatus,
    disableReason: result.disableReason,
  }).catch((e) => console.error('[agency-overview] falha ao gravar snapshot', client.id, e.message))

  return result
}

async function handle(req, res, user) {
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

    // Clientes com Meta Ads. Ciane/Nicolas só veem os seus.
    let eligible = clients.filter((c) => c.modules?.metaAds || c.campaignPlanning?.access?.metaAdsAccountId)
    if (user.role !== 'admin') {
      eligible = eligible.filter((c) => ownerIdsOf(c).includes(user.uid))
    }

    const rows = await Promise.all(
      eligible.map(async (c) => {
        const tokenRow = tokenByClient.get(c.id) || null
        if (!tokenRow) {
          // sem token -> linha "Sem token", nenhuma chamada à Graph
          return {
            clientId: c.id,
            companyName: c.companyName || '—',
            logoUrl: c.logoUrl || null,
            ownerIds: ownerIdsOf(c),
            accountId: normalizeAccountId(c.campaignPlanning?.access?.metaAdsAccountId || '') || null,
            hasToken: false,
            tokenExpiresAt: null,
            metrics: null,
          }
        }
        const loaded = await loadClient(c, range, periodKey, force)
        return { ...loaded, tokenExpiresAt: tokenRow.expiresAt || null }
      })
    )

    // ---- consolidação ----
    const withData = rows.filter((r) => r.metrics)
    const sum = (key) => withData.reduce((s, r) => s + (r.metrics[key] || 0), 0)
    const sumPrev = (key) => withData.reduce((s, r) => s + ((r.prevMetrics || {})[key] || 0), 0)

    const totalSpend = sum('spend')
    const totalConversations = sum('conversations')
    const totalReach = sum('reach')
    const totalImpressions = sum('impressions')
    const totalClicks = sum('clicks')

    const prevSpend = sumPrev('spend')
    const prevConversations = sumPrev('conversations')
    const prevReach = sumPrev('reach')

    const totals = {
      spend: totalSpend,
      conversations: totalConversations,
      costPerConversation: totalConversations > 0 ? totalSpend / totalConversations : 0,
      reach: totalReach,
      impressions: totalImpressions,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    }
    const prevTotals = {
      spend: prevSpend,
      conversations: prevConversations,
      reach: prevReach,
    }

    // série diária consolidada
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

    // limpa campos internos volumosos das linhas
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

export default withInternalAuth(handle)

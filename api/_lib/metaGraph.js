// Helpers da Graph API do Meta Ads compartilhados pelas Vercel Functions.
// O access_token é resolvido pelo chamador (metaTokenStore) e nunca chega
// ao frontend.

const GRAPH_VERSION = 'v19.0'

// Ordem = prioridade (igual src/utils/metaReportData.ts): o primeiro tipo
// desta lista presente nas `actions` é o usado como "Conversas iniciadas".
const CONVERSATION_ACTION_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
  'onsite_conversion.messaging_first_reply',
]

function num(v) {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function conversationsFrom(actions) {
  if (!Array.isArray(actions)) return 0
  for (const type of CONVERSATION_ACTION_TYPES) {
    const hit = actions.find((a) => a.action_type === type)
    if (hit) return num(hit.value)
  }
  return 0
}

/** "act_123" ou "123" -> "123". */
export function normalizeAccountId(raw) {
  return String(raw || '').trim().replace(/^act_/i, '')
}

/** Insights nível conta para um período. `daily` -> quebra por dia
 *  (time_increment=1). Retorna { totals, daily } já parseado. */
export async function fetchAccountInsights(token, accountId, since, until, { daily = false } = {}) {
  const fields = 'spend,impressions,reach,clicks,ctr,actions'
  const params = new URLSearchParams({
    fields,
    access_token: token,
    time_range: JSON.stringify({ since, until }),
  })
  if (daily) {
    params.set('time_increment', '1')
    params.set('limit', '400')
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/act_${accountId}/insights?${params.toString()}`
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = body?.error?.message || `Graph ${res.status}`
    const err = new Error(msg)
    err.graph = body?.error || null
    throw err
  }
  const rows = Array.isArray(body.data) ? body.data : []

  if (daily) {
    return {
      daily: rows
        .filter((r) => r.date_start)
        .map((r) => ({ date: r.date_start, spend: num(r.spend) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }
  }

  // Sem time_increment a API devolve 1 linha agregada (ou 0 se sem gasto).
  const r = rows[0] || {}
  return {
    totals: {
      spend: num(r.spend),
      impressions: num(r.impressions),
      reach: num(r.reach),
      clicks: num(r.clicks),
      ctr: num(r.ctr),
      conversations: conversationsFrom(r.actions),
    },
  }
}

/** Nome, moeda, saldo e status da conta de anúncios. `balance`/`amount_spent`
 *  vêm na menor unidade da moeda (centavos) -> dividimos por 100. */
export async function fetchAccountInfo(token, accountId) {
  const params = new URLSearchParams({
    fields: 'name,currency,balance,amount_spent,account_status,disable_reason',
    access_token: token,
  })
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/act_${accountId}?${params.toString()}`
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error?.message || `Graph ${res.status}`)
  }
  return {
    name: body.name || null,
    currency: body.currency || 'BRL',
    balance: body.balance != null ? num(body.balance) / 100 : null,
    amountSpent: body.amount_spent != null ? num(body.amount_spent) / 100 : null,
    accountStatus: body.account_status != null ? num(body.account_status) : null,
    disableReason: body.disable_reason != null ? num(body.disable_reason) : null,
  }
}

/** account_status: 1 = ativa. Qualquer outro valor = conta com restrição. */
export function isAccountRestricted(accountStatus) {
  return accountStatus != null && accountStatus !== 1
}

// Vercel Function dinâmica — GET /api/meta/:action
//
// Consolida os endpoints de LEITURA do Meta Ads num único arquivo (o plano
// Vercel Hobby limita a 12 Serverless Functions por deployment). O segmento
// [action] da URL define o recurso:
//
//   /api/meta/insights   → insights de campanhas (métricas)
//   /api/meta/account     → nome, moeda e saldo da conta
//   /api/meta/campaigns   → campanhas ativas
//   /api/meta/adsets      → conjuntos de anúncios (filtro opcional por campaign_id)
//   /api/meta/ads         → anúncios (filtro opcional por adset_id)
//
// As rotas de ESCRITA continuam em arquivos próprios: /api/meta/token,
// /api/meta/exchange-token. E /api/meta/agency-overview (consolidado + auth)
// também é arquivo próprio — rotas estáticas têm precedência sobre a dinâmica.
//
// O access_token NUNCA chega ao frontend — é resolvido aqui via
// api/_lib/metaTokenStore.js (token próprio do cliente, criptografado no
// Firestore, ou o token global da agência em META_ACCESS_TOKEN).
//
// Query params comuns:
//   account_id (obrigatório) — ID da conta, sem o prefixo "act_"
//   client_id  (opcional)    — usa o token salvo desse cliente, se houver
// Específicos de insights: date_preset | time_range (um obrigatório), fields,
//   level, breakdowns, limit, time_increment.

import { resolveMetaToken } from '../_lib/metaTokenStore.js'

const GRAPH_VERSION = 'v19.0'
const DEFAULT_INSIGHTS_FIELDS =
  'campaign_name,impressions,clicks,spend,cpc,ctr,reach,actions,cost_per_action_type'

function httpError(status, message) {
  return Object.assign(new Error(message), { httpStatus: status })
}

/** Monta o caminho + query da Graph API para cada ação. Lança httpError p/
 *  respostas 4xx antecipadas (sem account_id, ação desconhecida, etc). */
function buildGraphRequest(action, q) {
  const accountId = q.account_id
  if (!accountId) throw httpError(400, 'Parâmetro obrigatório ausente: account_id')

  switch (action) {
    case 'insights': {
      if (!q.date_preset && !q.time_range) throw httpError(400, 'Informe date_preset ou time_range')
      const params = new URLSearchParams({ fields: q.fields || DEFAULT_INSIGHTS_FIELDS })
      if (q.date_preset) params.set('date_preset', q.date_preset)
      if (q.time_range) params.set('time_range', q.time_range)
      if (q.level) params.set('level', q.level)
      if (q.breakdowns) params.set('breakdowns', q.breakdowns)
      if (q.limit) params.set('limit', q.limit)
      if (q.time_increment) params.set('time_increment', q.time_increment)
      return { path: `act_${accountId}/insights`, params, label: 'insights do Meta Ads' }
    }
    case 'account': {
      const params = new URLSearchParams({ fields: 'name,currency,balance,amount_spent' })
      return { path: `act_${accountId}`, params, label: 'dados da conta do Meta Ads' }
    }
    case 'campaigns': {
      const params = new URLSearchParams({
        fields: 'id,name,status,objective,daily_budget,lifetime_budget',
        effective_status: JSON.stringify(['ACTIVE']),
      })
      return { path: `act_${accountId}/campaigns`, params, label: 'campanhas do Meta Ads' }
    }
    case 'adsets': {
      const params = new URLSearchParams({
        fields: 'id,name,status,campaign_id,daily_budget,lifetime_budget,optimization_goal,targeting',
      })
      if (q.campaign_id) {
        params.set('filtering', JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: q.campaign_id }]))
      }
      return { path: `act_${accountId}/adsets`, params, label: 'conjuntos de anúncios do Meta Ads' }
    }
    case 'ads': {
      const params = new URLSearchParams({ fields: 'id,name,status,adset_id,campaign_id,creative' })
      if (q.adset_id) {
        params.set('filtering', JSON.stringify([{ field: 'adset.id', operator: 'EQUAL', value: q.adset_id }]))
      }
      return { path: `act_${accountId}/ads`, params, label: 'anúncios do Meta Ads' }
    }
    default:
      throw httpError(404, `Ação desconhecida em /api/meta: "${action}"`)
  }
}

export default async function handler(req, res) {
  const action = String(req.query.action || '')

  try {
    let built
    try {
      built = buildGraphRequest(action, req.query)
    } catch (err) {
      return res.status(err.httpStatus || 400).json({ error: err.message })
    }

    let resolved
    try {
      resolved = await resolveMetaToken(req.query.client_id)
    } catch (err) {
      return res.status(409).json({ error: err.message })
    }
    if (!resolved) {
      return res.status(500).json({
        error:
          'Nenhum token de acesso disponível — configure o token deste cliente em Acessos, ou META_ACCESS_TOKEN no servidor.',
      })
    }

    built.params.set('access_token', resolved.token)
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${built.path}?${built.params.toString()}`
    const safeUrl = url.replace(/access_token=[^&]+/, 'access_token=***')
    console.log(`[meta/${action}] account_id: ${req.query.account_id} — fonte do token: ${resolved.source}`)
    console.log(`[meta/${action}] URL: ${safeUrl}`)

    const metaResponse = await fetch(url)
    const data = await metaResponse.json()

    if (!metaResponse.ok) {
      const status = metaResponse.status >= 400 && metaResponse.status < 600 ? metaResponse.status : 502
      console.error(`[meta/${action}] Graph ${metaResponse.status}:`, JSON.stringify(data))
      return res.status(status).json({ error: data?.error?.message || `Erro ao buscar ${built.label}` })
    }

    console.log(`[meta/${action}] OK — linhas: ${Array.isArray(data?.data) ? data.data.length : '(sem data[])'}`)
    return res.status(200).json(data)
  } catch (err) {
    console.error(`[meta/${action}] erro interno:`, err)
    return res.status(500).json({ error: 'Erro interno ao buscar dados do Meta Ads' })
  }
}

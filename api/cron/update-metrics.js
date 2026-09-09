// Vercel Cron — GET /api/cron/update-metrics  (roda todo dia às 00:01)
//
// Recalcula o snapshot diário de métricas da empresa (MRR, clientes ativos,
// churn, LTV, receita por gestor...) e grava em /metricsSnapshots/{YYYY-MM-DD}.
// O painel "Visão Geral" do Dashboard lê o snapshot mais recente.
//
// Segurança: se CRON_SECRET estiver configurado, exige
// `Authorization: Bearer <CRON_SECRET>` (header que o Vercel Cron manda).
// Ver vercel.json → crons.

import { computeAndStoreMetrics } from '../_lib/metricsStore.js'

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'não autorizado' })
  }

  try {
    const result = await computeAndStoreMetrics()
    return res.status(200).json({ ok: true, metrics: result })
  } catch (err) {
    console.error('[cron] update-metrics falhou:', err)
    return res.status(500).json({ error: err.message })
  }
}

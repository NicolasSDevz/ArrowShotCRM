// POST /api/metrics/refresh  — botão "Atualizar agora" do painel Visão Geral.
//
// Força o recálculo do snapshot de métricas do dia. Exige um usuário interno
// logado (Authorization: Bearer <Firebase ID token>) — ver api/_lib/auth.js.

import { withInternalAuth } from '../_lib/auth.js'
import { computeAndStoreMetrics } from '../_lib/metricsStore.js'

export default withInternalAuth(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }
  try {
    const result = await computeAndStoreMetrics()
    return res.status(200).json({ ok: true, metrics: result })
  } catch (err) {
    console.error('[api] metrics/refresh falhou:', err)
    return res.status(500).json({ error: err.message })
  }
})

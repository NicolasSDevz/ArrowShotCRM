// Cálculo + gravação do snapshot diário de métricas da empresa.
// Usado pelo cron (/api/cron/update-metrics) e pelo botão "Atualizar agora"
// (/api/metrics/refresh). Toda a leitura/escrita passa pelo firebaseAdmin
// (REST + service account), então ignora as Security Rules.

import { listDocs, getDoc, setDoc } from './firebaseAdmin.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DAYS_PER_MONTH = 30.44

/** "YYYY-MM-DD" no fuso de São Paulo — id do documento do snapshot. */
export function todayId(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date)
}

function toDate(v) {
  if (!v) return null
  // firebaseAdmin.fromValue converte timestampValue -> string ISO.
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function clientStart(c) {
  return toDate(c.contractStartDate) || toDate(c.createdAt)
}

function ownerIdsOf(c) {
  if (Array.isArray(c.ownerIds) && c.ownerIds.length > 0) return c.ownerIds
  return c.ownerId ? [c.ownerId] : []
}

/** Calcula todas as métricas a partir do estado atual de `clients` + `users`.
 *  `prevMonth` (opcional) é o snapshot de ~30 dias atrás para a variação. */
export function computeMetrics(clients, users, prevMonth = null, now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const ciane = users.find((u) => (u.name || '').toLowerCase().includes('ciane'))
  const nicolas = users.find((u) => (u.name || '').toLowerCase().includes('nicolas'))

  const active = clients.filter((c) => c.status === 'active')
  const paused = clients.filter((c) => c.status === 'paused')

  const withValue = active.filter((c) => typeof c.monthlyValue === 'number' && c.monthlyValue > 0)
  const mrr = withValue.reduce((s, c) => s + c.monthlyValue, 0)
  const activeClients = active.length
  const clientsWithoutValue = activeClients - withValue.length

  // Encerrados no mês corrente (proxy: status churned + updatedAt neste mês).
  const churnedClients = clients.filter(
    (c) => c.status === 'churned' && toDate(c.updatedAt) && toDate(c.updatedAt) >= monthStart
  ).length

  // Total "no início do mês" = quem estava em carteira: ativos + pausados +
  // os que encerraram durante o mês.
  const baseStartOfMonth = activeClients + paused.length + churnedClients
  const churnRate = baseStartOfMonth > 0 ? (churnedClients / baseStartOfMonth) * 100 : 0

  // Novos clientes no mês corrente.
  const newClients = clients.filter((c) => {
    const start = clientStart(c)
    return start && start >= monthStart
  }).length

  // LTV = (MRR / ativos) × média de meses de permanência dos ativos.
  const avgMonths =
    activeClients > 0
      ? active.reduce((s, c) => {
          const start = clientStart(c)
          return s + (start ? Math.max(0, (now - start) / (MS_PER_DAY * DAYS_PER_MONTH)) : 0)
        }, 0) / activeClients
      : 0
  const ltv = activeClients > 0 ? (mrr / activeClients) * avgMonths : 0

  // Receita + nº de clientes por gestor (valor cheio p/ cada dono que casar).
  const revenueByGestor = { ciane: 0, nicolas: 0 }
  const clientsByGestor = { ciane: 0, nicolas: 0 }
  for (const c of active) {
    const owners = ownerIdsOf(c)
    const value = typeof c.monthlyValue === 'number' && c.monthlyValue > 0 ? c.monthlyValue : 0
    if (ciane && owners.includes(ciane.id)) {
      revenueByGestor.ciane += value
      clientsByGestor.ciane += 1
    }
    if (nicolas && owners.includes(nicolas.id)) {
      revenueByGestor.nicolas += value
      clientsByGestor.nicolas += 1
    }
  }

  return {
    mrr: Math.round(mrr * 100) / 100,
    activeClients,
    churnRate: Math.round(churnRate * 100) / 100,
    ltv: Math.round(ltv * 100) / 100,
    newClients,
    churnedClients,
    revenueByGestor,
    clientsByGestor,
    clientsWithoutValue,
    prevMonth: prevMonth ? { mrr: prevMonth.mrr ?? 0, activeClients: prevMonth.activeClients ?? 0 } : null,
    calculatedAt: now.toISOString(),
  }
}

/** Busca o snapshot de ~30 dias atrás (tenta alguns offsets em volta de 30). */
async function findPreviousSnapshot(now) {
  for (const offset of [30, 31, 29, 32, 28, 33, 27, 35, 25]) {
    const id = todayId(new Date(now.getTime() - offset * MS_PER_DAY))
    const doc = await getDoc(`metricsSnapshots/${id}`).catch(() => ({ exists: false }))
    if (doc.exists) return doc.data()
  }
  return null
}

/** Recalcula e grava o snapshot de hoje. Retorna o objeto de métricas. */
export async function computeAndStoreMetrics() {
  const now = new Date()
  const [clients, users] = await Promise.all([listDocs('clients'), listDocs('users')])
  const prev = await findPreviousSnapshot(now)
  const metrics = computeMetrics(clients, users, prev, now)

  const id = todayId(now)
  await setDoc(`metricsSnapshots/${id}`, { ...metrics, calculatedAt: new Date() })

  return { id, ...metrics }
}

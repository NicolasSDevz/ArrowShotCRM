import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { getClientOwnerIds, type Client } from '../types/client'
import type { AppUser } from '../types'

/** Métricas da empresa exibidas no painel "Visão Geral". Espelha o cálculo do
 *  backend (api/_lib/metricsStore.js) — o painel prefere o snapshot diário,
 *  mas usa este cálculo ao vivo como fallback antes do primeiro cron. */
export interface CompanyMetrics {
  mrr: number
  activeClients: number
  churnRate: number
  ltv: number
  newClients: number
  churnedClients: number
  revenueByGestor: { ciane: number; nicolas: number }
  clientsByGestor: { ciane: number; nicolas: number }
  clientsWithoutValue: number
}

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44

function clientStart(c: Client): Date | null {
  return c.contractStartDate?.toDate?.() ?? c.createdAt?.toDate?.() ?? null
}

export function computeCompanyMetrics(clients: Client[], users: AppUser[], now = new Date()): CompanyMetrics {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const ciane = users.find((u) => u.name.toLowerCase().includes('ciane'))
  const nicolas = users.find((u) => u.name.toLowerCase().includes('nicolas'))

  const active = clients.filter((c) => c.status === 'active')
  const paused = clients.filter((c) => c.status === 'paused')
  const withValue = active.filter((c) => (c.monthlyValue ?? 0) > 0)

  const mrr = withValue.reduce((s, c) => s + (c.monthlyValue ?? 0), 0)
  const activeClients = active.length
  const clientsWithoutValue = activeClients - withValue.length

  const churnedClients = clients.filter(
    (c) => c.status === 'churned' && (c.updatedAt?.toDate?.() ?? new Date(0)) >= monthStart
  ).length
  const base = activeClients + paused.length + churnedClients
  const churnRate = base > 0 ? (churnedClients / base) * 100 : 0

  const newClients = clients.filter((c) => {
    const s = clientStart(c)
    return s != null && s >= monthStart
  }).length

  const avgMonths =
    activeClients > 0
      ? active.reduce((s, c) => {
          const st = clientStart(c)
          return s + (st ? Math.max(0, (now.getTime() - st.getTime()) / MS_PER_MONTH) : 0)
        }, 0) / activeClients
      : 0
  const ltv = activeClients > 0 ? (mrr / activeClients) * avgMonths : 0

  const revenueByGestor = { ciane: 0, nicolas: 0 }
  const clientsByGestor = { ciane: 0, nicolas: 0 }
  for (const c of active) {
    const owners = getClientOwnerIds(c)
    const v = Math.max(0, c.monthlyValue ?? 0)
    if (ciane && owners.includes(ciane.id)) {
      revenueByGestor.ciane += v
      clientsByGestor.ciane += 1
    }
    if (nicolas && owners.includes(nicolas.id)) {
      revenueByGestor.nicolas += v
      clientsByGestor.nicolas += 1
    }
  }

  return {
    mrr,
    activeClients,
    churnRate,
    ltv,
    newClients,
    churnedClients,
    revenueByGestor,
    clientsByGestor,
    clientsWithoutValue,
  }
}

/** Série de MRR dos últimos 6 meses (incluindo o atual). Estimada a partir dos
 *  clientes em carteira hoje, back-dated pela data de início do contrato — não
 *  há histórico de churn por data, então clientes já encerrados ficam de fora. */
export function computeMrrSeries(clients: Client[], now = new Date()): { label: string; mrr: number }[] {
  const inWallet = clients.filter((c) => (c.status === 'active' || c.status === 'paused') && (c.monthlyValue ?? 0) > 0)
  const out: { label: string; mrr: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
    const mrr = inWallet
      .filter((c) => {
        const s = clientStart(c)
        return s != null && s <= monthEnd
      })
      .reduce((sum, c) => sum + (c.monthlyValue ?? 0), 0)
    const label = format(ref, 'MMM/yy', { locale: ptBR })
    out.push({ label: label.charAt(0).toUpperCase() + label.slice(1), mrr })
  }
  return out
}

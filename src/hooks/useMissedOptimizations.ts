import { useMemo } from 'react'
import { useClients } from './useClients'
import { useOptimizationSchedule, useRecentOptimizations } from './useOptimizations'
import { previousBusinessDay } from '../utils/businessDays'
import { hasContractedPaidTraffic, trafficServices } from '../utils/clientServices'
import type { OptimizationPlatform } from '../types'

export interface MissedOptimization {
  clientId: string
  name: string
  platforms: OptimizationPlatform[]
}

/** Otimizações do dia útil anterior que ficaram sem registro. Some assim que
 *  qualquer registro do cliente entra (no dia certo ou hoje). Cliente que
 *  também é otimizado hoje não entra — já está na lista de hoje. */
export function useMissedOptimizations(userId: string | undefined) {
  const { rows } = useOptimizationSchedule()
  const { data: clients } = useClients()
  const { data: recent } = useRecentOptimizations(5)

  return useMemo(() => {
    const today = new Date()
    const day = previousBusinessDay(today)
    if (!userId) return { day, items: [] as MissedOptimization[] }
    const since = day.getTime()
    const doneSince = new Set(recent.filter((o) => (o.date?.toMillis?.() ?? 0) >= since).map((o) => o.clientId))
    const items: MissedOptimization[] = []
    for (const r of rows) {
      if (r.userId !== userId || !r.weekdays.includes(day.getDay()) || r.weekdays.includes(today.getDay())) continue
      const client = clients.find((c) => c.id === r.clientId)
      if (!client || client.status === 'churned' || !hasContractedPaidTraffic(client) || doneSince.has(client.id)) continue
      items.push({ clientId: client.id, name: client.companyName, platforms: trafficServices(client).platforms })
    }
    items.sort((a, b) => a.name.localeCompare(b.name))
    return { day, items }
  }, [rows, clients, recent, userId])
}

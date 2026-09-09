import { useEffect, useState } from 'react'
import {
  subscribeClientOptimizations,
  subscribeTodayOptimizations,
  subscribeOptimizationsSince,
  subscribeOptimizationSchedule,
} from '../services/optimizationService'
import type { Optimization, OptimizationSchedule } from '../types'
import { useCollectionSubscription } from './useCollectionSubscription'

export function useClientOptimizations(clientId: string | undefined) {
  return useCollectionSubscription<Optimization>(
    (onData, onError) => subscribeClientOptimizations(clientId ?? '__none__', onData, onError),
    [clientId]
  )
}

export function useTodayOptimizations() {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const ms = startOfToday.getTime()
  return useCollectionSubscription<Optimization>(
    (onData, onError) => subscribeTodayOptimizations(ms, onData, onError),
    // recria a subscrição quando o dia vira
    [ms]
  )
}

/** Otimizações dos últimos N dias (todos os clientes). Default 30 — cobre a
 *  janela de "sem otimização há 2 semanas" do card Clientes em Risco. */
export function useRecentOptimizations(days = 30) {
  const sinceMs = (() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime() - days * 24 * 60 * 60 * 1000
  })()
  return useCollectionSubscription<Optimization>(
    (onData, onError) => subscribeOptimizationsSince(sinceMs, onData, onError),
    [sinceMs]
  )
}

export function useOptimizationSchedule() {
  const [schedule, setSchedule] = useState<OptimizationSchedule>({ rows: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = subscribeOptimizationSchedule((s) => {
      setSchedule(s)
      setLoading(false)
    })
    return unsub
  }, [])

  return { schedule, rows: schedule.rows ?? [], loading }
}

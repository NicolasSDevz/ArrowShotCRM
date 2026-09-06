import { useEffect, useState } from 'react'
import {
  subscribeClientOptimizations,
  subscribeTodayOptimizations,
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

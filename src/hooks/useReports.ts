import { useEffect, useState } from 'react'
import { subscribeReport, subscribeReports } from '../services/reportService'
import type { Report } from '../types'
import { useSharedSubscription } from './useCollectionSubscription'

/** Relatórios mais antigos que isso só carregam quando alguém pede. */
export const RECENT_REPORTS_MONTHS = 6

/** Relatórios dos últimos 6 meses; `all` traz o histórico inteiro. */
export function useReports(all = false) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setMonth(start.getMonth() - RECENT_REPORTS_MONTHS)
  const sinceMs = start.getTime()
  return useSharedSubscription<Report>(all ? 'reports:all' : `reports:since:${sinceMs}`, (onData, onError) =>
    subscribeReports(onData, onError, all ? undefined : sinceMs)
  )
}

/** Um relatório pelo id, ao vivo. */
export function useReport(id: string | undefined) {
  const [state, setState] = useState<{ id?: string; report: Report | null; loading: boolean }>({ report: null, loading: true })
  useEffect(() => {
    if (!id) return
    return subscribeReport(
      id,
      (report) => setState({ id, report, loading: false }),
      (err) => {
        console.error(err)
        setState({ id, report: null, loading: false })
      }
    )
  }, [id])
  // Enquanto o id novo não respondeu, não mostra o relatório anterior.
  return state.id === id ? state : { report: null, loading: true }
}

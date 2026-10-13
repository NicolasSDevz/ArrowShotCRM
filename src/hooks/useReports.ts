import { subscribeReports } from '../services/reportService'
import type { Report } from '../types'
import { useSharedSubscription } from './useCollectionSubscription'

export function useReports() {
  return useSharedSubscription<Report>('reports:all', (onData, onError) => subscribeReports(onData, onError))
}

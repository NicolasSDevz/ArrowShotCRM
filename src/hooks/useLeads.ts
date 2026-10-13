import { subscribeLeads } from '../services/leadService'
import type { Lead } from '../types'
import { useSharedSubscription } from './useCollectionSubscription'

export function useLeads() {
  return useSharedSubscription<Lead>('leads:all', (onData, onError) => subscribeLeads(onData, onError))
}

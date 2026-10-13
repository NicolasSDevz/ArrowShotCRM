import { subscribeTrails } from '../services/trailService'
import type { Trail } from '../types'
import { useSharedSubscription } from './useCollectionSubscription'

export function useTrails() {
  return useSharedSubscription<Trail>('trails:all', (onData, onError) => subscribeTrails(onData, onError))
}

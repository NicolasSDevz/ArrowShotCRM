import { subscribeAllContents, subscribeContents, type ContentFilters } from '../services/contentService'
import type { Content } from '../types'
import { useCollectionSubscription, useSharedSubscription } from './useCollectionSubscription'

export function useContents(filters: ContentFilters = {}) {
  return useCollectionSubscription<Content>(
    (onData, onError) => subscribeContents(onData, filters, onError),
    [filters.clientId, filters.status, filters.platform]
  )
}

export function useAllContents() {
  return useSharedSubscription<Content>('contents:all', (onData, onError) => subscribeAllContents(onData, onError))
}

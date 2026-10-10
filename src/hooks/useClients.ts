import { subscribeClients } from '../services/clientService'
import type { Client } from '../types'
import { useSharedSubscription } from './useCollectionSubscription'

export function useClients(filters?: { status?: string }) {
  const status = filters?.status
  return useSharedSubscription<Client>(`clients:${status ?? ''}`, (onData, onError) => subscribeClients(onData, status ? { status } : undefined, onError))
}

import { subscribeChamadas } from '../services/chamadaService'
import type { Chamada } from '../types/chamada'
import { useCollectionSubscription } from './useCollectionSubscription'

export function useChamadas(leadId: string) {
  return useCollectionSubscription<Chamada>((onData, onError) => subscribeChamadas(leadId, onData, onError), [leadId])
}

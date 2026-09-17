import { subscribeClientSuccessEvaluations, subscribeAllClientSuccessEvaluations } from '../services/clientSuccessService'
import type { ClientSuccessEvaluation } from '../types/clientSuccess'
import { useCollectionSubscription } from './useCollectionSubscription'

export function useClientSuccessEvaluations(clientId: string) {
  return useCollectionSubscription<ClientSuccessEvaluation>(
    (onData, onError) => subscribeClientSuccessEvaluations(clientId, onData, onError),
    [clientId]
  )
}

/** Todas as avaliações de todos os clientes — o chamador reduz para "a mais
 *  recente por cliente" (ver utils/clientSuccessLatest.ts). */
export function useAllClientSuccessEvaluations() {
  return useCollectionSubscription<ClientSuccessEvaluation>(
    (onData, onError) => subscribeAllClientSuccessEvaluations(onData, onError),
    []
  )
}

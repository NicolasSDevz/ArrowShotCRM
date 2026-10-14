import { subscribeJornada } from '../services/jornadaService'
import type { JornadaMes } from '../types/jornada'
import { useCollectionSubscription } from './useCollectionSubscription'

export function useJornada(clientId: string | undefined) {
  return useCollectionSubscription<JornadaMes>(
    (onData, onError) => subscribeJornada(clientId ?? '__none__', onData, onError),
    [clientId],
  )
}

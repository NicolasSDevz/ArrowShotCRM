import { subscribeLeadForms } from '../services/leadFormService'
import type { LeadForm } from '../types/leadForm'
import { useSharedSubscription } from './useCollectionSubscription'

export function useLeadForms() {
  return useSharedSubscription<LeadForm>('leadForms:all', (onData, onError) => subscribeLeadForms(onData, onError))
}

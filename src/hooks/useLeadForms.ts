import { subscribeLeadForms } from '../services/leadFormService'
import type { LeadForm } from '../types/leadForm'
import { useCollectionSubscription } from './useCollectionSubscription'

export function useLeadForms() {
  return useCollectionSubscription<LeadForm>((onData, onError) => subscribeLeadForms(onData, onError), [])
}

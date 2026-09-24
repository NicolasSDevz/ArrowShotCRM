import { useMemo } from 'react'
import { subscribeLeadPipelines } from '../services/leadPipelineService'
import { resolvePipelines, type LeadPipeline, type ResolvedPipeline } from '../types/leadPipeline'
import { useCollectionSubscription } from './useCollectionSubscription'

/** Pipelines de leads já resolvidos: o padrão ("Vendas") sempre primeiro,
 *  depois os criados pelo time. `docs` são os documentos crus do Firestore. */
export function useLeadPipelines(): { pipelines: ResolvedPipeline[]; docs: LeadPipeline[]; loading: boolean } {
  const { data, loading } = useCollectionSubscription<LeadPipeline>((onData, onError) => subscribeLeadPipelines(onData, onError), [])
  const pipelines = useMemo(() => resolvePipelines(data), [data])
  return { pipelines, docs: data, loading }
}

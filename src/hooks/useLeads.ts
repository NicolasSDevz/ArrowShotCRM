import { subscribeActiveLeads, subscribeLeads } from '../services/leadService'
import type { Lead } from '../types'
import { useSharedSubscription } from './useCollectionSubscription'
import { useLeadPipelines } from './useLeadPipelines'

/** Ganhos e perdidos há mais que isso não são carregados no dia a dia. */
export const ACTIVE_LEADS_DAYS = 90

/** Leads do dia a dia: todos os abertos + os que mudaram de etapa nos
 *  últimos 90 dias. Ganhos e perdidos antigos ficam de fora para não reler o
 *  histórico inteiro a cada visita (ver useAllLeads). */
export function useLeads() {
  const { pipelines, loading } = useLeadPipelines()
  const openIds = [...new Set(pipelines.flatMap((p) => p.stages.filter((s) => s.kind === 'open').map((s) => s.id)))].sort()
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const sinceMs = start.getTime() - ACTIVE_LEADS_DAYS * 24 * 60 * 60 * 1000
  // Espera os pipelines para não abrir o listener duas vezes (as etapas abertas mudam a consulta).
  const key = loading ? null : `leads:active:${sinceMs}:${openIds.join(',')}`
  return useSharedSubscription<Lead>(key, (onData, onError) => subscribeActiveLeads(openIds, sinceMs, onData, onError))
}

/** Todos os leads, inclusive ganhos e perdidos antigos. `enabled` false não lê nada. */
export function useAllLeads(enabled = true) {
  return useSharedSubscription<Lead>(enabled ? 'leads:all' : null, (onData, onError) => subscribeLeads(onData, onError))
}

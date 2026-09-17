import { where, orderBy, type FirestoreError } from 'firebase/firestore'
import { collectionService } from './firestore'
import { logActivity } from './activityService'
import type { ClientSuccessEvaluation, ClientSuccessScores } from '../types/clientSuccess'
import { averageClientSuccessScore, classifyClientSuccessScore, CLIENT_SUCCESS_TIER_LABEL } from '../types/clientSuccess'

const COLLECTION = 'clientSuccessEvaluations'
const base = collectionService<ClientSuccessEvaluation>(COLLECTION)

export async function createClientSuccessEvaluation(
  clientId: string,
  clientName: string,
  referenceMonth: string,
  scores: ClientSuccessScores,
  notes: string | undefined,
  userId: string,
  userName: string
) {
  const score = averageClientSuccessScore(scores)
  const tier = classifyClientSuccessScore(score)

  const id = await base.create(
    {
      clientId,
      referenceMonth,
      scores,
      score,
      tier,
      notes: notes || undefined,
      evaluatedByName: userName,
    },
    userId
  )

  await logActivity({
    entityType: 'client',
    entityId: clientId,
    clientId,
    action: 'created',
    message: `registrou a avaliação de Sucesso do Cliente de ${referenceMonth} — ${CLIENT_SUCCESS_TIER_LABEL[tier]} (${score.toFixed(1)}/5) — ${clientName}`,
    userId,
    userName,
  })

  return id
}

export async function deleteClientSuccessEvaluation(
  evaluation: ClientSuccessEvaluation,
  userId: string,
  userName: string
) {
  await base.remove(evaluation.id)

  await logActivity({
    entityType: 'client',
    entityId: evaluation.clientId,
    clientId: evaluation.clientId,
    action: 'deleted',
    message: `excluiu a avaliação de Sucesso do Cliente de ${evaluation.referenceMonth}`,
    userId,
    userName,
  })
}

/** Avaliações de um cliente, mais recente primeiro (por mês de referência). */
export function subscribeClientSuccessEvaluations(
  clientId: string,
  onData: (items: ClientSuccessEvaluation[]) => void,
  onError?: (err: FirestoreError) => void
) {
  return base.subscribe(
    [where('clientId', '==', clientId), orderBy('referenceMonth', 'desc')],
    onData,
    onError
  )
}

/** Todas as avaliações — usado só pelo widget "Resumo por cliente" do
 *  Dashboard para achar a classificação mais recente de cada cliente. */
export function subscribeAllClientSuccessEvaluations(
  onData: (items: ClientSuccessEvaluation[]) => void,
  onError?: (err: FirestoreError) => void
) {
  return base.subscribe([orderBy('referenceMonth', 'desc')], onData, onError)
}

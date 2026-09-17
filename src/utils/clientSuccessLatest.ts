import type { ClientSuccessEvaluation } from '../types/clientSuccess'

/** Reduz a lista completa de avaliações para a mais recente de cada cliente
 *  (maior `referenceMonth`; em empate, `createdAt` mais recente). */
export function latestClientSuccessByClient(
  evaluations: ClientSuccessEvaluation[]
): Record<string, ClientSuccessEvaluation> {
  const result: Record<string, ClientSuccessEvaluation> = {}
  for (const evaluation of evaluations) {
    const current = result[evaluation.clientId]
    if (!current) {
      result[evaluation.clientId] = evaluation
      continue
    }
    const isNewer =
      evaluation.referenceMonth > current.referenceMonth ||
      (evaluation.referenceMonth === current.referenceMonth && evaluation.createdAt.toMillis() > current.createdAt.toMillis())
    if (isNewer) result[evaluation.clientId] = evaluation
  }
  return result
}

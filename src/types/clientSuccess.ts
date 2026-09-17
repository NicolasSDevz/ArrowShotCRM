import type { BaseDoc } from './common'

/** As 5 dimensões avaliadas mensalmente pelo CS (Janilson) na aba "Sucesso
 *  do Cliente" da ficha do cliente. Cada uma vai de 1 a 5. */
export type ClientSuccessCriterion = 'meetings' | 'whatsapp' | 'materials' | 'platform' | 'payment'

export const CLIENT_SUCCESS_CRITERIA: ClientSuccessCriterion[] = [
  'meetings',
  'whatsapp',
  'materials',
  'platform',
  'payment',
]

export const CLIENT_SUCCESS_CRITERION_LABEL: Record<ClientSuccessCriterion, string> = {
  meetings: 'Comparecimento nas reuniões',
  whatsapp: 'Engajamento no grupo do WhatsApp',
  materials: 'Envio de materiais para criativos',
  platform: 'Abastecimento da plataforma',
  payment: 'Pagamento da mensalidade',
}

/** Descrição de cada nota (1-5) por critério — mostrada no formulário de
 *  avaliação para orientar quem preenche. */
export const CLIENT_SUCCESS_SCORE_DESCRIPTION: Record<ClientSuccessCriterion, Record<1 | 2 | 3 | 4 | 5, string>> = {
  meetings: {
    1: 'Faltou todas as reuniões do mês',
    2: 'Faltou a maioria das reuniões',
    3: 'Compareceu a algumas reuniões',
    4: 'Compareceu à maioria das reuniões',
    5: 'Compareceu a todas as reuniões',
  },
  whatsapp: {
    1: 'Sem resposta ou muito difícil de contatar',
    2: 'Demora muito para responder',
    3: 'Responde quando provocado',
    4: 'Responde com agilidade',
    5: 'Muito engajado e proativo',
  },
  materials: {
    1: 'Não enviou nenhum material',
    2: 'Enviou poucos materiais',
    3: 'Enviou alguns materiais com atraso',
    4: 'Enviou a maioria dos materiais pedidos',
    5: 'Enviou todos os materiais no prazo',
  },
  platform: {
    1: 'Não participou nada',
    2: 'Participação mínima',
    3: 'Participação parcial',
    4: 'Boa participação',
    5: 'Plataforma sempre atualizada',
  },
  payment: {
    1: 'Pagamento muito atrasado (mais de 15 dias)',
    2: 'Pagamento atrasado (8 a 15 dias)',
    3: 'Pagamento atrasado (1 a 7 dias)',
    4: 'Pagamento no prazo',
    5: 'Pagamento antecipado',
  },
}

export type ClientSuccessScores = Record<ClientSuccessCriterion, number>

export type ClientSuccessTier = 'ouro' | 'saudavel' | 'atencao' | 'risco'

export const CLIENT_SUCCESS_TIER_LABEL: Record<ClientSuccessTier, string> = {
  ouro: '⭐ Cliente Ouro',
  saudavel: '✅ Cliente Saudável',
  atencao: '⚠️ Cliente em Atenção',
  risco: '🔴 Cliente em Risco',
}

/** Classes de badge por classificação (ver index.css — segue o mesmo padrão
 *  de CLIENT_STATUS_BADGE). */
export const CLIENT_SUCCESS_TIER_BADGE: Record<ClientSuccessTier, string> = {
  ouro: 'bg-emerald-100 text-emerald-700',
  saudavel: 'bg-blue-100 text-blue-700',
  atencao: 'bg-amber-100 text-amber-700',
  risco: 'bg-red-100 text-red-700',
}

/** Média das 5 notas -> classificação (ver TAREFA 1: CÁLCULO DO NPS INTERNO). */
export function classifyClientSuccessScore(score: number): ClientSuccessTier {
  if (score >= 4.5) return 'ouro'
  if (score >= 3.5) return 'saudavel'
  if (score >= 2.5) return 'atencao'
  return 'risco'
}

export function averageClientSuccessScore(scores: ClientSuccessScores): number {
  const values = CLIENT_SUCCESS_CRITERIA.map((c) => scores[c] ?? 0)
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Uma avaliação mensal — `referenceMonth` no formato YYYY-MM. `score` é
 *  persistido (não só derivado) para poder ser lido direto pelo widget do
 *  Dashboard sem recalcular todas as avaliações. */
export interface ClientSuccessEvaluation extends BaseDoc {
  clientId: string
  referenceMonth: string
  scores: ClientSuccessScores
  score: number
  tier: ClientSuccessTier
  notes?: string
  evaluatedByName: string
}

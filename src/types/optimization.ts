import type { Timestamp } from 'firebase/firestore'
import type { BaseDoc } from './common'

export type OptimizationPlatform = 'meta' | 'google'

export const OPTIMIZATION_PLATFORM_LABEL: Record<OptimizationPlatform, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
}

/** Um registro de otimização de campanhas de um cliente, num dia. */
export interface Optimization extends BaseDoc {
  clientId: string
  date: Timestamp
  platforms: OptimizationPlatform[]
  /** "Otimizações realizadas" — texto livre. Registros de plataforma única
   *  usam este campo; registros com Meta+Google preenchem os campos
   *  específicos abaixo e mantêm aqui uma versão combinada (fallback). */
  optimizationsText: string
  notes?: string
  /** Campos por plataforma — usados quando o cliente tem Meta E Google.
   *  Ausentes em registros antigos (leia `optimizationsText`/`notes`). */
  metaOptimizationsText?: string
  googleOptimizationsText?: string
  metaNotes?: string
  googleNotes?: string
  /** Saldo atual da conta no dia, por plataforma (BRL). */
  metaBalance?: number
  googleBalance?: number
  responsavelId: string
  responsavelName: string
}

export type OptimizationInput = Omit<Optimization, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>

/** Chips de sugestão rápida no formulário. */
export const OPTIMIZATION_SUGGESTIONS = [
  'Pausei anúncios com baixo desempenho',
  'Aumentei orçamento das campanhas ativas',
  'Criei novos públicos',
  'Ajustei lances',
  'Atualizei criativos',
  'Sem otimização necessária',
]

/** Uma linha do calendário global de otimizações: qual gestor otimiza qual
 *  cliente e em quais dias da semana (0=domingo … 6=sábado). Guardado num
 *  único doc `settings/optimizationSchedule` (campo `rows`). */
export interface OptimizationScheduleRow {
  clientId: string
  userId: string
  weekdays: number[]
}

export interface OptimizationSchedule {
  rows: OptimizationScheduleRow[]
  updatedAt?: Timestamp
  updatedBy?: string
}

const WEEKDAY_SINGULAR = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const WEEKDAY_LABEL_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
/** Só dias úteis — o seletor de dias de otimização não oferece fim de semana. */
export const OPTIMIZATION_WEEKDAYS = [1, 2, 3, 4, 5]

/** [1,3] -> "Segundas e Quartas". */
export function weekdaysLabel(days: number[]): string {
  const sorted = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
  if (sorted.length === 0) return '—'
  const names = sorted.map((d) => `${WEEKDAY_SINGULAR[d]}s`)
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
}

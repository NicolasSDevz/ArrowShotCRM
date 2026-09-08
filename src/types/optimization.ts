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

/** Chips de sugestão rápida no formulário — específicos por plataforma. */
export const OPTIMIZATION_SUGGESTIONS_META = [
  'Sem otimização necessária',
  'Pausei anúncios com baixo desempenho',
  'Ativei novos anúncios',
  'Ajustei orçamento das campanhas',
  'Atualizei criativos (imagem/vídeo)',
  'Criei novos públicos personalizados',
  'Atualizei públicos lookalike',
  'Ajustei segmentação de público',
  'Testei novo formato de anúncio',
  'Dupliquei conjunto de anúncios com melhor performance',
  'Pausei público com alto CPL',
  'Ativei campanha de remarketing',
  'Ajustei lances da campanha',
  'Atualizei texto/copy dos anúncios',
  'Verifiquei pixel e eventos de conversão',
  'Ajustei posicionamentos dos anúncios',
]

export const OPTIMIZATION_SUGGESTIONS_GOOGLE = [
  'Sem otimização necessária',
  'Pausei palavras-chave com baixo desempenho',
  'Adicionei novas palavras-chave',
  'Adicionei palavras-chave negativas',
  'Ajustei lances por palavra-chave',
  'Ajustei orçamento diário da campanha',
  'Atualizei anúncios responsivos (RSA)',
  'Pausei anúncios com baixo CTR',
  'Ajustei extensões de anúncio',
  'Revisei correspondência de palavras-chave',
  'Ajustei segmentação geográfica',
  'Ajustei programação de anúncios (horários)',
  'Ativei ajuste de lance por dispositivo',
  'Verifiquei tag de conversão no GTM',
  'Analisei termos de pesquisa e negativei irrelevantes',
  'Ajustei estratégia de lances (CPC manual/tROAS/tCPA)',
]

export const OPTIMIZATION_SUGGESTIONS_BY_PLATFORM: Record<OptimizationPlatform, string[]> = {
  meta: OPTIMIZATION_SUGGESTIONS_META,
  google: OPTIMIZATION_SUGGESTIONS_GOOGLE,
}

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

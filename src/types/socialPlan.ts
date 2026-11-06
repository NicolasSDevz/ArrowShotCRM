import type { ContentPillar, ContentType } from './content'

/** Um dia fixo da grade semanal: em que dia da semana sai e qual formato.
 *  weekday segue o Date#getDay(): 0 = domingo … 6 = sábado. */
export interface SocialPlanSlot {
  weekday: number
  type: ContentType
}

/** Plano de Social Mídia vendido ao cliente (substitui o antigo `package`
 *  semanal/mensal). A grade se repete toda semana; o mês é gerado a partir
 *  dela pelo botão "Gerar mês". */
export interface SocialPlan {
  postsPerWeek: 2 | 3
  slots: SocialPlanSlot[]
  /** Horário padrão de publicação ("HH:mm"). */
  time?: string
}

export const WEEKDAY_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** Formatos que entram na grade do plano. */
export const PLAN_FORMATS: ContentType[] = ['post', 'carousel', 'reels']

export const DEFAULT_SOCIAL_PLANS: Record<2 | 3, SocialPlan> = {
  3: {
    postsPerWeek: 3,
    time: '11:00',
    slots: [
      { weekday: 1, type: 'post' },
      { weekday: 3, type: 'carousel' },
      { weekday: 5, type: 'reels' },
    ],
  },
  2: {
    postsPerWeek: 2,
    time: '11:00',
    slots: [
      { weekday: 2, type: 'carousel' },
      { weekday: 4, type: 'reels' },
    ],
  },
}

/** Rodízio dos pilares ao longo do mês — os 4 que sustentam a grade de
 *  limpeza (resultado, dica, prova, oferta), com respiros de bastidor e
 *  autoridade. A sequência continua de um post para o outro, então cada
 *  formato acaba passando por pilares diferentes. */
export const PILLAR_ROTATION: ContentPillar[] = [
  'antes_depois',
  'educativo',
  'prova_social',
  'comercial',
  'bastidores',
  'dor_solucao',
  'autoridade',
  'diferenciais',
]

export function socialPlanLabel(plan: SocialPlan): string {
  const days = [...plan.slots]
    .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))
    .map((s) => WEEKDAY_SHORT[s.weekday])
    .join(', ')
  return `${plan.postsPerWeek}x por semana (${days})`
}

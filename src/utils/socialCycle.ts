import { addMonths, isSameMonth, startOfMonth } from 'date-fns'
import type { Content, ContentStatus } from '../types/content'

/** Ciclo mensal de Social Mídia (o mesmo para todos os clientes):
 *   dia 10–15  planejamento do mês seguinte (Gerar mês)
 *   dia 15–22  produção em lote
 *   dia 22–25  aprovação (link do mês)
 *   dia 25–28  ajustes + agendamento
 *  Do dia 10 em diante o ciclo olha para o mês seguinte; antes disso, para o
 *  mês corrente (que já devia estar todo agendado). */
export const CYCLE_DAYS = { plan: 15, send: 22, approve: 25, schedule: 28 }

export type CycleStage = 'plan' | 'production' | 'review' | 'client' | 'schedule' | 'done'

export const CYCLE_STAGE_LABEL: Record<CycleStage, string> = {
  plan: 'Planejar o mês',
  production: 'Em produção',
  review: 'Revisão interna',
  client: 'Com o cliente',
  schedule: 'Falta agendar',
  done: 'Mês agendado',
}

export const CYCLE_STAGE_CLASS: Record<CycleStage, string> = {
  plan: 'bg-slate-100 text-slate-600',
  production: 'bg-blue-100 text-blue-700',
  review: 'bg-amber-100 text-amber-700',
  client: 'bg-violet-100 text-violet-700',
  schedule: 'bg-teal-100 text-teal-700',
  done: 'bg-emerald-100 text-emerald-700',
}

const RANK: Record<ContentStatus, number> = {
  ideas: 0,
  production: 0,
  review: 1,
  waiting_client: 2,
  approved: 3,
  scheduled: 4,
  published: 4,
  cancelled: 99,
}

export interface CycleStatus {
  month: Date
  stage: CycleStage
  total: number
  /** Quantos já passaram da etapa atual (para a barrinha). */
  counts: { production: number; review: number; client: number; approved: number; scheduled: number }
  late: string | null
}

export function cycleTargetMonth(today = new Date()): Date {
  return startOfMonth(addMonths(today, today.getDate() >= 10 ? 1 : 0))
}

export function clientCycle(contents: Content[], today = new Date()): CycleStatus {
  const month = cycleTargetMonth(today)
  const posts = contents.filter((c) => c.status !== 'cancelled' && c.scheduledDate && isSameMonth(c.scheduledDate.toDate(), month))
  const ranks = posts.map((c) => RANK[c.status])
  const counts = {
    production: ranks.filter((r) => r === 0).length,
    review: ranks.filter((r) => r === 1).length,
    client: ranks.filter((r) => r === 2).length,
    approved: ranks.filter((r) => r === 3).length,
    scheduled: ranks.filter((r) => r === 4).length,
  }
  const min = ranks.length ? Math.min(...ranks) : -1
  const stage: CycleStage =
    min === -1 ? 'plan' : min === 0 ? 'production' : min === 1 ? 'review' : min === 2 ? 'client' : min === 3 ? 'schedule' : 'done'

  const day = today.getDate()
  const nextMonth = !isSameMonth(month, today)
  let late: string | null = null
  if (!nextMonth) {
    if (stage !== 'done') late = 'O mês já começou e ainda não está todo agendado'
  } else if (stage === 'plan' && day > CYCLE_DAYS.plan) late = 'Planejamento atrasado (era até o dia 15)'
  else if ((stage === 'production' || stage === 'review') && day > CYCLE_DAYS.send) late = 'Envio para aprovação atrasado (era até o dia 22)'
  else if (stage === 'client' && day > CYCLE_DAYS.approve) late = 'Cliente ainda não respondeu (prazo dia 25)'
  else if (stage !== 'done' && day > CYCLE_DAYS.schedule) late = 'Agendamento atrasado (era até o dia 28)'

  return { month, stage, total: posts.length, counts, late }
}

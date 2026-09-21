import type { Timestamp } from 'firebase/firestore'

/** Estado dos checks do widget "Envio de Relatórios Semanais" (Dashboard de
 *  Ciane/Nicolas, toda segunda) — um doc por gestor por semana ISO, id
 *  `{userId}_{weekKey}` (ver utils/isoWeek.ts). `checks` mapeia clientId ->
 *  já enviado ou não. `completedAt` marca a semana como concluída — depois
 *  disso o widget não reaparece mais até a próxima segunda (nova semana =
 *  novo doc). */
export interface WeeklyReportCheck {
  userId: string
  weekKey: string
  checks: Record<string, boolean>
  completedAt: Timestamp | null
  updatedAt?: Timestamp
}

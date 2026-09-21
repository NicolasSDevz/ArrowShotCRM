import { getISOWeek, getISOWeekYear } from 'date-fns'

/** "2026-W38" — chave da semana ISO de uma data (segunda a domingo, semana
 *  1 é a que contém a primeira quinta-feira do ano). Usada como parte do id
 *  de /weeklyReportChecks/{userId}_{weekKey} — vira um doc novo a cada
 *  semana automaticamente, sem precisar resetar nada manualmente. */
export function isoWeekKey(date: Date = new Date()): string {
  const year = getISOWeekYear(date)
  const week = getISOWeek(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

import { startOfDay } from 'date-fns'

/** Dias úteis (seg–sex) de hoje até `target`. Negativo se `target` já
 *  passou. Extraído de SocialContentWidget.tsx pra ser reaproveitado no
 *  estado "urgente" do ContentCard do Kanban. */
export function businessDaysBetween(target: Date): number {
  const a = startOfDay(new Date())
  const b = startOfDay(target)
  if (b.getTime() === a.getTime()) return 0
  const sign = b > a ? 1 : -1
  let count = 0
  const cur = new Date(sign > 0 ? a : b)
  const end = sign > 0 ? b : a
  while (cur < end) {
    cur.setDate(cur.getDate() + 1)
    const d = cur.getDay()
    if (d !== 0 && d !== 6) count++
  }
  return count * sign
}

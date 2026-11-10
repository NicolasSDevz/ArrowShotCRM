import type { MetaAgencyRow } from '../services/metaAgencyService'

/** Mesma regra do aviso do cron (api/cron/daily.js): saldo pra menos de 3 dias
 *  de gasto, nunca menos que R$ 30. Só vale pra conta pré-paga ou com limite;
 *  cartão sem limite não acaba. */
export const BALANCE_DAYS = 3
export const BALANCE_MIN = 30

export interface BalanceAlert {
  clientId: string
  companyName: string
  available: number
  /** Gasto médio por dia no período. */
  perDay: number
  /** Dias que o saldo ainda dura; null quando a conta não gastou na semana. */
  days: number | null
  /** true = saldo zerado (anúncios parados ou quase). */
  empty: boolean
}

/** `periodDays` = quantos dias o gasto de `rows` cobre (padrão 7, "últimos 7 dias"). */
export function balanceAlerts(rows: MetaAgencyRow[], periodDays = 7): BalanceAlert[] {
  const span = Math.max(1, periodDays)
  const out: BalanceAlert[] = []
  for (const r of rows) {
    if (r.available == null || r.restricted) continue
    const perDay = (r.metrics?.spend ?? 0) / span
    const empty = r.available < 1
    // Sem gasto na semana e com saldo: conta parada de propósito, não avisa.
    if (!empty && perDay <= 0) continue
    // Zerada e sem gasto nenhum na semana: cliente que não roda Meta, não avisa.
    if (empty && perDay <= 0) continue
    const limit = Math.max(BALANCE_MIN, perDay * BALANCE_DAYS)
    if (!empty && r.available >= limit) continue
    out.push({
      clientId: r.clientId,
      companyName: r.companyName,
      available: r.available,
      perDay,
      days: perDay > 0 ? r.available / perDay : null,
      empty,
    })
  }
  return out.sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
}

export function balanceDaysLabel(a: BalanceAlert): string {
  if (a.empty) return 'sem saldo'
  if (a.days == null || a.days < 1) return 'acaba hoje'
  const d = Math.floor(a.days)
  return `dá uns ${d} dia${d > 1 ? 's' : ''}`
}

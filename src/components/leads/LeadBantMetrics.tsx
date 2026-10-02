import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Gauge } from 'lucide-react'
import {
  LEAD_TEMPERATURE_BADGE,
  LEAD_TEMPERATURE_LABEL,
  clientChurnDate,
  isRevenueChurn,
  leadTemperature,
  stageOfLead,
  type Client,
  type Lead,
  type LeadTemperature,
  type ResolvedPipeline,
} from '../../types'

const TEMPS: LeadTemperature[] = ['hot', 'warm', 'cold', 'disqualified']
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '–')

/** Métricas do material BANT ("Métricas para acompanhar"), calculadas com os
 *  leads do pipeline aberto: lead qualificado, comparecimento, fechamento e
 *  churn em 90 dias por faixa. */
export function LeadBantMetrics({ leads, pipeline, clients }: { leads: Lead[]; pipeline: ResolvedPipeline; clients: Client[] }) {
  // Lembra se o painel ficou aberto ou fechado (o quadro de leads ganha espaço fechado).
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem('leadsBantPanel') !== 'closed'
    } catch {
      return true
    }
  })
  const setOpen = (fn: (v: boolean) => boolean) =>
    setOpenState((v) => {
      const next = fn(v)
      try {
        localStorage.setItem('leadsBantPanel', next ? 'open' : 'closed')
      } catch {
        /* sem localStorage: só não lembra */
      }
      return next
    })

  const data = useMemo(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]))
    const meetingIdx = pipeline.stages.findIndex((s) => s.id === 'meeting_scheduled' || /reuni/i.test(s.label))
    const stageIdx = (l: Lead) => pipeline.stages.findIndex((s) => s.id === stageOfLead(pipeline, l.status).id)
    const isWon = (l: Lead) => stageOfLead(pipeline, l.status).kind === 'won' || !!l.convertedClientId

    const scored = leads.filter((l) => leadTemperature(l.bant))
    const byTemp = Object.fromEntries(TEMPS.map((t) => [t, scored.filter((l) => leadTemperature(l.bant) === t)])) as Record<LeadTemperature, Lead[]>

    // Comparecimento: leads que chegaram na etapa de reunião (ou passaram dela)
    // e quantos têm uma reunião registrada no histórico de contatos.
    const scheduled =
      meetingIdx >= 0 ? leads.filter((l) => stageOfLead(pipeline, l.status).kind !== 'lost' && stageIdx(l) >= meetingIdx) : []
    const held = scheduled.filter((l) => (l.contactHistory ?? []).some((c) => c.type === 'meeting'))

    const perTemp = TEMPS.map((t) => {
      const list = byTemp[t]
      const won = list.filter(isWon)
      // Churn em 90 dias: virou cliente e o cliente saiu em até 90 dias.
      const converted = list.filter((l) => l.convertedClientId && clientById.get(l.convertedClientId))
      const churned90 = converted.filter((l) => {
        const c = clientById.get(l.convertedClientId!)!
        const end = clientChurnDate(c)
        const start = l.convertedAt?.toDate() ?? c.createdAt?.toDate()
        return !!end && !!start && isRevenueChurn(c) && end.getTime() - start.getTime() <= 90 * 86_400_000
      })
      return { t, total: list.length, won: won.length, converted: converted.length, churned90: churned90.length }
    })

    return {
      total: leads.length,
      scored: scored.length,
      hot: byTemp.hot.length,
      scheduled: scheduled.length,
      held: held.length,
      perTemp,
    }
  }, [leads, pipeline, clients])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600" aria-hidden="true">
          <Gauge size={15} />
        </span>
        <span className="text-sm font-bold text-slate-900">Qualificação BANT</span>
        <span className="text-xs text-slate-500">
          {data.scored} de {data.total} leads avaliados
        </span>
        <span className="ml-auto text-slate-400" aria-hidden="true">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-slate-100 p-4">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label="Lead qualificado" value={pct(data.hot, data.total)} hint={`${data.hot} quentes de ${data.total} leads`} />
            <Stat label="Comparecimento" value={pct(data.held, data.scheduled)} hint={`${data.held} reuniões feitas de ${data.scheduled} agendadas`} />
            <Stat label="Avaliados no BANT" value={pct(data.scored, data.total)} hint="Leads com as 4 notas dadas" />
            <Stat
              label="Fechamento dos quentes"
              value={pct(data.perTemp[0].won, data.perTemp[0].total)}
              hint={`${data.perTemp[0].won} fechados de ${data.perTemp[0].total}`}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <caption className="sr-only">Resultado por faixa de score</caption>
              <thead className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-2 pr-3">Faixa</th>
                  <th className="py-2 pr-3">Leads</th>
                  <th className="py-2 pr-3">Fechados</th>
                  <th className="py-2 pr-3">Fechamento</th>
                  <th className="py-2 pr-3">Churn em 90 dias</th>
                </tr>
              </thead>
              <tbody>
                {data.perTemp.map((r) => (
                  <tr key={r.t} className="border-t border-slate-100 text-slate-700">
                    <td className="py-2 pr-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${LEAD_TEMPERATURE_BADGE[r.t]}`}>{LEAD_TEMPERATURE_LABEL[r.t]}</span>
                    </td>
                    <td className="py-2 pr-3 font-semibold">{r.total}</td>
                    <td className="py-2 pr-3">{r.won}</td>
                    <td className="py-2 pr-3 font-semibold">{pct(r.won, r.total)}</td>
                    <td className="py-2 pr-3">
                      {r.converted > 0 ? `${pct(r.churned90, r.converted)} (${r.churned90} de ${r.converted})` : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Meça por faixa de score para calibrar o scorecard: se os mornos fecham tanto quanto os quentes, ou os quentes dão churn cedo, ajuste os critérios.
          </p>
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      <p className="truncate text-[11px] text-slate-400">{hint}</p>
    </div>
  )
}

import { useMemo } from 'react'
import { endOfDay, format, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CheckCircle2 } from 'lucide-react'
import { useClientOptimizations } from '../../hooks/useOptimizations'
import { platformBadgeLabel } from '../../utils/clientServices'
import type { Optimization, OptimizationPlatform } from '../../types'

/** Linhas de uma otimização registrada (um ajuste por linha), sem os
 *  registros de "nada a fazer". */
function actionLines(text?: string): string[] {
  if (!text) return []
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[•\-*]\s*/, '').trim())
    .filter((l) => l && !/^sem otimiza[cç][aã]o necess[aá]ria\.?$/i.test(l) && !/^(meta|google) ads:$/i.test(l))
}

function entriesOf(o: Optimization): { platform: OptimizationPlatform | null; lines: string[] }[] {
  const out: { platform: OptimizationPlatform | null; lines: string[] }[] = []
  if (o.metaOptimizationsText || o.googleOptimizationsText) {
    const meta = actionLines(o.metaOptimizationsText)
    const google = actionLines(o.googleOptimizationsText)
    if (meta.length) out.push({ platform: 'meta', lines: meta })
    if (google.length) out.push({ platform: 'google', lines: google })
  } else {
    const lines = actionLines(o.optimizationsText)
    if (lines.length) out.push({ platform: o.platforms?.length === 1 ? o.platforms[0] : null, lines })
  }
  return out
}

/** "O que fizemos no período" — as otimizações registradas pela equipe
 *  (Otimizações de hoje / ficha do cliente) dentro das datas do relatório.
 *  Lido ao vivo: registrar uma otimização atrasada também aparece aqui. */
export function ReportWorkDoneSection({ clientId, start, end }: { clientId: string; start: Date; end: Date }) {
  const { data, loading } = useClientOptimizations(clientId)

  const days = useMemo(() => {
    const from = startOfDay(start).getTime()
    const to = endOfDay(end).getTime()
    return data
      .filter((o) => {
        const t = o.date?.toMillis?.() ?? 0
        return t >= from && t <= to
      })
      .sort((a, b) => (a.date?.toMillis?.() ?? 0) - (b.date?.toMillis?.() ?? 0))
      .map((o) => ({ id: o.id, date: o.date.toDate(), entries: entriesOf(o) }))
      .filter((d) => d.entries.length > 0)
  }, [data, start, end])

  const totalActions = days.reduce((s, d) => s + d.entries.reduce((n, e) => n + e.lines.length, 0), 0)

  if (loading) return <p className="text-sm text-slate-400">Carregando otimizações…</p>
  if (days.length === 0) {
    return <p className="text-sm text-slate-400">Nenhuma otimização registrada nesse período.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-5 py-3">
          <p className="text-[26px] font-extrabold text-[#0F172A]">{days.length}</p>
          <p className="text-xs text-slate-500">dias com otimização</p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-5 py-3">
          <p className="text-[26px] font-extrabold text-[#0F172A]">{totalActions}</p>
          <p className="text-xs text-slate-500">ajustes nas campanhas</p>
        </div>
      </div>
      <ol className="flex flex-col gap-2.5">
        {days.map((d) => (
          <li key={d.id} className="rounded-2xl border border-[#E2E8F0] bg-white p-4" style={{ breakInside: 'avoid' }}>
            <p className="mb-2 text-sm font-semibold text-slate-800">
              {format(d.date, "EEEE, dd 'de' MMMM", { locale: ptBR }).replace(/^./, (c) => c.toUpperCase())}
            </p>
            <div className="flex flex-col gap-2">
              {d.entries.map((e, i) => {
                const badge = e.platform ? platformBadgeLabel([e.platform]) : null
                return (
                  <div key={i}>
                    {badge && d.entries.length > 1 && (
                      <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}
                    <ul className="flex flex-col gap-1">
                      {e.lines.map((l, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-slate-700">
                          <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                          <span>{l}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Check, Target, Pencil } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { useOptimizationSchedule, useTodayOptimizations } from '../../hooks/useOptimizations'
import { OptimizationFormModal } from '../clients/OptimizationFormModal'
import { hasContractedPaidTraffic, trafficServices, platformBadgeLabel } from '../../utils/clientServices'
import { type Optimization, type OptimizationPlatform } from '../../types'

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

interface Row {
  /** clientId, ou `${clientId}:${platform}` quando o cliente tem as duas —
   *  cada plataforma vira uma linha independente (ver PROBLEMA no pedido:
   *  marcar uma não pode travar o acesso pra registrar a outra). */
  key: string
  clientId: string
  name: string
  /** Plataforma desta linha — null quando o cliente só tem uma (linha única,
   *  comportamento de sempre). Sempre passamos TODAS as plataformas do
   *  cliente pro modal (ver `platforms`), então editar uma linha também dá
   *  pra preencher a outra que ainda faltava no mesmo registro do dia. */
  rowPlatform: OptimizationPlatform | null
  platforms: OptimizationPlatform[]
  done: boolean
  /** Registro de hoje (se algum já existe) — usado pra abrir em modo edição
   *  em vez de criar um segundo registro pro mesmo cliente no mesmo dia. */
  todayRecord: Optimization | null
}

export function OptimizationsTodayWidget() {
  const { profile } = useAuth()
  const { rows } = useOptimizationSchedule()
  const { data: todayOpts } = useTodayOptimizations()
  const { data: clients } = useClients()

  const [modalClient, setModalClient] = useState<{ id: string; platforms: OptimizationPlatform[]; record: Optimization | null } | null>(
    null
  )

  const today = new Date()
  const weekday = today.getDay()
  const weekdayLabel = capitalize(format(today, 'EEEE', { locale: ptBR }))

  const items = useMemo(() => {
    if (!profile) return []
    const todayByClient = new Map<string, Optimization[]>()
    for (const o of todayOpts) {
      if (!todayByClient.has(o.clientId)) todayByClient.set(o.clientId, [])
      todayByClient.get(o.clientId)!.push(o)
    }

    const out: Row[] = []
    for (const r of rows) {
      if (r.userId !== profile.id || !r.weekdays.includes(weekday)) continue
      const client = clients.find((c) => c.id === r.clientId)
      if (!client || client.status === 'churned' || !hasContractedPaidTraffic(client)) continue

      const platforms = trafficServices(client).platforms
      const todayRecords = todayByClient.get(client.id) ?? []
      const todayRecord = todayRecords[0] ?? null

      if (platforms.length > 1) {
        for (const p of platforms) {
          const done = todayRecords.some((o) => (p === 'meta' ? !!o.metaOptimizationsText : !!o.googleOptimizationsText))
          out.push({ key: `${client.id}:${p}`, clientId: client.id, name: client.companyName, rowPlatform: p, platforms, done, todayRecord })
        }
      } else {
        out.push({
          key: client.id,
          clientId: client.id,
          name: client.companyName,
          rowPlatform: null,
          platforms,
          done: todayRecords.length > 0,
          todayRecord,
        })
      }
    }
    return out.sort((a, b) => Number(a.done) - Number(b.done) || a.name.localeCompare(b.name))
  }, [rows, profile, weekday, clients, todayOpts])

  if (!profile) return null

  const allDone = items.length > 0 && items.every((i) => i.done)

  const openRow = (row: Row) => setModalClient({ id: row.clientId, platforms: row.platforms, record: row.todayRecord })

  return (
    <div className="h-full rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]" style={{ borderLeft: '4px solid #7C3AED' }} data-dash-accent>
      <div className="flex items-center gap-2">
        <Target size={16} className="text-violet-500" />
        <p className="text-[16px] font-semibold text-slate-900">Otimizações de hoje — {weekdayLabel}</p>
        {items.length > 0 && (
          <span className="ml-auto text-[13px] text-[#64748B]">
            {items.filter((i) => i.done).length}/{items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Sem otimizações agendadas para hoje.</p>
      ) : allDone ? (
        <p className="mt-3 text-[14px] font-medium text-[#10B981]">✅ Todas as otimizações do dia concluídas!</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {items.map((item) => {
            const b = platformBadgeLabel(item.rowPlatform ? [item.rowPlatform] : item.platforms)
            // updatedAt pode vir null por um instante logo após criar o
            // registro (serverTimestamp() ainda não resolvido) — sem essa
            // checagem, .toDate() explode assim que a linha vira "done".
            const registeredAt =
              item.done && item.todayRecord?.updatedAt ? format(item.todayRecord.updatedAt.toDate(), 'HH:mm') : null
            return (
              <div key={item.key} className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => (item.done ? undefined : openRow(item))}
                  disabled={item.done}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <span
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-colors ${
                      item.done ? 'border-brand-600 bg-brand-600' : 'border-slate-300 bg-white'
                    }`}
                  >
                    {item.done && <Check size={12} className="text-white" strokeWidth={3} />}
                  </span>
                  <span className={`flex min-w-0 items-center gap-1.5 text-[14px] ${item.done ? 'text-[#94A3B8]' : 'text-[#0F172A]'}`}>
                    <span className="min-w-0 truncate">{item.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.className}`}>{b.label}</span>
                  </span>
                </button>
                {item.done ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-[#10B981]">
                    ✅ Registrado{registeredAt ? ` ${registeredAt}` : ''}
                    <button
                      type="button"
                      onClick={() => openRow(item)}
                      className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      title="Editar registro"
                    >
                      <Pencil size={11} /> Editar
                    </button>
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      <OptimizationFormModal
        key={modalClient ? `${modalClient.id}-${modalClient.record?.id ?? 'new'}` : 'none'}
        open={!!modalClient}
        onClose={() => setModalClient(null)}
        clientId={modalClient?.id ?? ''}
        optimization={modalClient?.record ?? undefined}
        availablePlatforms={modalClient?.platforms}
      />
    </div>
  )
}

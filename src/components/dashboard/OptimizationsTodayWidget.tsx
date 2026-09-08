import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Check, Target } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { useOptimizationSchedule, useTodayOptimizations } from '../../hooks/useOptimizations'
import { OptimizationFormModal } from '../clients/OptimizationFormModal'
import { type OptimizationPlatform } from '../../types'
import { trafficServices, platformBadgeLabel } from '../../utils/clientServices'

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function OptimizationsTodayWidget() {
  const { profile } = useAuth()
  const { rows } = useOptimizationSchedule()
  const { data: todayOpts } = useTodayOptimizations()
  const { data: clients } = useClients()

  const [modalClient, setModalClient] = useState<{ id: string; platforms: OptimizationPlatform[] } | null>(null)

  const today = new Date()
  const weekday = today.getDay()
  const weekdayLabel = capitalize(format(today, 'EEEE', { locale: ptBR }))

  const items = useMemo(() => {
    if (!profile) return []
    const doneIds = new Set(todayOpts.map((o) => o.clientId))
    return rows
      .filter((r) => r.userId === profile.id && r.weekdays.includes(weekday))
      .map((r) => {
        const client = clients.find((c) => c.id === r.clientId)
        return client
          ? { id: client.id, name: client.companyName, platforms: trafficServices(client).platforms, done: doneIds.has(client.id) }
          : null
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => Number(a.done) - Number(b.done) || a.name.localeCompare(b.name))
  }, [rows, profile, weekday, clients, todayOpts])

  if (!profile) return null

  const allDone = items.length > 0 && items.every((i) => i.done)

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]" style={{ borderLeft: '4px solid #7C3AED' }}>
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
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => (item.done ? undefined : setModalClient({ id: item.id, platforms: item.platforms }))}
              className="flex items-center gap-2.5 text-left"
              disabled={item.done}
            >
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-colors ${
                  item.done ? 'border-brand-600 bg-brand-600' : 'border-slate-300 bg-white'
                }`}
              >
                {item.done && <Check size={12} className="text-white" strokeWidth={3} />}
              </span>
              <span className={`flex items-center gap-1.5 text-[14px] ${item.done ? 'text-[#94A3B8] line-through' : 'text-[#0F172A]'}`}>
                {item.name}
                {(() => {
                  const b = platformBadgeLabel(item.platforms)
                  return (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.className}`}>{b.label}</span>
                  )
                })()}
              </span>
            </button>
          ))}
        </div>
      )}

      <OptimizationFormModal
        key={modalClient?.id ?? 'none'}
        open={!!modalClient}
        onClose={() => setModalClient(null)}
        clientId={modalClient?.id ?? ''}
        availablePlatforms={modalClient?.platforms}
      />
    </div>
  )
}

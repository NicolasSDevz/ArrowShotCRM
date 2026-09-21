import { useEffect, useMemo, useState } from 'react'
import { Check, FileBarChart } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { resolveRoutinePersonKey } from '../../services/dailyRoutineTemplates'
import { ensureWeeklyReportCheck, setWeeklyReportCheckItem, subscribeWeeklyReportCheck } from '../../services/weeklyReportCheckService'
import { trafficServices, platformBadgeLabel } from '../../utils/clientServices'
import { getClientOwnerIds } from '../../types/client'
import { isoWeekKey } from '../../utils/isoWeek'
import type { WeeklyReportCheck } from '../../types/weeklyReportCheck'

/** Widget "Envio de Relatórios Semanais" — só pra Ciane/Nicolas, só às
 *  segundas, só enquanto houver cliente de tráfego pago sem marcar. Estado
 *  salvo em /weeklyReportChecks/{userId}_{weekKey} (ver
 *  services/weeklyReportCheckService.ts e utils/isoWeek.ts) — novo doc a
 *  cada semana ISO, então "reseta sozinho" sem precisar de job nenhum. */
export function WeeklyReportWidget() {
  const { profile } = useAuth()
  const { data: clients } = useClients()

  const [doc, setDoc] = useState<WeeklyReportCheck | null>(null)
  const [localChecks, setLocalChecks] = useState<Record<string, boolean>>({})
  const [justCompleted, setJustCompleted] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const personKey = profile ? resolveRoutinePersonKey(profile.name) : undefined
  const canSee = personKey === 'ciane' || personKey === 'nicolas'
  const isMonday = new Date().getDay() === 1
  const weekKey = isoWeekKey()

  const eligibleClients = useMemo(() => {
    if (!profile) return []
    return clients
      .filter((c) => c.status === 'active' && getClientOwnerIds(c).includes(profile.id) && trafficServices(c).any)
      .sort((a, b) => a.companyName.localeCompare(b.companyName))
  }, [clients, profile])
  const eligibleIds = useMemo(() => eligibleClients.map((c) => c.id), [eligibleClients])
  const eligibleIdsKey = eligibleIds.join(',')

  const active = canSee && isMonday && eligibleIds.length > 0

  useEffect(() => {
    setJustCompleted(false)
    setDismissed(false)
  }, [weekKey])

  useEffect(() => {
    if (!profile || !active) {
      setDoc(null)
      return
    }
    ensureWeeklyReportCheck(profile.id, weekKey, eligibleIds).catch(console.error)
    const unsub = subscribeWeeklyReportCheck(profile.id, weekKey, (data) => {
      setDoc(data)
      setLocalChecks(data?.checks ?? {})
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, active, weekKey, eligibleIdsKey])

  const toggle = (clientId: string) => {
    if (!profile) return
    const done = !localChecks[clientId]
    const nextChecks = { ...localChecks, [clientId]: done }
    setLocalChecks(nextChecks)
    const allDone = eligibleIds.length > 0 && eligibleIds.every((id) => nextChecks[id])

    setWeeklyReportCheckItem(profile.id, weekKey, clientId, done, allDone).catch((err) => {
      console.error(err)
      setLocalChecks((prev) => ({ ...prev, [clientId]: !done }))
    })

    if (allDone) {
      setJustCompleted(true)
      setTimeout(() => setDismissed(true), 3000)
    }
  }

  if (!active) return null
  if (dismissed) return null
  // Já concluído desde antes desta sessão (doc carregado com completedAt) —
  // some direto, sem repetir a mensagem de comemoração.
  if (!justCompleted && doc?.completedAt != null) return null

  const done = eligibleIds.filter((id) => localChecks[id]).length
  const total = eligibleIds.length
  const allDone = total > 0 && done === total
  const pct = total > 0 ? (done / total) * 100 : 0

  if (justCompleted) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]" style={{ borderLeft: '4px solid #2563EB' }} data-dash-accent>
        <p className="text-center text-[15px] font-semibold text-[#10B981]">✅ Todos os relatórios enviados! Ótimo trabalho! 🎉</p>
      </div>
    )
  }

  const displayClients = [...eligibleClients].sort((a, b) => {
    const da = localChecks[a.id] ? 1 : 0
    const db2 = localChecks[b.id] ? 1 : 0
    if (da !== db2) return da - db2
    return a.companyName.localeCompare(b.companyName)
  })

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]" style={{ borderLeft: '4px solid #2563EB' }} data-dash-accent>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <FileBarChart size={16} className="text-brand-600" />
          <div>
            <p className="text-[16px] font-semibold text-slate-900">📊 Envio de Relatórios Semanais</p>
            <p className="text-[13px] text-[#64748B]">Marque conforme for enviando os relatórios de cada cliente</p>
          </div>
        </div>
        <p className="shrink-0 text-[13px] text-[#64748B]">{done}/{total} relatórios enviados</p>
      </div>

      <div className="mt-2.5 h-[6px] w-full overflow-hidden rounded-full" style={{ backgroundColor: '#E2E8F0' }}>
        <div
          className="h-full rounded-full transition-all duration-300 ease-in-out"
          style={{ width: `${pct}%`, backgroundColor: allDone ? '#10B981' : '#2563EB' }}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {displayClients.map((client) => {
          const checked = !!localChecks[client.id]
          const badge = platformBadgeLabel(trafficServices(client).platforms)
          return (
            <button
              key={client.id}
              type="button"
              onClick={() => toggle(client.id)}
              className="flex items-center gap-2.5 text-left"
            >
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-colors duration-150 ease-in-out ${
                  checked ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white'
                }`}
              >
                {checked && <Check size={12} className="text-white" strokeWidth={3} />}
              </span>
              <span
                className={`flex min-w-0 flex-1 items-center gap-1.5 text-[14px] transition-opacity duration-150 ease-in-out ${
                  checked ? 'text-[#94A3B8] line-through opacity-50' : 'text-[#0F172A]'
                }`}
              >
                <span className="min-w-0 truncate">{client.companyName}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}>{badge.label}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

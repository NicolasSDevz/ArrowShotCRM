import { useMemo } from 'react'
import { Target } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { useTeamMembers } from '../../hooks/useTeamMembers'
import { useClients } from '../../hooks/useClients'
import { useOptimizationSchedule, useTodayOptimizations } from '../../hooks/useOptimizations'
import { findUserIdByName } from '../../utils/userLookup'
import { trafficServices, platformBadgeLabel, hasContractedPaidTraffic } from '../../utils/clientServices'
import { Avatar } from '../ui/Avatar'

const OWNER_EMAIL = 'gestorarrowshotmkt@gmail.com'
const GESTORES = ['Ciane', 'Nicolas']

function progressBarColor(pct: number): string {
  if (pct >= 100) return '#10B981'
  if (pct >= 50) return '#F59E0B'
  return '#EF4444'
}

function GestorOptimizationsCard({ name }: { name: string }) {
  const { data: users } = useUsers()
  const { data: teamMembers } = useTeamMembers()
  const { data: clients } = useClients()
  const { rows } = useOptimizationSchedule()
  const { data: todayOpts } = useTodayOptimizations()

  const userId = findUserIdByName(users, name)
  const user = users.find((u) => u.id === userId)
  const teamMember = teamMembers.find((m) => (userId && m.userId === userId) || m.name.toLowerCase().includes(name.toLowerCase()))
  const weekday = new Date().getDay()
  const doneIds = useMemo(() => new Set(todayOpts.map((o) => o.clientId)), [todayOpts])

  const items = useMemo(() => {
    if (!userId) return []
    return rows
      .filter((r) => r.userId === userId && r.weekdays.includes(weekday))
      .map((r) => {
        const client = clients.find((c) => c.id === r.clientId)
        return client && client.status !== 'churned' && hasContractedPaidTraffic(client)
          ? { id: client.id, name: client.companyName, platforms: trafficServices(client).platforms, done: doneIds.has(client.id) }
          : null
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => Number(a.done) - Number(b.done) || a.name.localeCompare(b.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, userId, weekday, clients, doneIds])

  const total = items.length
  const done = items.filter((i) => i.done).length
  const pct = total > 0 ? (done / total) * 100 : 0

  return (
    <div className="rounded-xl border border-slate-100 p-3.5">
      <div className="flex items-center gap-2.5">
        <Avatar name={teamMember?.name ?? name} photoURL={teamMember?.photoURL ?? user?.photoURL} size="sm" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{teamMember?.name ?? name}</p>
        <p className="shrink-0 text-xs font-medium text-slate-500">
          {total > 0 ? `${done}/${total} otimizações registradas` : 'sem otimizações hoje'}
        </p>
      </div>

      {total > 0 && (
        <div className="mt-2.5 h-[6px] w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all duration-300 ease-in-out"
            style={{ width: `${pct}%`, backgroundColor: progressBarColor(pct) }}
          />
        </div>
      )}

      {total === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Sem otimizações agendadas para hoje.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {items.map((item) => {
            const b = platformBadgeLabel(item.platforms)
            return (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                <span className="shrink-0" aria-hidden="true">
                  {item.done ? '✅' : '⬜'}
                </span>
                <span className={`min-w-0 flex-1 truncate ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                  {item.name}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.className}`}>{b.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Widget "Otimizações de hoje — equipe", visível SÓ para Bruno (Admin) —
 *  mostra, em modo somente-leitura (checkboxes não clicáveis), quais
 *  clientes de Ciane e Nicolas devem ser otimizados hoje e quais já foram
 *  registrados. Mesma fonte de dados do widget "Otimizações de hoje" de
 *  cada gestor (settings/optimizationSchedule + optimizations do dia) —
 *  ambas já legíveis por qualquer usuário interno, sem regra nova. */
export function OptimizationsTeamTodayWidget() {
  const { profile } = useAuth()
  const canSee = profile?.role === 'admin' || profile?.email === OWNER_EMAIL
  if (!canSee) return null

  return (
    <div className="h-full rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]" style={{ borderLeft: '4px solid #7C3AED' }} data-dash-accent>
      <div className="flex items-center gap-2">
        <Target size={16} className="text-violet-500" />
        <p className="text-[16px] font-semibold text-slate-900">Otimizações de hoje — equipe</p>
      </div>
      <p className="text-[13px] text-[#64748B]">Acompanhamento (somente leitura) das otimizações do dia por gestor.</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GESTORES.map((name) => (
          <GestorOptimizationsCard key={name} name={name} />
        ))}
      </div>
    </div>
  )
}

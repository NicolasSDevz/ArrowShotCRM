import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { useTeamMembers } from '../../hooks/useTeamMembers'
import { subscribeDailyRoutineProgress } from '../../services/dailyRoutineService'
import { buildDailyRoutine, type RoutinePersonKey } from '../../services/dailyRoutineTemplates'
import { findUserIdByName } from '../../utils/userLookup'
import { Avatar } from '../ui/Avatar'
import { USER_ROLE_LABEL } from '../../types/user'

const OWNER_EMAIL = 'gestorarrowshotmkt@gmail.com'

const TEAM_ROUTINE_PEOPLE: { name: string; personKey: RoutinePersonKey }[] = [
  { name: 'Janilson', personKey: 'jamilson' },
  { name: 'Ciane', personKey: 'ciane' },
  { name: 'Nicolas', personKey: 'nicolas' },
]

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function progressColor(pct: number) {
  if (pct > 70) return '#10B981'
  if (pct >= 30) return '#F59E0B'
  return '#EF4444'
}

function PersonRoutineCard({ name, personKey }: { name: string; personKey: RoutinePersonKey }) {
  const { data: users } = useUsers()
  const { data: teamMembers } = useTeamMembers()
  const [completedIds, setCompletedIds] = useState<string[]>([])

  const userId = findUserIdByName(users, name)
  const user = users.find((u) => u.id === userId)
  const teamMember = teamMembers.find((m) => (userId && m.userId === userId) || m.name.toLowerCase().includes(name.toLowerCase()))
  const jobTitle = teamMember?.jobTitle ?? (user ? USER_ROLE_LABEL[user.role] : undefined)

  const items = buildDailyRoutine(personKey, new Date())
  const dateKey = todayKey()

  useEffect(() => {
    if (!userId) {
      setCompletedIds([])
      return
    }
    return subscribeDailyRoutineProgress(userId, dateKey, setCompletedIds)
  }, [userId, dateKey])

  const total = items.length
  const done = items.filter((i) => completedIds.includes(i.id)).length
  const pct = total > 0 ? (done / total) * 100 : 0

  return (
    <div className="rounded-xl border border-slate-100 p-3.5">
      <div className="flex items-center gap-2.5">
        <Avatar name={teamMember?.name ?? name} photoURL={teamMember?.photoURL ?? user?.photoURL} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{teamMember?.name ?? name}</p>
          {jobTitle && <p className="truncate text-xs text-slate-400">{jobTitle}</p>}
        </div>
        <p className="shrink-0 text-xs font-medium text-slate-500">
          {total > 0 ? `${done}/${total} concluídos hoje` : 'sem itens hoje'}
        </p>
      </div>

      {total > 0 && (
        <>
          <div className="mt-2.5 h-[6px] w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full transition-all duration-300 ease-in-out" style={{ width: `${pct}%`, backgroundColor: progressColor(pct) }} />
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            {items.map((item) => {
              const checked = completedIds.includes(item.id)
              return (
                <div key={item.id} className="flex items-center gap-2 text-left">
                  <span
                    className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] border ${
                      checked ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white'
                    }`}
                  >
                    {checked && <Check size={10} className="text-white" strokeWidth={3} />}
                  </span>
                  <span className={`text-[13px] ${checked ? 'text-slate-400 line-through' : 'text-slate-600'}`}>{item.text}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/** Widget "Rotina da equipe — hoje", visível SÓ para Bruno (Admin ou o
 *  e-mail dono da conta) — mostra, em modo somente-leitura, a rotina diária
 *  de Janilson, Ciane e Nicolas (ver DailyRoutineWidget para a versão
 *  editável de "eu mesmo").
 *
 *  Nota: a tarefa original pediu para buscar de `/dailyRoutines/{userId}`,
 *  mas o app já modela isso como `dailyRoutineProgress/{userId}_{yyyy-MM-dd}`
 *  (ver services/dailyRoutineService.ts) — reaproveitado aqui em vez de
 *  criar uma segunda fonte da verdade. */
export function TeamRoutineTodayWidget() {
  const { profile } = useAuth()
  const canSee = profile?.role === 'admin' || profile?.email === OWNER_EMAIL
  if (!canSee) return null

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]" style={{ borderLeft: '4px solid #A855F7' }} data-dash-accent>
      <p className="text-[16px] font-semibold text-slate-900">Rotina da equipe — hoje</p>
      <p className="text-[13px] text-[#64748B]">Acompanhamento (somente leitura) da rotina diária do time.</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TEAM_ROUTINE_PEOPLE.map((p) => (
          <PersonRoutineCard key={p.personKey} name={p.name} personKey={p.personKey} />
        ))}
      </div>
    </div>
  )
}

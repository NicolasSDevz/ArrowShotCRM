import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { useTeamMembers } from '../../hooks/useTeamMembers'
import { useRoutineItemsFor } from '../../hooks/useRoutineItemsFor'
import { subscribeDailyRoutineProgress } from '../../services/dailyRoutineService'
import { filterRoutineItemsForDate } from '../../services/dailyRoutineTemplates'
import { findUserIdByName } from '../../utils/userLookup'
import { Avatar } from '../ui/Avatar'
import { USER_ROLE_LABEL } from '../../types/user'

const OWNER_EMAIL = 'gestorarrowshotmkt@gmail.com'

const TEAM_ROUTINE_PEOPLE = ['Jamilson', 'Ciane', 'Nicolas']

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function progressColor(pct: number) {
  if (pct > 70) return '#10B981'
  if (pct >= 30) return '#F59E0B'
  return '#EF4444'
}

function PersonRoutineCard({ name }: { name: string }) {
  const { data: users } = useUsers()
  const { data: teamMembers } = useTeamMembers()
  const [completedIds, setCompletedIds] = useState<string[]>([])
  // IMPEDIMENTO TÉCNICO (TAREFA 4): firestore.rules restringe
  // dailyRoutineProgress a leitura/escrita só pelo próprio dono, "nem pelo
  // Admin" (decisão de privacidade já documentada na regra). Então Bruno não
  // consegue ler se Jamilson/Ciane/Nicolas marcaram os itens hoje — só a
  // LISTA dos itens (dailyRoutines/{userId}, essa sim legível por qualquer
  // signed-in user) fica visível. Detectamos o permission-denied aqui e
  // mostramos isso explicitamente em vez de fingir "0% concluído".
  const [progressDenied, setProgressDenied] = useState(false)

  const userId = findUserIdByName(users, name)
  const user = users.find((u) => u.id === userId)
  const teamMember = teamMembers.find((m) => (userId && m.userId === userId) || m.name.toLowerCase().includes(name.toLowerCase()))
  const jobTitle = teamMember?.jobTitle ?? (user ? USER_ROLE_LABEL[user.role] : undefined)

  const allItems = useRoutineItemsFor(userId, teamMember?.name ?? user?.name ?? name)
  const dateKey = todayKey()
  const items = filterRoutineItemsForDate(allItems, new Date(`${dateKey}T00:00:00`))

  useEffect(() => {
    if (!userId) {
      setCompletedIds([])
      setProgressDenied(false)
      return
    }
    setProgressDenied(false)
    return subscribeDailyRoutineProgress(userId, dateKey, setCompletedIds, (err) => {
      if (err.code === 'permission-denied') setProgressDenied(true)
    })
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
          {progressDenied ? 'progresso restrito' : total > 0 ? `${done}/${total} concluídos hoje` : 'sem itens hoje'}
        </p>
      </div>

      {progressDenied ? (
        <p className="mt-3 text-xs text-slate-400">
          🔒 O progresso de hoje é privado (regra do Firestore não permite leitura por outra conta, nem Admin) — mostrando só os
          itens da rotina.
        </p>
      ) : (
        total > 0 && (
          <div className="mt-2.5 h-[6px] w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full transition-all duration-300 ease-in-out" style={{ width: `${pct}%`, backgroundColor: progressColor(pct) }} />
          </div>
        )
      )}

      {total > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {items.map((item) => {
            const checked = !progressDenied && completedIds.includes(item.id)
            return (
              <div key={item.id} className="flex items-center gap-2 text-left">
                <span
                  className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] border ${
                    progressDenied
                      ? 'border-slate-200 bg-slate-100'
                      : checked
                        ? 'border-emerald-500 bg-emerald-500'
                        : 'border-slate-300 bg-white'
                  }`}
                >
                  {checked && <Check size={10} className="text-white" strokeWidth={3} />}
                </span>
                <span className={`text-[13px] ${checked ? 'text-slate-400 line-through' : 'text-slate-600'}`}>{item.text}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Widget "Rotina da equipe — hoje", visível SÓ para Bruno (Admin ou o
 *  e-mail dono da conta) — mostra, em modo somente-leitura, a rotina diária
 *  de Jamilson, Ciane e Nicolas (mesma fonte de dados do widget "Rotina do
 *  dia" de cada um — /dailyRoutines/{userId} + dailyRoutineProgress/
 *  {userId}_{yyyy-MM-dd}, ver hooks/useRoutineItemsFor e
 *  services/dailyRoutineService.ts). */
export function TeamRoutineTodayWidget() {
  const { profile } = useAuth()
  const canSee = profile?.role === 'admin' || profile?.email === OWNER_EMAIL
  if (!canSee) return null

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]" style={{ borderLeft: '4px solid #A855F7' }} data-dash-accent>
      <p className="text-[16px] font-semibold text-slate-900">Rotina da equipe — hoje</p>
      <p className="text-[13px] text-[#64748B]">Acompanhamento (somente leitura) da rotina diária do time.</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TEAM_ROUTINE_PEOPLE.map((name) => (
          <PersonRoutineCard key={name} name={name} />
        ))}
      </div>
    </div>
  )
}

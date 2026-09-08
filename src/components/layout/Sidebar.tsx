import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  Sparkles,
  CalendarDays,
  Video,
  Megaphone,
  Target,
  UserPlus,
  BarChart3,
  Wallet,
  Lock,
  UserCog,
  GraduationCap,
  KeyRound,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTeamMembers } from '../../hooks/useTeamMembers'
import { Avatar } from '../ui/Avatar'
import { USER_ROLE_LABEL } from '../../types/user'

const mainNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/tarefas', label: 'Tarefas', icon: CheckSquare },
  { to: '/social-media', label: 'Social Mídia', icon: Sparkles },
  { to: '/calendario', label: 'Calendário', icon: CalendarDays },
  { to: '/reunioes', label: 'Reuniões', icon: Video },
]

// "Leads" e "Relatórios" têm `to` e por isso renderizam como link ativo,
// mesmo continuando listados dentro da seção "Em breve" junto dos módulos
// ainda travados.
const futureNav: { label: string; icon: typeof Target; to?: string }[] = [
  { label: 'Google Ads', icon: Target },
  { label: 'Meta Ads', icon: Megaphone },
  { label: 'Leads', icon: UserPlus, to: '/leads' },
  { label: 'Relatórios', icon: BarChart3, to: '/relatorios' },
  { label: 'Financeiro', icon: Wallet },
]

export function Sidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const { profile } = useAuth()
  const { data: teamMembers } = useTeamMembers()
  const canSeeUniversity = profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'employee'
  const canManageTokens = profile?.role === 'admin' || profile?.role === 'manager'
  const myProfileCargo = teamMembers.find((m) => m.userId === profile?.id)?.jobTitle

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onCloseMobile} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[220px] shrink-0 flex-col bg-navy-950 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 border-b border-navy-800 px-4 py-5">
          <img src="/favicon.png" alt="" className="h-8 w-8 rounded-md" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold leading-tight text-white">Arrow Shot</p>
            <p className="text-[11px] leading-tight text-slate-500">Marketing CRM</p>
          </div>
          <button onClick={onCloseMobile} className="rounded-md p-1 text-slate-400 hover:text-white md:hidden">
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          {mainNav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-[15px] font-medium transition-all duration-150 ease-in-out ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-navy-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}

          {canSeeUniversity && (
            <NavLink
              to="/universidade"
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-[15px] font-medium transition-all duration-150 ease-in-out ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-navy-800 hover:text-white'
                }`
              }
            >
              <GraduationCap size={18} />
              Universidade
            </NavLink>
          )}

          {profile?.role === 'admin' && (
            <NavLink
              to="/equipe"
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-[15px] font-medium transition-all duration-150 ease-in-out ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-navy-800 hover:text-white'
                }`
              }
            >
              <UserCog size={18} />
              Equipe
            </NavLink>
          )}

          {canManageTokens && (
            <NavLink
              to="/configuracoes/tokens"
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-[15px] font-medium transition-all duration-150 ease-in-out ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-navy-800 hover:text-white'
                }`
              }
            >
              <KeyRound size={18} />
              Tokens Meta Ads
            </NavLink>
          )}

          <div className="mt-2 border-t border-navy-800 px-4 pb-1.5 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">Em breve</p>
          </div>
          <div className="flex flex-col gap-0.5">
            {futureNav.map(({ label, icon: Icon, to }) =>
              to ? (
                <NavLink
                  key={label}
                  to={to}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-[15px] font-medium transition-all duration-150 ease-in-out ${
                      isActive ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-navy-800 hover:text-white'
                    }`
                  }
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              ) : (
                <div
                  key={label}
                  title="Módulo em preparação"
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-4 py-2.5 text-[15px] text-slate-400 opacity-50"
                >
                  <Icon size={18} />
                  {label}
                  <Lock size={11} className="ml-auto opacity-70" />
                </div>
              )
            )}
          </div>
        </nav>

        {profile && (
          <div className="flex items-center gap-2.5 border-t border-navy-800 p-4">
            <Avatar name={profile.name} photoURL={profile.photoURL} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-white">{profile.name}</p>
              <p className="truncate text-[11px] text-slate-500">{myProfileCargo ?? USER_ROLE_LABEL[profile.role]}</p>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ListChecks,
  Users,
  Sparkles,
  CalendarDays,
  Gauge,
  UserPlus,
  BarChart3,
  UserCog,
  GraduationCap,
  KeyRound,
  CalendarRange,
  ChevronDown,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTeamMembers } from '../../hooks/useTeamMembers'
import { Avatar } from '../ui/Avatar'
import { USER_ROLE_LABEL } from '../../types/user'
import { resolveRoutinePersonKey } from '../../services/dailyRoutineTemplates'

const COLLAPSED_KEY = 'arrowshot-sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

const mainNav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/operacional', label: 'Operacional', icon: ListChecks },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/metricas', label: 'Métricas', icon: Gauge },
  { to: '/leads', label: 'Leads', icon: UserPlus },
  { to: '/social-media', label: 'Social Mídia', icon: Sparkles },
  { to: '/calendario', label: 'Calendário', icon: CalendarDays },
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Recolhido (só no computador): vira uma faixa fina só com ícones — bom pra
  // apresentar pro cliente sem o menu ocupando a tela. Fica salvo no navegador.
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggleCollapsed = () =>
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        /* ignora */
      }
      return next
    })
  // No celular o menu é a gaveta de sempre (com os nomes); recolher vale só a partir de md.
  const c = collapsed
  const labelCls = c ? 'md:hidden' : ''
  const linkLayout = c ? 'md:justify-center md:px-0' : ''
  const canSeeUniversity = profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'employee'
  const canManageTokens = profile?.role === 'admin' || profile?.role === 'manager'
  const personKey = profile ? resolveRoutinePersonKey(profile.name) : undefined
  const isGestorTrafego = personKey === 'ciane' || personKey === 'nicolas'
  const showSettingsSection = canManageTokens || isGestorTrafego
  const myProfileCargo = teamMembers.find((m) => m.userId === profile?.id)?.jobTitle

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onCloseMobile} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[220px] shrink-0 flex-col bg-navy-950 transition-[transform,width] duration-200 md:static md:z-auto md:translate-x-0 ${
          c ? 'md:w-[68px]' : ''
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className={`relative flex items-center justify-center border-b border-navy-800 px-3 py-3 ${c ? 'md:min-h-[81px]' : ''}`}>
          <img src="/logo-white.png" alt="Quiver" className={`h-14 w-auto ${c ? 'md:hidden' : ''}`} />
          <button
            type="button"
            onClick={toggleCollapsed}
            title={c ? 'Abrir o menu' : 'Recolher o menu'}
            aria-label={c ? 'Abrir o menu' : 'Recolher o menu'}
            className={`hidden rounded-md p-1.5 text-slate-500 transition-colors hover:bg-navy-800 hover:text-white md:block ${c ? '' : 'absolute right-1.5 top-1.5'}`}
          >
            {c ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={16} />}
          </button>
          <button
            onClick={onCloseMobile}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-white md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className={`sidebar flex-1 space-y-0.5 overflow-y-auto py-2 ${c ? 'px-2 md:px-2.5' : 'px-2'}`}>
          {mainNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={c ? label : undefined}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-[15px] font-medium transition-all duration-150 ease-in-out ${linkLayout} ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-navy-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className={labelCls}>{label}</span>
            </NavLink>
          ))}

          {canSeeUniversity && (
            <NavLink
              to="/universidade"
              title={c ? 'Universidade' : undefined}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-[15px] font-medium transition-all duration-150 ease-in-out ${linkLayout} ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-navy-800 hover:text-white'
                }`
              }
            >
              <GraduationCap size={18} className="shrink-0" />
              <span className={labelCls}>Universidade</span>
            </NavLink>
          )}

          {profile?.role === 'admin' && (
            <NavLink
              to="/equipe"
              title={c ? 'Equipe' : undefined}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-[15px] font-medium transition-all duration-150 ease-in-out ${linkLayout} ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-navy-800 hover:text-white'
                }`
              }
            >
              <UserCog size={18} className="shrink-0" />
              <span className={labelCls}>Equipe</span>
            </NavLink>
          )}

          {showSettingsSection && (
            <div className={`mt-2 border-t border-navy-800 pt-1.5 ${c ? 'md:hidden' : ''}`}>
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                className="flex w-full items-center gap-2.5 rounded-lg px-4 py-2 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-300"
              >
                <span aria-hidden="true">⚙️</span>
                Configurações
                <ChevronDown size={13} className={`ml-auto transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
              </button>

              {settingsOpen && (
                <div className="flex flex-col gap-0.5 pb-1">
                  {canManageTokens && (
                    <NavLink
                      to="/configuracoes/tokens"
                      onClick={onCloseMobile}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] transition-colors ${
                          isActive ? 'text-slate-200' : 'hover:text-slate-300'
                        }`
                      }
                      style={{ color: '#64748B' }}
                    >
                      <KeyRound size={14} />
                      Tokens Meta Ads
                    </NavLink>
                  )}

                  {isGestorTrafego && (
                    <NavLink
                      to="/otimizacoes/calendario"
                      onClick={onCloseMobile}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] transition-colors ${
                          isActive ? 'text-slate-200' : 'hover:text-slate-300'
                        }`
                      }
                      style={{ color: '#64748B' }}
                    >
                      <CalendarRange size={14} />
                      Calendário de Otimizações
                    </NavLink>
                  )}
                </div>
              )}
            </div>
          )}
        </nav>

        {profile && (
          <div className={`flex items-center gap-2.5 border-t border-navy-800 p-4 ${c ? 'md:justify-center md:px-0' : ''}`} title={c ? profile.name : undefined}>
            <Avatar name={profile.name} photoURL={profile.photoURL} size="sm" />
            <div className={`min-w-0 ${labelCls}`}>
              <p className="truncate text-[13px] font-medium text-white">{profile.name}</p>
              <p className="truncate text-[11px] text-slate-500">{myProfileCargo ?? USER_ROLE_LABEL[profile.role]}</p>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

import { NavLink, useLocation } from 'react-router-dom'
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
  ShoppingBag,
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

export function Sidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const { data: teamMembers } = useTeamMembers()
  const [settingsOpen, setSettingsOpen] = useState(false)
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

  const c = collapsed
  const labelCls = c ? 'md:hidden' : ''
  const linkLayout = c ? 'md:justify-center md:px-0' : ''
  const canSeeTeam = profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'employee'
  const canManageTokens = profile?.role === 'admin' || profile?.role === 'manager'
  const personKey = profile ? resolveRoutinePersonKey(profile.name) : undefined
  const isGestorTrafego = personKey === 'ciane' || personKey === 'nicolas'
  const showSettingsSection = canManageTokens || isGestorTrafego
  const myProfileCargo = teamMembers.find((m) => m.userId === profile?.id)?.jobTitle

  const navCls = (isActive: boolean, alsoActive?: string[]) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium transition-all duration-150 ease-in-out ${linkLayout} ${
      isActive || alsoActive?.some((p) => pathname.startsWith(p))
        ? 'bg-brand-600 text-white'
        : 'text-slate-400 hover:bg-navy-800 hover:text-white'
    }`

  const sectionLabel = (label: string) =>
    c ? (
      <div className="mx-auto my-1 h-px w-6 bg-navy-800 md:block" />
    ) : (
      <p className="mt-3 mb-0.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-navy-600">{label}</p>
    )

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onCloseMobile} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[210px] shrink-0 flex-col bg-navy-950 transition-[transform,width] duration-200 md:static md:z-auto md:translate-x-0 ${
          c ? 'md:w-[64px]' : ''
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo + botão recolher */}
        <div className={`relative flex items-center justify-center border-b border-navy-800 px-3 py-3 ${c ? 'md:min-h-[81px]' : ''}`}>
          <img src="/logo-white.png" alt="Arrow Shot" className={`h-14 w-auto ${c ? 'md:hidden' : ''}`} />
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

        <nav className="sidebar flex-1 overflow-y-auto px-2 py-2">

          {/* ── Início ── */}
          <NavLink to="/dashboard" title={c ? 'Dashboard' : undefined} onClick={onCloseMobile}
            className={({ isActive }) => navCls(isActive)}>
            <LayoutDashboard size={17} className="shrink-0" />
            <span className={labelCls}>Dashboard</span>
          </NavLink>
          <NavLink to="/operacional" title={c ? 'Operacional' : undefined} onClick={onCloseMobile}
            className={({ isActive }) => navCls(isActive)}>
            <ListChecks size={17} className="shrink-0" />
            <span className={labelCls}>Operacional</span>
          </NavLink>
          <NavLink to="/clientes" title={c ? 'Clientes' : undefined} onClick={onCloseMobile}
            className={({ isActive }) => navCls(isActive)}>
            <Users size={17} className="shrink-0" />
            <span className={labelCls}>Clientes</span>
          </NavLink>

          {/* ── Vendas ── */}
          {sectionLabel('Vendas')}
          <NavLink to="/leads" title={c ? 'Leads' : undefined} onClick={onCloseMobile}
            className={({ isActive }) => navCls(isActive)}>
            <UserPlus size={17} className="shrink-0" />
            <span className={labelCls}>Leads</span>
          </NavLink>
          <NavLink to="/reunioes" title={c ? 'Reuniões' : undefined} onClick={onCloseMobile}
            className={({ isActive }) => navCls(isActive, ['/calendario'])}>
            <CalendarDays size={17} className="shrink-0" />
            <span className={labelCls}>Reuniões</span>
          </NavLink>

          {/* ── Marketing ── */}
          {sectionLabel('Marketing')}
          <NavLink to="/social-media" title={c ? 'Social Mídia' : undefined} onClick={onCloseMobile}
            className={({ isActive }) => navCls(isActive)}>
            <Sparkles size={17} className="shrink-0" />
            <span className={labelCls}>Social Mídia</span>
          </NavLink>
          <NavLink to="/relatorios" title={c ? 'Relatórios' : undefined} onClick={onCloseMobile}
            className={({ isActive }) => navCls(isActive)}>
            <BarChart3 size={17} className="shrink-0" />
            <span className={labelCls}>Relatórios</span>
          </NavLink>
          <NavLink to="/metricas" title={c ? 'Métricas' : undefined} onClick={onCloseMobile}
            className={({ isActive }) => navCls(isActive)}>
            <Gauge size={17} className="shrink-0" />
            <span className={labelCls}>Métricas</span>
          </NavLink>

          {/* ── Equipe ── */}
          {canSeeTeam && sectionLabel('Equipe')}
          {canSeeTeam && (
            <NavLink to="/universidade" title={c ? 'Universidade' : undefined} onClick={onCloseMobile}
              className={({ isActive }) => navCls(isActive)}>
              <GraduationCap size={17} className="shrink-0" />
              <span className={labelCls}>Universidade</span>
            </NavLink>
          )}
          {canSeeTeam && (
            <NavLink to="/equipe" title={c ? 'Equipe' : undefined} onClick={onCloseMobile}
              className={({ isActive }) => navCls(isActive)}>
              <UserCog size={17} className="shrink-0" />
              <span className={labelCls}>Equipe</span>
            </NavLink>
          )}
          {canManageTokens && (
            <NavLink to="/loja" title={c ? 'Loja' : undefined} onClick={onCloseMobile}
              className={({ isActive }) => navCls(isActive || pathname.startsWith('/loja'))}>
              <ShoppingBag size={17} className="shrink-0" />
              <span className={labelCls}>Loja</span>
            </NavLink>
          )}

          {/* ── Configurações (colapsável) ── */}
          {showSettingsSection && (
            <div className={`mt-2 border-t border-navy-800 pt-1.5 ${c ? 'md:hidden' : ''}`}>
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium text-navy-500 transition-colors hover:text-slate-300"
              >
                <span aria-hidden="true" className="text-[13px]">⚙️</span>
                <span>Configurações</span>
                <ChevronDown size={12} className={`ml-auto transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
              </button>

              {settingsOpen && (
                <div className="flex flex-col gap-0.5 pb-1">
                  {canManageTokens && (
                    <NavLink
                      to="/configuracoes/tokens"
                      onClick={onCloseMobile}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] transition-colors ${
                          isActive ? 'text-slate-200' : 'text-navy-500 hover:text-slate-300'
                        }`
                      }
                    >
                      <KeyRound size={13} />
                      Tokens Meta Ads
                    </NavLink>
                  )}
                  {isGestorTrafego && (
                    <NavLink
                      to="/otimizacoes/calendario"
                      onClick={onCloseMobile}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] transition-colors ${
                          isActive ? 'text-slate-200' : 'text-navy-500 hover:text-slate-300'
                        }`
                      }
                    >
                      <CalendarRange size={13} />
                      Calendário de Otimizações
                    </NavLink>
                  )}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Perfil */}
        {profile && (
          <div
            className={`flex items-center gap-2.5 border-t border-navy-800 p-3 ${c ? 'md:justify-center md:px-0' : ''}`}
            title={c ? profile.name : undefined}
          >
            <Avatar name={profile.name} photoURL={profile.photoURL} size="sm" />
            <div className={`min-w-0 ${labelCls}`}>
              <p className="truncate text-[12px] font-medium text-white">{profile.name}</p>
              <p className="truncate text-[10px] text-navy-500">{myProfileCargo ?? USER_ROLE_LABEL[profile.role]}</p>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

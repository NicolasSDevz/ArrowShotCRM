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
  BookOpenText,
  CalendarRange,
  ShoppingBag,
  Receipt,
  Package,
  Store,
  Palette,
  Settings,
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
import { temAcessoAoCopiloto } from '../../config/copilotoAccess'
import { STORE_BRAND } from '../../config/storeBrand'

const COLLAPSED_KEY = 'arrowshot-sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  /** Outras rotas que também deixam o item aceso. */
  alsoActive?: string[]
  /** Itens da Loja: qual aba (?aba=) deixa o item aceso. */
  aba?: string
  /** Se ficar de fora, todo mundo vê. */
  show?: (p: { canSeeUniversity: boolean; canManageTokens: boolean }) => boolean
}

// O que se usa o dia todo fica em cima, grande e com ícone.
const mainNav: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/operacional', label: 'Operacional', icon: ListChecks },
  { to: '/leads', label: 'Leads', icon: UserPlus },
  { to: '/clientes', label: 'Clientes', icon: Users },
  // Reuniões e Calendário são a mesma página (abas) — o item fica aceso nas duas rotas.
  { to: '/reunioes', label: 'Reuniões', icon: CalendarDays, alsoActive: ['/calendario'] },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
]

// Loja (produtos digitais): grupo próprio, separado da operação da agência.
const storeNav: NavItem[] = [
  { to: '/loja', label: 'Painel', icon: Store, aba: 'geral' },
  { to: '/loja?aba=vendas', label: 'Vendas', icon: Receipt, aba: 'vendas' },
  { to: '/loja?aba=produtos', label: 'Produtos', icon: Package, aba: 'produtos' },
  { to: '/loja?aba=membros', label: 'Área de membros', icon: Palette, aba: 'membros' },
]

// O resto fica num grupo menor, mais apagado, logo abaixo.
const toolsNav: NavItem[] = [
  { to: '/metricas', label: 'Métricas', icon: Gauge },
  { to: '/social-media', label: 'Social Mídia', icon: Sparkles },
  { to: '/universidade', label: 'Universidade', icon: GraduationCap, show: (p) => p.canSeeUniversity },
  { to: '/equipe', label: 'Equipe', icon: UserCog, show: (p) => p.canSeeUniversity },
]

export function Sidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const { profile } = useAuth()
  const { pathname, search } = useLocation()
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
  const canSeeBaseVendas = temAcessoAoCopiloto(profile?.email)
  const personKey = profile ? resolveRoutinePersonKey(profile.name) : undefined
  const isGestorTrafego = personKey === 'ciane' || personKey === 'nicolas'
  const showSettingsSection = canManageTokens || canSeeBaseVendas || isGestorTrafego
  const myProfileCargo = teamMembers.find((m) => m.userId === profile?.id)?.jobTitle
  const perms = { canSeeUniversity, canManageTokens }
  const visibleMain = mainNav.filter((i) => !i.show || i.show(perms))
  const visibleTools = toolsNav.filter((i) => !i.show || i.show(perms))
  // Aba da Loja aberta agora (a página de um produto conta como Produtos).
  const storeAba = pathname.startsWith('/loja/produtos') ? 'produtos' : pathname.startsWith('/loja') ? new URLSearchParams(search).get('aba') || 'geral' : null
  // Se a pessoa já está numa tela de configuração, a gaveta abre sozinha.
  const inSettingsRoute = pathname.startsWith('/configuracoes') || pathname.startsWith('/otimizacoes')
  const showSettings = settingsOpen || inSettingsRoute

  const renderLink = ({ to, label, icon: Icon, alsoActive, aba }: NavItem, kind: 'main' | 'tool') => {
    const isMain = kind === 'main'
    return (
      <NavLink
        to={to}
        title={c ? label : undefined}
        aria-label={c ? label : undefined}
        onClick={onCloseMobile}
        className={({ isActive }) => {
          const active = aba ? storeAba === aba : isActive || alsoActive?.some((p) => pathname.startsWith(p))
          const size = isMain ? 'px-4 py-2.5 text-[15px] font-medium' : 'px-4 py-2 text-[13px]'
          const color = active
            ? 'bg-brand-600 text-white'
            : isMain
              ? 'text-slate-300 hover:bg-navy-800 hover:text-white'
              : 'text-slate-500 hover:bg-navy-800 hover:text-slate-200'
          return `flex items-center gap-2.5 rounded-lg transition-all duration-150 ease-in-out ${size} ${linkLayout} ${color}`
        }}
      >
        <Icon size={isMain ? 18 : 15} className="shrink-0" aria-hidden="true" />
        <span className={labelCls}>{label}</span>
      </NavLink>
    )
  }

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

        <nav aria-label="Menu" className={`sidebar flex-1 overflow-y-auto py-2 ${c ? 'px-2 md:px-2.5' : 'px-2'}`}>
          <ul className="space-y-0.5" aria-label="Principal">
            {visibleMain.map((item) => (
              <li key={item.to}>{renderLink(item, 'main')}</li>
            ))}
          </ul>

          {canManageTokens && (
            <div className="mt-4 border-t border-navy-800 pt-3">
              <p
                id="sidebar-loja"
                className={`flex items-center gap-1.5 px-4 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 ${labelCls}`}
              >
                <ShoppingBag size={12} aria-hidden="true" />
                {STORE_BRAND}
              </p>
              <ul className="space-y-0.5" aria-labelledby="sidebar-loja">
                {storeNav.map((item) => (
                  <li key={item.to}>{renderLink(item, 'tool')}</li>
                ))}
              </ul>
            </div>
          )}

          {visibleTools.length > 0 && (
            <div className="mt-4 border-t border-navy-800 pt-3">
              <p
                id="sidebar-ferramentas"
                className={`px-4 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 ${labelCls}`}
              >
                Ferramentas
              </p>
              <ul className="space-y-0.5" aria-labelledby="sidebar-ferramentas">
                {visibleTools.map((item) => (
                  <li key={item.to}>{renderLink(item, 'tool')}</li>
                ))}
              </ul>
            </div>
          )}

          {showSettingsSection && (
            <div className={`mt-4 border-t border-navy-800 pt-2 ${c ? 'md:hidden' : ''}`}>
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                aria-expanded={showSettings}
                className="flex w-full items-center gap-2 rounded-lg px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-300"
              >
                <Settings size={13} aria-hidden="true" />
                Configurações
                <ChevronDown size={13} aria-hidden="true" className={`ml-auto transition-transform ${showSettings ? 'rotate-180' : ''}`} />
              </button>

              {showSettings && (
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

                  {canSeeBaseVendas && (
                    <NavLink
                      to="/configuracoes/base-vendas"
                      onClick={onCloseMobile}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] transition-colors ${
                          isActive ? 'text-slate-200' : 'hover:text-slate-300'
                        }`
                      }
                      style={{ color: '#64748B' }}
                    >
                      <BookOpenText size={14} />
                      Base de Vendas
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

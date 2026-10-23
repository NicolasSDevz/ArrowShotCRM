import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ListChecks,
  Users,
  CalendarDays,
  Gauge,
  UserPlus,
  BarChart3,
  UserCog,
  GraduationCap,
  KeyRound,
  BookOpenText,
  CalendarRange,
  Receipt,
  Package,
  Store,
  Palette,
  ChevronDown,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
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

  const renderLink = ({ to, label, icon: Icon, alsoActive, aba }: NavItem, kind: 'main' | 'tool' | 'sub') => (
    <NavLink
      to={to}
      title={c ? label : undefined}
      aria-label={c ? label : undefined}
      onClick={onCloseMobile}
      className={({ isActive }) => {
        const active = aba ? storeAba === aba : isActive || alsoActive?.some((p) => pathname.startsWith(p))
        return `sb-link sb-${kind} ${active ? 'sb-active' : ''} ${linkLayout}`
      }}
    >
      <Icon size={kind === 'sub' ? 15 : 17} className="sb-icon shrink-0" aria-hidden="true" />
      <span className={`truncate ${labelCls}`}>{label}</span>
    </NavLink>
  )

  const sectionTitle = (id: string, text: ReactNode) => (
    <p id={id} className={`sb-section ${labelCls}`}>
      {text}
    </p>
  )

  const settingsLinks: NavItem[] = [
    ...(canManageTokens ? [{ to: '/configuracoes/tokens', label: 'Tokens Meta Ads', icon: KeyRound }] : []),
    ...(canSeeBaseVendas ? [{ to: '/configuracoes/base-vendas', label: 'Base de Vendas', icon: BookOpenText }] : []),
    ...(isGestorTrafego ? [{ to: '/otimizacoes/calendario', label: 'Calendário de Otimizações', icon: CalendarRange }] : []),
  ]

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] md:hidden" onClick={onCloseMobile} />
      )}

      <aside
        className={`sb-aside fixed inset-y-0 left-0 z-50 flex w-[236px] shrink-0 flex-col transition-[transform,width] duration-200 md:static md:z-auto md:translate-x-0 ${
          c ? 'md:w-[72px]' : ''
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className={`relative flex items-center justify-center px-3 pb-2 pt-4 ${c ? 'md:min-h-[72px] md:pt-3' : ''}`}>
          <img src="/logo-white.png" alt="Arrow Shot" className={`h-12 w-auto ${c ? 'md:hidden' : ''}`} />
          <button
            type="button"
            onClick={toggleCollapsed}
            title={c ? 'Abrir o menu' : 'Recolher o menu'}
            aria-label={c ? 'Abrir o menu' : 'Recolher o menu'}
            className={`sb-toggle hidden md:block ${c ? '' : 'absolute right-2 top-2'}`}
          >
            {c ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={16} />}
          </button>
          <button
            onClick={onCloseMobile}
            aria-label="Fechar o menu"
            className="sb-toggle absolute right-3 top-1/2 -translate-y-1/2 md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav aria-label="Menu" className={`sidebar flex-1 overflow-y-auto pb-3 pt-2 ${c ? 'px-3 md:px-3' : 'px-3'}`}>
          <ul className="space-y-0.5" aria-label="Principal">
            {visibleMain.map((item) => (
              <li key={item.to}>{renderLink(item, 'main')}</li>
            ))}
          </ul>

          {canManageTokens && (
            <div className="sb-group">
              {sectionTitle(
                'sidebar-loja',
                STORE_BRAND,
              )}
              <ul className="space-y-0.5" aria-labelledby="sidebar-loja">
                {storeNav.map((item) => (
                  <li key={item.to}>{renderLink(item, 'tool')}</li>
                ))}
              </ul>
            </div>
          )}

          {visibleTools.length > 0 && (
            <div className="sb-group">
              {sectionTitle('sidebar-ferramentas', 'Ferramentas')}
              <ul className="space-y-0.5" aria-labelledby="sidebar-ferramentas">
                {visibleTools.map((item) => (
                  <li key={item.to}>{renderLink(item, 'tool')}</li>
                ))}
              </ul>
            </div>
          )}

          {showSettingsSection && settingsLinks.length > 0 && (
            <div className={`sb-group ${c ? 'md:hidden' : ''}`}>
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                aria-expanded={showSettings}
                className="sb-section sb-section-btn"
              >
                Configurações
                <ChevronDown size={13} aria-hidden="true" className={`ml-auto transition-transform ${showSettings ? 'rotate-180' : ''}`} />
              </button>

              {showSettings && (
                <ul className="space-y-0.5">
                  {settingsLinks.map((item) => (
                    <li key={item.to}>{renderLink(item, 'sub')}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </nav>

        {profile && (
          <div className="border-t border-[#18181a] p-2">
            <div className={`sb-profile ${c ? 'md:justify-center md:bg-transparent md:p-1' : ''}`} title={c ? profile.name : undefined}>
              <Avatar name={profile.name} photoURL={profile.photoURL} size="sm" />
              <div className={`min-w-0 ${labelCls}`}>
                <p className="sb-profile-name truncate">{profile.name}</p>
                <p className="sb-profile-role truncate">{myProfileCargo ?? USER_ROLE_LABEL[profile.role]}</p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

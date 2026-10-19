import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, ListChecks, UserPlus, Users, Menu } from 'lucide-react'

const ITEMS = [
  { to: '/dashboard', label: 'Início', icon: LayoutDashboard },
  { to: '/operacional', label: 'Operacional', icon: ListChecks },
  { to: '/leads', label: 'Leads', icon: UserPlus },
  { to: '/clientes', label: 'Clientes', icon: Users },
]

/** Barra de baixo do celular, estilo app: os 4 lugares mais usados à mão e
 *  "Menu" abre a gaveta com o resto. Some a partir de md (lá tem o menu lateral). */
export function MobileTabBar({ onOpenMenu, menuOpen }: { onOpenMenu: () => void; menuOpen: boolean }) {
  const { pathname } = useLocation()
  const inMain = ITEMS.some((i) => pathname.startsWith(i.to))

  const itemCls = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 text-[10.5px] font-semibold transition-colors ${
      active ? 'text-brand-600' : 'text-slate-400 active:text-slate-600'
    }`

  return (
    <nav
      aria-label="Navegação principal"
      className="mobile-tabbar fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 backdrop-blur-md md:hidden print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg">
        {ITEMS.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex flex-1">
            <NavLink to={to} className={({ isActive }) => itemCls(isActive)}>
              {({ isActive }) => (
                <>
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${isActive ? 'bg-brand-50' : ''}`}>
                    <Icon size={20} strokeWidth={isActive ? 2.4 : 2} aria-hidden="true" />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li className="flex flex-1">
          <button type="button" onClick={onOpenMenu} aria-expanded={menuOpen} className={itemCls(menuOpen || !inMain)}>
            <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${menuOpen || !inMain ? 'bg-brand-50' : ''}`}>
              <Menu size={20} aria-hidden="true" />
            </span>
            Menu
          </button>
        </li>
      </ul>
    </nav>
  )
}

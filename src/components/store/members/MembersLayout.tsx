import { useEffect } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { LogOut, User } from 'lucide-react'
import { MembersProvider, useMembers } from './MembersContext'
import { membersThemeVars } from '../../../types/store'
import { useGoogleFont } from '../checkoutUtils'
import { Spinner } from '../../ui/FullPageSpinner'

function Shell() {
  const { user, member, loading, logout, products, theme } = useMembers()
  useGoogleFont(theme.font)
  const vars = membersThemeVars(theme)
  const { pathname } = useLocation()
  const publicRoute = pathname.startsWith('/membros/login') || pathname.startsWith('/membros/entrar')
  const logo = theme.logoUrl || products.find((p) => p.members?.logoUrl)?.members.logoUrl

  useEffect(() => {
    document.title = theme.brandName || 'Área de Membros'
  }, [theme.brandName])

  if (publicRoute) return <div style={vars}><Outlet /></div>
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--m-bg)]" style={vars} aria-busy="true">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (!user) return <Navigate to="/membros/login" replace />

  const link = ({ isActive }: { isActive: boolean }) => `text-sm font-medium ${isActive ? 'text-[var(--m-text)]' : 'text-[var(--m-muted)] hover:text-[var(--m-text)]'}`

  return (
    <div className="min-h-screen bg-[var(--m-bg)] text-[var(--m-text)]" style={vars}>
      <header className="sticky top-0 z-30 border-b border-[var(--m-border2)] bg-[color-mix(in_srgb,var(--m-bg)_90%,transparent)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
          <Link to="/membros" className="flex items-center gap-2 text-lg font-bold">
            {logo ? <img src={logo} alt={theme.brandName || 'Área de Membros'} className="h-8 w-auto" /> : theme.brandName || 'Área de Membros'}
          </Link>
          <nav aria-label="Menu da área de membros" className="flex items-center gap-5">
            <NavLink to="/membros" end className={link}>Início</NavLink>
            <NavLink to="/membros/perfil" className={link}>Meu perfil</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-sm text-[var(--m-muted)] sm:flex"><User size={16} aria-hidden="true" />{member?.name?.split(' ')[0] || member?.email}</span>
            <button onClick={() => logout()} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-[var(--m-muted)] hover:bg-[var(--m-soft)] hover:text-[var(--m-text)]">
              <LogOut size={16} aria-hidden="true" /> Sair
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  )
}

/** Casca de todas as rotas /membros/*. */
export function MembersLayout() {
  return (
    <MembersProvider>
      <Shell />
    </MembersProvider>
  )
}

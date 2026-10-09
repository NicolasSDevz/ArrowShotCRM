import { useEffect } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { LogOut, User } from 'lucide-react'
import { MembersProvider, useMembers } from './MembersContext'
import { Spinner } from '../../ui/FullPageSpinner'

function Shell() {
  const { user, member, loading, logout, products } = useMembers()
  const { pathname } = useLocation()
  const publicRoute = pathname.startsWith('/membros/login') || pathname.startsWith('/membros/entrar')
  const logo = products.find((p) => p.members?.logoUrl)?.members.logoUrl

  useEffect(() => {
    document.title = 'Área de Membros'
  }, [])

  if (publicRoute) return <Outlet />
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950" aria-busy="true">
        <Spinner className="h-6 w-6 text-white" />
      </div>
    )
  }
  if (!user) return <Navigate to="/membros/login" replace />

  const link = ({ isActive }: { isActive: boolean }) => `text-sm font-medium ${isActive ? 'text-white' : 'text-neutral-400 hover:text-white'}`

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100" style={{ colorScheme: 'dark' }}>
      <header className="sticky top-0 z-30 border-b border-white/5 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
          <Link to="/membros" className="flex items-center gap-2 text-lg font-bold">
            {logo ? <img src={logo} alt="Área de Membros" className="h-8 w-auto" /> : 'Área de Membros'}
          </Link>
          <nav aria-label="Menu da área de membros" className="flex items-center gap-5">
            <NavLink to="/membros" end className={link}>Início</NavLink>
            <NavLink to="/membros/perfil" className={link}>Meu perfil</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-sm text-neutral-400 sm:flex"><User size={16} aria-hidden="true" />{member?.name?.split(' ')[0] || member?.email}</span>
            <button onClick={() => logout()} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-neutral-400 hover:bg-white/5 hover:text-white">
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

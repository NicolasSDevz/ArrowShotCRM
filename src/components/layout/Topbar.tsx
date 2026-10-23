import { useState } from 'react'
import { Search, Menu, EyeOff, ChevronDown } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { Avatar } from '../ui/Avatar'
import { NotificationBell } from './NotificationBell'
import { TeamPresence } from './TeamPresence'
import { AccountMenu, usePresentationToggle } from './AccountMenu'

export function Topbar({
  search,
  onSearchChange,
  onOpenMobileNav,
}: {
  search?: string
  onSearchChange?: (v: string) => void
  onOpenMobileNav?: () => void
}) {
  const { profile } = useAuth()
  const { isPrivacyMode } = usePrivacy()
  const [menuOpen, setMenuOpen] = useState(false)

  const togglePresentation = usePresentationToggle()

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-100 bg-white px-3 sm:gap-3 sm:px-5">
      <button
        onClick={onOpenMobileNav}
        className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
      >
        <Menu size={20} />
      </button>

      {onSearchChange ? (
        <div className="relative w-full max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
          />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
        {/* Ligado, o modo apresentação fica visível (e desliga com um clique) — pra ninguém esquecer. */}
        {isPrivacyMode && (
          <button
            onClick={togglePresentation}
            title="Sair do modo apresentação (mostrar dados)"
            aria-label="Sair do modo apresentação"
            className="privacy-pill flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold"
          >
            <EyeOff size={14} />
            <span className="hidden sm:inline">Apresentação</span>
          </button>
        )}

        <TeamPresence />

        <NotificationBell />

        <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden="true" />

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu da conta"
            className="flex items-center gap-1 rounded-full p-0.5 pr-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <Avatar name={profile?.name ?? '?'} photoURL={profile?.photoURL} size="sm" />
            <ChevronDown size={14} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
          {menuOpen && <AccountMenu onClose={() => setMenuOpen(false)} className="absolute right-0 mt-2" />}
        </div>
      </div>
    </header>
  )
}

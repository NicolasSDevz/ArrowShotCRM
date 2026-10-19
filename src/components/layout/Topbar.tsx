import { useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { LogOut, Search, Camera, Menu, Moon, Eye, EyeOff, ChevronDown } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { Avatar } from '../ui/Avatar'
import { NotificationBell } from './NotificationBell'
import { TeamPresence } from './TeamPresence'
import { compressImageToDataUrl } from '../../utils/imageToDataUrl'
import { updateUserPhoto } from '../../services/userService'
import { showError } from '../../utils/notifyError'

/** Nome da tela aberta, mostrado no topo do celular (lá não tem menu lateral). */
const MOBILE_TITLES: [string, string][] = [
  ['/dashboard', 'Dashboard'],
  ['/operacional', 'Operacional'],
  ['/leads', 'Leads'],
  ['/copiloto', 'Copiloto'],
  ['/clientes', 'Clientes'],
  ['/social-media', 'Social Mídia'],
  ['/reunioes', 'Reuniões'],
  ['/calendario', 'Calendário'],
  ['/metricas', 'Métricas'],
  ['/relatorios', 'Relatórios'],
  ['/notificacoes', 'Notificações'],
  ['/otimizacoes', 'Otimizações'],
  ['/equipe', 'Equipe'],
  ['/configuracoes', 'Configurações'],
  ['/loja', 'Loja'],
  ['/universidade', 'Universidade'],
]

export function Topbar({
  search,
  onSearchChange,
  onOpenMobileNav,
}: {
  search?: string
  onSearchChange?: (v: string) => void
  onOpenMobileNav?: () => void
}) {
  const { profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy()
  const [menuOpen, setMenuOpen] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const { pathname } = useLocation()
  const mobileTitle = MOBILE_TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? 'Arrow Shot'

  const togglePresentation = () => {
    const next = !isPrivacyMode
    togglePrivacyMode()
    toast(next ? 'Modo apresentação ligado: dados sensíveis ocultos' : 'Modo apresentação desligado', {
      duration: 2500,
      icon: next ? <EyeOff size={16} className="text-brand-600" /> : <Eye size={16} className="text-slate-500" />,
    })
  }

  const handlePhotoChange = async (file: File | null) => {
    if (!file || !profile) return
    setUploadingPhoto(true)
    try {
      const dataUrl = await compressImageToDataUrl(file, 256, 0.85)
      await updateUserPhoto(profile.id, dataUrl)
      toast.success('Foto atualizada')
    } catch (err) {
      console.error(err)
      showError(err, 'Erro ao atualizar foto')
    } finally {
      setUploadingPhoto(false)
    }
  }

  return (
    <header
      className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-white px-3 sm:gap-3 sm:px-5"
      style={{ paddingTop: 'env(safe-area-inset-top)', minHeight: 'calc(3.5rem + env(safe-area-inset-top))' }}
    >
      <button
        onClick={onOpenMobileNav}
        aria-label="Abrir o menu"
        className="hidden shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 sm:block md:hidden"
      >
        <Menu size={20} />
      </button>
      {/* Celular: marca + nome da tela (o menu fica na barra de baixo). */}
      <div className="flex min-w-0 items-center gap-2 md:hidden">
        <img src="/favicon.png" alt="" className="h-7 w-7 shrink-0 rounded-lg" />
        <span className="truncate text-[17px] font-bold tracking-tight text-slate-900">{mobileTitle}</span>
      </div>

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
        <div className="hidden flex-1 md:block" />
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

        <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu da conta"
            className="flex items-center gap-1 rounded-full p-0.5 pr-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <Avatar name={profile?.name ?? '?'} photoURL={profile?.photoURL} size="sm" />
            <ChevronDown size={14} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-100 bg-white p-1.5 shadow-lg">
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <Avatar name={profile?.name ?? '?'} photoURL={profile?.photoURL} size="md" />
                  <div className="min-w-0 text-xs text-slate-400">
                    <p className="truncate text-sm font-medium text-slate-700">{profile?.name}</p>
                    <p className="truncate">{profile?.email}</p>
                  </div>
                </div>
                <div className="my-1 h-px bg-slate-100" />
                <MenuSwitch icon={<Moon size={14} />} label="Modo escuro" checked={theme === 'dark'} onChange={toggleTheme} />
                <MenuSwitch
                  icon={<EyeOff size={14} />}
                  label="Modo apresentação"
                  hint="Esconde valores e contatos"
                  checked={isPrivacyMode}
                  onChange={togglePresentation}
                />
                <div className="my-1 h-px bg-slate-100" />
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Camera size={14} /> {uploadingPhoto ? 'Enviando...' : 'Trocar foto'}
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
                />
                <button
                  onClick={signOut}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut size={14} /> Sair
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

/** Linha do menu da conta com um interruptor (modo escuro, modo apresentação). */
function MenuSwitch({ icon, label, hint, checked, onChange }: { icon: React.ReactNode; label: string; hint?: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50"
    >
      <span className="text-slate-500">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
      </span>
      <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-slate-300'}`}>
        {/* Cor fixa (#fefefe, não #fff): bg-white e o branco inline puro viram escuros no modo escuro (ver index.css). */}
        <span className={`absolute top-0.5 h-3 w-3 rounded-full shadow transition-all ${checked ? 'left-[14px]' : 'left-0.5'}`} style={{ background: '#fefefe' }} />
      </span>
    </button>
  )
}

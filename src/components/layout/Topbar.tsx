import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { LogOut, Search, Camera, Menu, Moon, Sun } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { Avatar } from '../ui/Avatar'
import { NotificationBell } from './NotificationBell'
import { compressImageToDataUrl } from '../../utils/imageToDataUrl'
import { updateUserPhoto } from '../../services/userService'

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
  const [menuOpen, setMenuOpen] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const handlePhotoChange = async (file: File | null) => {
    if (!file || !profile) return
    setUploadingPhoto(true)
    try {
      const dataUrl = await compressImageToDataUrl(file, 256, 0.85)
      await updateUserPhoto(profile.id, dataUrl)
      toast.success('Foto atualizada')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar foto')
    } finally {
      setUploadingPhoto(false)
    }
  }

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

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <NotificationBell />

        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="rounded-full">
            <Avatar name={profile?.name ?? '?'} photoURL={profile?.photoURL} size="sm" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-slate-100 bg-white p-1 shadow-lg">
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <Avatar name={profile?.name ?? '?'} photoURL={profile?.photoURL} size="sm" />
                  <div className="min-w-0 text-xs text-slate-400">
                    <p className="truncate font-medium text-slate-700">{profile?.name}</p>
                    <p className="truncate">{profile?.email}</p>
                  </div>
                </div>
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

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { BellRing, Camera, Check, Eye, EyeOff, LogOut, Pencil, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { Avatar } from '../ui/Avatar'
import { compressImageToDataUrl } from '../../utils/imageToDataUrl'
import { updateUserName, updateUserPhoto } from '../../services/userService'
import { showError } from '../../utils/notifyError'
import { resolveRoutinePersonKey } from '../../services/dailyRoutineTemplates'

/** Liga/desliga o modo apresentação com o aviso de sempre. */
export function usePresentationToggle() {
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy()
  return () => {
    const next = !isPrivacyMode
    togglePrivacyMode()
    toast(next ? 'Modo apresentação ligado: dados sensíveis ocultos' : 'Modo apresentação desligado', {
      duration: 2500,
      icon: next ? <EyeOff size={16} className="text-brand-600" /> : <Eye size={16} className="text-slate-500" />,
    })
  }
}

/** Menu da conta (foto do topo e nome no rodapé do menu lateral): nome, foto,
 *  modo apresentação, notificações e sair. Fecha com Esc ou clicando fora. */
export function AccountMenu({ onClose, className, subtitle }: { onClose: () => void; className: string; subtitle?: string }) {
  const { profile, signOut } = useAuth()
  const { isPrivacyMode } = usePrivacy()
  const togglePresentation = usePresentationToggle()
  const navigate = useNavigate()
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(profile?.name ?? '')
  const [savingName, setSavingName] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  // Só ao abrir: foca o primeiro botão (leitor de tela) e liga o Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current()
    window.addEventListener('keydown', onKey)
    panelRef.current?.querySelector<HTMLElement>('button')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  const saveName = async () => {
    const clean = name.trim()
    if (!profile || !clean || clean === profile.name) {
      setEditingName(false)
      setName(profile?.name ?? '')
      return
    }
    // Rotina, otimizações e painel reconhecem a pessoa pelo nome (Bruno, Ciane, Nicolas, Jamilson).
    const key = resolveRoutinePersonKey(profile.name)
    if (key && resolveRoutinePersonKey(clean) !== key) {
      toast.error(`Mantenha "${key.charAt(0).toUpperCase() + key.slice(1)}" no nome: é por ele que o CRM acha a sua rotina.`)
      return
    }
    setSavingName(true)
    try {
      await updateUserName(profile.id, clean)
      toast.success('Nome atualizado')
      setEditingName(false)
    } catch (err) {
      showError(err, 'Erro ao salvar o nome')
    } finally {
      setSavingName(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} role="menu" aria-label="Minha conta" className={`z-50 w-72 rounded-xl border border-slate-100 bg-white p-1.5 shadow-lg ${className}`}>
        <div className="flex items-center gap-3 px-2.5 py-2.5">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            title="Trocar foto"
            aria-label="Trocar foto"
            className="group relative shrink-0 rounded-full"
          >
            <Avatar name={profile?.name ?? '?'} photoURL={profile?.photoURL} size="md" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera size={14} className="text-white" />
            </span>
          </button>
          <div className="min-w-0 flex-1 text-xs text-slate-400">
            {editingName ? (
              <div className="flex items-center gap-1">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveName()
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setEditingName(false)
                      setName(profile?.name ?? '')
                    }
                  }}
                  autoFocus
                  maxLength={60}
                  disabled={savingName}
                  aria-label="Seu nome"
                  className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700 outline-none focus:border-brand-300"
                />
                <button type="button" onClick={() => void saveName()} aria-label="Salvar nome" className="rounded p-1 text-emerald-600 hover:bg-slate-100">
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingName(false)
                    setName(profile?.name ?? '')
                  }}
                  aria-label="Cancelar"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <p className="truncate text-sm font-semibold text-slate-700">{profile?.name}</p>
            )}
            <p className="truncate">{profile?.email}</p>
            {subtitle && <p className="truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="my-1 h-px bg-slate-100" />
        <MenuItem icon={<Pencil size={14} />} onClick={() => setEditingName(true)}>
          Editar nome
        </MenuItem>
        <MenuItem icon={<Camera size={14} />} onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}>
          {uploadingPhoto ? 'Enviando...' : 'Trocar foto'}
        </MenuItem>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
        />
        <MenuSwitch
          icon={<EyeOff size={14} />}
          label="Modo apresentação"
          hint="Esconde valores e contatos"
          checked={isPrivacyMode}
          onChange={togglePresentation}
        />
        <MenuItem
          icon={<BellRing size={14} />}
          onClick={() => {
            onClose()
            navigate('/notificacoes')
          }}
        >
          Notificações no celular
        </MenuItem>
        <div className="my-1 h-px bg-slate-100" />
        <button
          type="button"
          role="menuitem"
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
        >
          <LogOut size={14} /> Sair
        </button>
      </div>
    </>
  )
}

function MenuItem({ icon, children, onClick, disabled }: { icon: ReactNode; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      <span className="text-slate-500">{icon}</span>
      {children}
    </button>
  )
}

/** Linha do menu da conta com um interruptor (modo apresentação). */
function MenuSwitch({ icon, label, hint, checked, onChange }: { icon: ReactNode; label: string; hint?: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
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

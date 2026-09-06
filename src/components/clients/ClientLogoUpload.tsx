import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Camera, Loader2, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Avatar } from '../ui/Avatar'
import {
  uploadClientLogo,
  removeClientLogo,
  assertValidLogo,
  CLIENT_LOGO_ACCEPT_ATTR,
} from '../../services/clientLogoService'
import type { Client } from '../../types/client'

/** Header da ficha do cliente — logo circular 80px, upload imediato ao
 *  escolher, "x" para remover no hover. */
export function ClientLogoUpload({ client }: { client: Client }) {
  const { profile } = useAuth()
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handlePick = async (file?: File | null) => {
    if (!file || !profile) return
    try {
      assertValidLogo(file)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Imagem inválida')
      return
    }
    setBusy(true)
    try {
      await uploadClientLogo(client.id, file, profile.id, profile.name)
      toast.success('Logo atualizada')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar a logo')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    if (!profile || !client.logoUrl) return
    setBusy(true)
    try {
      await removeClientLogo(client.id, profile.id, profile.name)
      toast.success('Logo removida')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao remover a logo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="group relative h-20 w-20 shrink-0">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full ring-1 ring-slate-200 disabled:opacity-60"
        aria-label="Trocar logo do cliente"
      >
        <Avatar name={client.companyName || '?'} photoURL={client.logoUrl} size="xl" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
          {busy ? <Loader2 size={18} className="animate-spin text-white" /> : <Camera size={18} className="text-white" />}
        </span>
      </button>

      {client.logoUrl && !busy && (
        <button
          type="button"
          onClick={handleRemove}
          className="absolute -right-1 -top-1 hidden rounded-full bg-white p-1 text-slate-400 shadow ring-1 ring-slate-200 hover:text-red-500 group-hover:block"
          aria-label="Remover logo"
        >
          <X size={12} />
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={CLIENT_LOGO_ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          handlePick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

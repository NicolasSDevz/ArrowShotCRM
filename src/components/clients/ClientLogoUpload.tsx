import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Camera, Download, Loader2, Trash2, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Avatar } from '../ui/Avatar'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { ImageCropModal } from '../ui/ImageCropModal'
import {
  uploadClientLogo,
  removeClientLogo,
  assertValidLogo,
  CLIENT_LOGO_ACCEPT_ATTR,
} from '../../services/clientLogoService'
import type { Client } from '../../types/client'
import { showError } from '../../utils/notifyError'

/** Baixa a foto com o nome do cliente. Se o navegador não deixar baixar direto
 *  (CORS do Storage), abre a imagem numa aba nova pra salvar de lá. */
async function downloadLogo(url: string, name: string) {
  const base = name.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-') || 'cliente'
  try {
    const blob = await (await fetch(url)).blob()
    const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = `${base}.${ext}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  } catch {
    window.open(url, '_blank', 'noopener')
  }
}

/** Header da ficha do cliente — logo circular 80px. Clicar com foto abre ela
 *  grande (baixar, trocar, remover); sem foto, já escolhe o arquivo. Ao escolher o arquivo,
 *  abre o editor de recorte (ImageCropModal); o upload só acontece ao
 *  confirmar lá, já com a imagem recortada e comprimida. */
export function ClientLogoUpload({ client }: { client: Client }) {
  const { profile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [viewing, setViewing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handlePick = (file?: File | null) => {
    if (!file) return
    try {
      assertValidLogo(file)
    } catch (err) {
      showError(err, 'Imagem inválida')
      return
    }
    setPendingFile(file)
  }

  const handleCropConfirm = async (cropped: File) => {
    setPendingFile(null)
    if (!profile) return
    setBusy(true)
    try {
      await uploadClientLogo(client.id, cropped, profile.id, profile.name)
      toast.success('Logo atualizada')
    } catch (err) {
      console.error(err)
      showError(err, 'Erro ao enviar a logo')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    if (!profile || !client.logoUrl) return
    setViewing(false)
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
        onClick={() => (client.logoUrl ? setViewing(true) : inputRef.current?.click())}
        disabled={busy}
        className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full ring-1 ring-slate-200 disabled:opacity-60"
        aria-label={client.logoUrl ? `Ver a foto de ${client.companyName}` : 'Colocar a foto do cliente'}
        title={client.logoUrl ? 'Ver foto' : 'Colocar foto'}
      >
        <Avatar name={client.companyName || '?'} photoURL={client.logoUrl} size="xl" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
          {busy ? <Loader2 size={18} className="animate-spin text-white" /> : <Camera size={18} className="text-white" aria-hidden="true" />}
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

      {client.logoUrl && (
        <Modal open={viewing} onClose={() => setViewing(false)} title={`Foto de ${client.companyName}`} width="max-w-lg">
          <div className="flex flex-col gap-4">
            <img src={client.logoUrl} alt={`Foto de ${client.companyName}`} className="mx-auto max-h-[60vh] w-auto rounded-xl object-contain ring-1 ring-slate-200" />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" icon={<Trash2 size={14} />} onClick={handleRemove}>
                Remover
              </Button>
              <Button
                variant="secondary"
                icon={<Camera size={14} />}
                onClick={() => {
                  setViewing(false)
                  inputRef.current?.click()
                }}
              >
                Trocar foto
              </Button>
              <Button icon={<Download size={14} />} onClick={() => void downloadLogo(client.logoUrl!, client.companyName)}>
                Baixar
              </Button>
            </div>
          </div>
        </Modal>
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

      <ImageCropModal
        key={pendingFile ? `${pendingFile.name}-${pendingFile.lastModified}` : 'none'}
        open={!!pendingFile}
        file={pendingFile}
        onCancel={() => setPendingFile(null)}
        onConfirm={handleCropConfirm}
        title="Ajustar logo"
      />
    </div>
  )
}

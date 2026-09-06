import { useEffect, useMemo, useRef } from 'react'
import { Camera, X } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { CLIENT_LOGO_ACCEPT_ATTR, assertValidLogo } from '../../services/clientLogoService'
import toast from 'react-hot-toast'

/** Seletor de logo do cliente — preview circular + área clicável + remover.
 *  Não faz upload: o pai decide (imediato na ficha, ao salvar no formulário). */
export function ClientLogoField({
  companyName,
  logoUrl,
  pendingFile,
  onPick,
  onRemove,
  busy,
}: {
  companyName: string
  /** Logo já salva (URL). */
  logoUrl?: string | null
  /** Arquivo escolhido mas ainda não enviado (formulário). */
  pendingFile?: File | null
  onPick: (file: File) => void
  /** Remover a logo (chamado só quando há logo salva ou pendente). */
  onRemove: () => void
  busy?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const previewUrl = useMemo(() => (pendingFile ? URL.createObjectURL(pendingFile) : null), [pendingFile])
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const shown = previewUrl ?? logoUrl ?? undefined
  const hasLogo = !!(pendingFile || logoUrl)

  const pick = (file?: File | null) => {
    if (!file) return
    try {
      assertValidLogo(file)
      onPick(file)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Imagem inválida')
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-slate-200 disabled:opacity-60"
        aria-label="Trocar logo"
      >
        <Avatar name={companyName || '?'} photoURL={shown} size="xl" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
          <Camera size={18} className="text-white" />
        </span>
      </button>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-fit text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-60"
        >
          {hasLogo ? 'Trocar logo' : 'Clique para adicionar logo'}
        </button>
        <p className="text-xs text-slate-400">JPG, PNG ou WebP · até 2MB</p>
        {hasLogo && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="flex w-fit items-center gap-1 text-xs text-slate-400 hover:text-red-500 disabled:opacity-60"
          >
            <X size={12} /> Remover logo
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={CLIENT_LOGO_ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

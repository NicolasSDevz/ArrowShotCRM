import { useEffect, useId, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ImageOff, ImagePlus, Trash2 } from 'lucide-react'
import { releaseStoreImage, uploadStoreImage } from '../../../services/storeService'
import { ImageCropModal, ratioFromAspect, shrinkImage } from './ImageCropModal'

/** Campo de imagem: enviar arquivo, colar link ou remover. */
export function ImageField({
  label,
  value,
  onChange,
  productId,
  assetKey,
  hint,
  aspect = 'aspect-video',
  fallback,
}: {
  label: string
  value?: string | null
  onChange: (url: string | null) => void
  productId: string
  assetKey: string
  hint?: string
  aspect?: string
  /** Imagem usada quando o campo está vazio (a foto do produto). */
  fallback?: string | null
}) {
  const id = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [cropping, setCropping] = useState<File | null>(null)
  // Link salvo mas o arquivo não abre (apagado do Storage, link quebrado): avisa em vez de mostrar um quadro vazio.
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    setBroken(false)
    if (!value || value.startsWith('data:')) return
    let alive = true
    const img = new Image()
    img.onload = () => alive && setBroken(false)
    img.onerror = () => alive && setBroken(true)
    img.src = value
    return () => {
      alive = false
    }
  }, [value])
  // Logo (fundo transparente) e imagens da lateral do checkout (aparecem inteiras) não são cortadas.
  const crop = !/logo/.test(assetKey) && !assetKey.startsWith('side-')
  // Troca a imagem e libera a anterior pra ser apagada do Storage quando o produto for salvo.
  const replace = (url: string | null) => {
    if (value && value !== url) releaseStoreImage(value)
    onChange(url)
  }

  const pick = (file?: File) => {
    if (!file) return
    if (fileRef.current) fileRef.current.value = ''
    if (!file.type.startsWith('image/')) return toast.error('Selecione um arquivo de imagem.')
    if (crop && file.type !== 'image/gif') setCropping(file)
    else upload(file)
  }

  const upload = async (file: File) => {
    setCropping(null)
    setBusy(true)
    try {
      replace(await uploadStoreImage(productId, assetKey, crop ? file : await shrinkImage(file)))
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <div className="flex items-start gap-3">
        {broken ? (
          <div className={`${aspect} flex w-32 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-red-300 bg-red-50 p-2 text-center text-red-600`} aria-hidden="true">
            <ImageOff size={18} />
            <span className="text-[10px] font-medium leading-tight">Imagem não encontrada</span>
          </div>
        ) : (
          <div
            className={`${aspect} w-32 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 bg-cover bg-center ${!value && fallback ? 'opacity-60' : ''}`}
            style={value || fallback ? { backgroundImage: `url(${value || fallback})` } : undefined}
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <ImagePlus size={14} /> {busy ? 'Enviando...' : value ? 'Trocar imagem' : 'Enviar imagem'}
            </button>
            {value && (
              <button type="button" onClick={() => replace(null)} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-500 hover:bg-slate-100" aria-label={`Remover ${label}`}>
                <Trash2 size={14} /> Remover
              </button>
            )}
          </div>
          <input
            id={id}
            aria-label={`${label}: link da imagem`}
            placeholder="ou cole o link da imagem"
            value={value && !value.startsWith('data:') ? value : ''}
            onChange={(e) => replace(e.target.value.trim() || null)}
            className="h-8 w-full rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-brand-600"
          />
          {broken && <p role="alert" className="text-[11px] font-medium text-red-600">O arquivo desta imagem não existe mais. Envie a imagem de novo.</p>}
          {!value && fallback && <p className="text-[11px] text-brand-600">Usando a foto do produto. Envie outra só se quiser trocar aqui.</p>}
          {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => pick(e.target.files?.[0])} aria-hidden="true" tabIndex={-1} />
      <ImageCropModal file={cropping} ratio={ratioFromAspect(aspect)} onCancel={() => setCropping(null)} onDone={upload} />
    </div>
  )
}

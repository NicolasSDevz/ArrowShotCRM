import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronLeft, ChevronRight, ImagePlus, Trash2, Download } from 'lucide-react'
import { Button } from '../ui/Button'
import { deleteContentMedia, sortFilesByName, uploadContentMedia } from '../../services/contentMediaService'
import type { Content, ContentMedia } from '../../types/content'

const HINT: Partial<Record<Content['type'], string>> = {
  post: 'A imagem do estático (1080×1350).',
  carousel: 'As telas do carrossel, na ordem. Pode mandar todas de uma vez: elas se ordenam pelo número no nome do arquivo.',
  reels: 'O vídeo do reels e, se quiser, a capa.',
}

/** Arte do post — fica no próprio post e é o que o cliente vê na aprovação. */
export function ContentMediaPanel({
  content,
  onChange,
}: {
  content: Content
  onChange: (media: ContentMedia[]) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const media = content.media ?? []

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    const files = sortFilesByName(Array.from(list)).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (files.length === 0) {
      toast.error('Só imagem ou vídeo')
      return
    }
    const uploaded: ContentMedia[] = []
    try {
      for (let i = 0; i < files.length; i++) {
        uploaded.push(
          await uploadContentMedia(content.clientId, files[i], (pct) =>
            setProgress(files.length > 1 ? `Enviando ${i + 1} de ${files.length} · ${pct}%` : `Enviando · ${pct}%`)
          )
        )
      }
      await onChange([...media, ...uploaded])
      toast.success(uploaded.length > 1 ? `${uploaded.length} arquivos enviados` : 'Arquivo enviado')
    } catch (err) {
      console.error(err)
      if (uploaded.length) await onChange([...media, ...uploaded])
      toast.error('Erro ao enviar o arquivo')
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= media.length) return
    const next = [...media]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  const remove = async (i: number) => {
    if (!confirm('Tirar este arquivo do post?')) return
    const item = media[i]
    await onChange(media.filter((_, k) => k !== i))
    await deleteContentMedia(item)
  }

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Arte do post</p>
        <Button
          size="sm"
          variant="secondary"
          icon={<ImagePlus size={13} />}
          loading={!!progress}
          onClick={() => inputRef.current?.click()}
        >
          {media.length ? 'Adicionar' : 'Enviar arte'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {progress && <p className="mb-2 text-xs text-brand-500">{progress}</p>}

      {media.length === 0 ? (
        <p className="text-xs text-slate-400">{HINT[content.type] ?? 'Imagens ou vídeo do post.'}</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {media.map((m, i) => (
            <div key={m.storagePath} className="group relative w-28 shrink-0">
              <div className="aspect-[4/5] overflow-hidden rounded-md border border-slate-200 bg-black/5">
                {m.kind === 'video' ? (
                  <video src={m.url} className="h-full w-full object-cover" muted preload="metadata" />
                ) : (
                  <img src={m.url} alt={m.name} className="h-full w-full object-cover" loading="lazy" />
                )}
              </div>
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] font-semibold text-white">{i + 1}</span>
              <div className="mt-1 flex items-center justify-between text-slate-400">
                <button type="button" title="Mover para a esquerda" onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 hover:text-slate-700 disabled:opacity-30">
                  <ChevronLeft size={14} />
                </button>
                <a href={m.url} target="_blank" rel="noreferrer" title="Abrir / baixar" className="p-0.5 hover:text-slate-700">
                  <Download size={13} />
                </a>
                <button type="button" title="Tirar do post" onClick={() => remove(i)} className="p-0.5 hover:text-red-500">
                  <Trash2 size={13} />
                </button>
                <button type="button" title="Mover para a direita" onClick={() => move(i, 1)} disabled={i === media.length - 1} className="p-0.5 hover:text-slate-700 disabled:opacity-30">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

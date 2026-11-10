import { useEffect, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useDialogA11y } from '../ui/useDialogA11y'
import type { ContentMedia } from '../../types/content'

/** Visualizador em tela cheia das artes do post — pra ler o texto dentro da arte.
 *  Setas (botão ou teclado) passam as telas; clicar na imagem (ou "Z") alterna
 *  entre caber na tela e tamanho real com rolagem; Esc fecha. */
export function MediaLightbox({
  media,
  index,
  onIndexChange,
  onClose,
}: {
  media: ContentMedia[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
}) {
  const [zoomed, setZoomed] = useState(false)
  const { panelRef, onKeyDown } = useDialogA11y(true, onClose)
  const item = media[index]
  const many = media.length > 1

  useEffect(() => setZoomed(false), [index])

  // Trava a rolagem da página enquanto o visualizador está aberto.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  if (!item) return null

  const go = (dir: -1 | 1) => onIndexChange((index + dir + media.length) % media.length)

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' && many) go(-1)
    else if (e.key === 'ArrowRight' && many) go(1)
    else if ((e.key === 'z' || e.key === 'Z') && item.kind === 'image') setZoomed((z) => !z)
    else onKeyDown(e)
  }

  const btn = 'rounded-full bg-white/10 p-2 text-white transition hover:bg-white/25 disabled:opacity-30'

  return createPortal(
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Arte ${index + 1} de ${media.length}`}
      onKeyDown={handleKey}
      className="fixed inset-0 z-[400] flex flex-col bg-black/90 outline-none"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm text-white/80">
        <span>
          {index + 1} / {media.length}
          <span className="ml-3 hidden text-white/50 sm:inline">{item.name}</span>
        </span>
        <div className="flex items-center gap-2">
          {item.kind === 'image' && (
            <button type="button" className={btn} onClick={() => setZoomed((z) => !z)} title={zoomed ? 'Caber na tela (Z)' : 'Tamanho real (Z)'}>
              {zoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
            </button>
          )}
          <a href={item.url} target="_blank" rel="noreferrer" className={btn} title="Abrir / baixar">
            <Download size={18} />
          </a>
          <button type="button" className={btn} onClick={onClose} title="Fechar (Esc)">
            <X size={18} />
          </button>
        </div>
      </div>

      <div
        className={`relative flex flex-1 ${zoomed ? 'overflow-auto' : 'items-center justify-center overflow-hidden'} px-2 pb-4 sm:px-16`}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        {item.kind === 'video' ? (
          <video key={item.url} src={item.url} controls autoPlay playsInline className="max-h-full max-w-full rounded-md" />
        ) : (
          <img
            src={item.url}
            alt={item.name}
            onClick={() => setZoomed((z) => !z)}
            className={
              zoomed
                ? 'mx-auto max-w-none cursor-zoom-out'
                : 'max-h-full max-w-full cursor-zoom-in rounded-md object-contain'
            }
          />
        )}
      </div>

      {many && (
        <>
          <button type="button" className={`${btn} absolute left-3 top-1/2 -translate-y-1/2`} onClick={() => go(-1)} title="Anterior (←)">
            <ChevronLeft size={24} />
          </button>
          <button type="button" className={`${btn} absolute right-3 top-1/2 -translate-y-1/2`} onClick={() => go(1)} title="Próxima (→)">
            <ChevronRight size={24} />
          </button>
        </>
      )}
    </div>,
    document.body
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2, Minus, Plus, X } from 'lucide-react'
import { memberViewFile } from '../../../services/storeApi'

// pdf.js vem da CDN só quando alguém abre um PDF (não pesa no resto da área de membros).
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs'
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs'

interface PdfPage {
  getViewport: (o: { scale: number }) => { width: number; height: number }
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> }
}
interface PdfDoc {
  numPages: number
  getPage: (n: number) => Promise<PdfPage>
  destroy: () => void
}
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument: (o: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> }
}

let pdfjsPromise: Promise<PdfJs> | null = null
function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* @vite-ignore */ PDFJS).then((m: PdfJs) => {
      m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
      return m
    })
    pdfjsPromise.catch(() => (pdfjsPromise = null))
  }
  return pdfjsPromise
}

/** Leitor do PDF protegido: páginas desenhadas em imagem (sem botão de baixar, sem
 *  selecionar texto, sem imprimir), com o nome e o e-mail do aluno por cima. Não
 *  impede print de tela, mas tudo sai carimbado com os dados de quem comprou.
 *  `inline`: fica dentro da aula (aula do tipo PDF), com botão de tela cheia. */
export function ProtectedPdfViewer({ productId, lessonId, index, title, watermark, onClose, inline = false }: { productId: string; lessonId: string; index: number | 'pdf'; title: string; watermark: string; onClose?: () => void; inline?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const modal = !inline || expanded
  const collapse = useCallback(() => setExpanded(false), [])
  const close = inline ? collapse : onClose
  const [doc, setDoc] = useState<PdfDoc | null>(null)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(0)
  const bodyRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let alive = true
    let loaded: PdfDoc | null = null
    Promise.all([loadPdfJs(), memberViewFile(productId, lessonId, index)])
      .then(([pdfjs, data]) => pdfjs.getDocument({ data }).promise)
      .then((d) => {
        loaded = d
        if (alive) setDoc(d)
        else d.destroy()
      })
      .catch((err: Error) => alive && setError(err.message || 'Não foi possível abrir o arquivo'))
    return () => {
      alive = false
      loaded?.destroy()
    }
  }, [productId, lessonId, index])

  // Largura disponível (refaz as páginas ao girar o celular ou redimensionar).
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(Math.min(el.clientWidth - 32, 900)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Ctrl+S / Ctrl+P / Ctrl+C ficam bloqueados enquanto o leitor está na tela.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'c'].includes(e.key.toLowerCase())) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Em tela cheia: Esc fecha (ou volta para a aula) e a página de trás não rola.
  useEffect(() => {
    if (!modal) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close?.()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [modal, close])

  return (
    <div
      role={modal ? 'dialog' : 'region'}
      aria-modal={modal || undefined}
      aria-label={`Leitor: ${title}`}
      className={`protected-pdf flex flex-col bg-black/90 ${modal ? 'fixed inset-0 z-[100]' : 'h-[75vh] min-h-[420px] overflow-hidden rounded-xl border border-[var(--m-border)]'}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Nada do leitor sai na impressão. */}
      <style>{'@media print { .protected-pdf { display: none !important } }'}</style>
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-white">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</p>
        {doc && <span className="hidden text-xs text-white/60 sm:inline">{doc.numPages} {doc.numPages > 1 ? 'páginas' : 'página'}</span>}
        <button type="button" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))} className="rounded-lg p-2 hover:bg-white/10" aria-label="Diminuir zoom"><Minus size={16} /></button>
        <span className="w-10 text-center text-xs tabular-nums" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(1)))} className="rounded-lg p-2 hover:bg-white/10" aria-label="Aumentar zoom"><Plus size={16} /></button>
        {inline && !expanded && <button type="button" onClick={() => setExpanded(true)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Abrir em tela cheia"><Maximize2 size={16} /></button>}
        {modal && (
          <button ref={closeRef} type="button" onClick={close} className="rounded-lg p-2 hover:bg-white/10" aria-label={inline ? 'Sair da tela cheia' : 'Fechar leitor'}>
            {inline ? <Minimize2 size={16} /> : <X size={18} />}
          </button>
        )}
      </header>
      <div ref={bodyRef} className="flex-1 select-none overflow-auto py-4" style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
        {error && <p role="alert" className="mx-auto max-w-md rounded-lg bg-red-500/15 p-4 text-center text-sm text-red-200">{error}</p>}
        {!doc && !error && <p className="text-center text-sm text-white/70">Abrindo o arquivo...</p>}
        {doc && width > 0 &&
          Array.from({ length: doc.numPages }, (_, i) => (
            <PageCanvas key={i} doc={doc} pageNumber={i + 1} total={doc.numPages} width={width * zoom} watermark={watermark} />
          ))}
      </div>
    </div>
  )
}

function PageCanvas({ doc, pageNumber, total, width, watermark }: { doc: PdfDoc; pageNumber: number; total: number; width: number; watermark: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [height, setHeight] = useState(width * 1.414)

  useEffect(() => {
    let cancelled = false
    doc.getPage(pageNumber).then((page) => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      const base = page.getViewport({ scale: 1 })
      const scale = width / base.width
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale: scale * ratio })
      canvas.width = viewport.width
      canvas.height = viewport.height
      setHeight(viewport.height / ratio)
      const ctx = canvas.getContext('2d')
      if (ctx) page.render({ canvasContext: ctx, viewport })
    })
    return () => {
      cancelled = true
    }
  }, [doc, pageNumber, width])

  return (
    <div className="relative mx-auto mb-4 overflow-hidden bg-white shadow-lg" style={{ width, height }} aria-label={`Página ${pageNumber} de ${total}`} role="img">
      <canvas ref={canvasRef} draggable={false} style={{ width, height, display: 'block' }} />
      {/* Marca d'água por cima da página (além do carimbo já gravado no PDF). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-wrap content-around justify-around overflow-hidden opacity-[0.12]">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="-rotate-[30deg] whitespace-nowrap font-bold text-black" style={{ fontSize: Math.max(14, width / 28) }}>{watermark}</span>
        ))}
      </div>
    </div>
  )
}

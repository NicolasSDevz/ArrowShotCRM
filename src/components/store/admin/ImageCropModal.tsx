import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'

/** Proporção (largura / altura) a partir da classe do Tailwind usada no campo. */
export function ratioFromAspect(aspect: string) {
  if (aspect.includes('aspect-square')) return 1
  if (aspect.includes('aspect-video')) return 16 / 9
  const m = /aspect-\[(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\]/.exec(aspect)
  return m ? Number(m[1]) / Number(m[2]) : 16 / 9
}

/** Tamanho final padrão de cada formato: banners largos em 1920, quadradas em 1080, verticais com 900 de altura. */
export function outputSize(ratio: number) {
  if (ratio >= 2) return { w: 1920, h: Math.round(1920 / ratio) }
  if (ratio >= 1.3) return { w: 1600, h: Math.round(1600 / ratio) }
  if (ratio >= 1) return { w: 1080, h: Math.round(1080 / ratio) }
  return { w: Math.round(900 * ratio), h: 900 }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não deu pra abrir essa imagem'))
    img.src = src
  })
}

function canvasToFile(canvas: HTMLCanvasElement, name: string, png: boolean) {
  return new Promise<File>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], name.replace(/\.\w+$/, '') + (png ? '.png' : '.jpg'), { type: png ? 'image/png' : 'image/jpeg' })) : reject(new Error('Não deu pra preparar a imagem'))),
      png ? 'image/png' : 'image/jpeg',
      0.88
    )
  )
}

/** Sem corte (logos, imagens da lateral): só diminui se passar de `max` px no lado maior. */
export async function shrinkImage(file: File, max = 1920) {
  if (file.type === 'image/gif') return file
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvasToFile(canvas, file.name, file.type === 'image/png' || file.type === 'image/webp')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Enquadrar a imagem no formato do campo: arrastar pra posicionar e zoom. A saída
 *  já vem cortada e no tamanho padrão (ver outputSize), então qualquer foto serve. */
export function ImageCropModal({ file, ratio, onCancel, onDone }: { file: File | null; ratio: number; onCancel: () => void; onDone: (cropped: File) => void }) {
  const [src, setSrc] = useState<string | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const [frameW, setFrameW] = useState(520)
  const frameH = frameW / ratio

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setSrc(url)
    setZoom(1)
    loadImage(url).then(setImg).catch(() => setImg(null))
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [src])

  // Escala que cobre a moldura inteira (zoom 1) e posição limitada pra não sobrar borda vazia.
  const base = img ? Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight) : 1
  const scale = base * zoom
  const dispW = img ? img.naturalWidth * scale : 0
  const dispH = img ? img.naturalHeight * scale : 0
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(frameW - dispW, p.x)),
    y: Math.min(0, Math.max(frameH - dispH, p.y)),
  })

  // Imagem nova ou zoom: centraliza (no zoom, mantém o centro).
  useEffect(() => {
    if (img) setPos(clamp({ x: (frameW - img.naturalWidth * base) / 2, y: (frameH - img.naturalHeight * base) / 2 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, frameW])

  const changeZoom = (z: number) => {
    const cx = frameW / 2
    const cy = frameH / 2
    const k = z / zoom
    setZoom(z)
    const nextW = img ? img.naturalWidth * base * z : 0
    const nextH = img ? img.naturalHeight * base * z : 0
    setPos({
      x: Math.min(0, Math.max(frameW - nextW, cx - (cx - pos.x) * k)),
      y: Math.min(0, Math.max(frameH - nextH, cy - (cy - pos.y) * k)),
    })
  }

  const onDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current) return
    setPos(clamp({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }))
  }
  const onUp = () => {
    drag.current = null
  }

  const confirm = async () => {
    if (!img || !file) return
    setBusy(true)
    try {
      const out = outputSize(ratio)
      const canvas = document.createElement('canvas')
      canvas.width = out.w
      canvas.height = out.h
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, -pos.x / scale, -pos.y / scale, frameW / scale, frameH / scale, 0, 0, out.w, out.h)
      onDone(await canvasToFile(canvas, file.name, file.type === 'image/png'))
    } finally {
      setBusy(false)
    }
  }

  const out = outputSize(ratio)
  return (
    <Modal open={!!file} onClose={onCancel} title="Enquadrar imagem" width="max-w-2xl">
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Arraste pra posicionar e use o zoom. A imagem fica no tamanho certo ({out.w} x {out.h} px) sozinha.</p>
        <div
          ref={frameRef}
          className="relative w-full cursor-grab touch-none select-none overflow-hidden rounded-lg bg-slate-100 active:cursor-grabbing"
          style={{ aspectRatio: String(ratio) }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {src && img && (
            <img src={src} alt="" draggable={false} className="pointer-events-none absolute left-0 top-0 max-w-none" style={{ width: dispW, height: dispH, transform: `translate(${pos.x}px, ${pos.y}px)` }} />
          )}
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/10" aria-hidden="true" />
        </div>
        <label className="flex items-center gap-3 text-sm text-slate-600">
          Zoom
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} className="flex-1 accent-brand-600" />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button type="button" loading={busy} disabled={!img} onClick={confirm}>Usar imagem</Button>
        </div>
      </div>
    </Modal>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { ZoomIn } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

interface Point {
  x: number
  y: number
}

/** Recorte de imagem antes do upload — arrastar pra posicionar, slider pra
 *  zoom, igual ao fluxo de foto de perfil do Instagram/WhatsApp. Não usa
 *  nenhuma lib externa (canvas + pointer events puro), consistente com o
 *  resto do projeto (gráficos também são SVG/canvas na mão, sem lib de
 *  charting). Sempre exporta um JPEG quadrado — o "círculo" é só a máscara
 *  visual do editor e da exibição (Avatar usa rounded-full por cima). */
export function ImageCropModal({
  open,
  file,
  onCancel,
  onConfirm,
  viewportSize = 260,
  outputSize = 480,
  title = 'Ajustar imagem',
}: {
  open: boolean
  file: File | null
  onCancel: () => void
  onConfirm: (file: File) => void
  viewportSize?: number
  outputSize?: number
  title?: string
}) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState<Point>({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [exporting, setExporting] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; origin: Point } | null>(null)

  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }, [objectUrl])

  // Escala "cover" (zoom=1): o menor fator que garante que a imagem cobre
  // todo o viewport quadrado, sem sobrar espaço vazio.
  const baseScale = naturalSize ? Math.max(viewportSize / naturalSize.w, viewportSize / naturalSize.h) : 1
  const scale = baseScale * zoom
  const dispW = naturalSize ? naturalSize.w * scale : 0
  const dispH = naturalSize ? naturalSize.h * scale : 0

  const clamp = (p: Point, w: number, h: number): Point => ({
    x: Math.min(0, Math.max(viewportSize - w, p.x)),
    y: Math.min(0, Math.max(viewportSize - h, p.y)),
  })

  // Centraliza a imagem no viewport assim que as dimensões naturais chegam.
  const handleImgLoad = () => {
    const img = imgRef.current
    if (!img) return
    const w = img.naturalWidth
    const h = img.naturalHeight
    setNaturalSize({ w, h })
    const s = Math.max(viewportSize / w, viewportSize / h)
    setPos({ x: (viewportSize - w * s) / 2, y: (viewportSize - h * s) / 2 })
  }

  const handleZoomChange = (nextZoom: number) => {
    if (!naturalSize) return
    // Mantém o centro atual do recorte fixo ao dar zoom, em vez de recentrar
    // tudo — senão cada movimento do slider "chuta" a posição que a pessoa
    // já tinha ajustado.
    const oldScale = scale
    const newScale = baseScale * nextZoom
    const centerImgX = (viewportSize / 2 - pos.x) / oldScale
    const centerImgY = (viewportSize / 2 - pos.y) / oldScale
    const newPos = {
      x: viewportSize / 2 - centerImgX * newScale,
      y: viewportSize / 2 - centerImgY * newScale,
    }
    setZoom(nextZoom)
    setPos(clamp(newPos, naturalSize.w * newScale, naturalSize.h * newScale))
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: pos }
    setDragging(true)
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !naturalSize) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setPos(clamp({ x: dragRef.current.origin.x + dx, y: dragRef.current.origin.y + dy }, dispW, dispH))
  }
  const handlePointerUp = () => {
    dragRef.current = null
    setDragging(false)
  }

  const handleConfirm = async () => {
    if (!naturalSize || !file) return
    setExporting(true)
    try {
      const img = new Image()
      img.src = objectUrl!
      await img.decode()

      const sx = -pos.x / scale
      const sy = -pos.y / scale
      const sSize = viewportSize / scale

      const canvas = document.createElement('canvas')
      canvas.width = outputSize
      canvas.height = outputSize
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Não foi possível processar a imagem.')
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, outputSize, outputSize)

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      if (!blob) throw new Error('Não foi possível gerar a imagem recortada.')

      const croppedName = file.name.replace(/\.\w+$/, '') + '.jpg'
      onConfirm(new File([blob], croppedName, { type: 'image/jpeg' }))
    } finally {
      setExporting(false)
    }
  }

  if (!file) return null

  return (
    <Modal open={open} onClose={onCancel} title={title} width="max-w-sm">
      <div className="flex flex-col items-center gap-4">
        <div
          className="relative touch-none select-none overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200"
          style={{ width: viewportSize, height: viewportSize, cursor: dragging ? 'grabbing' : 'grab' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {objectUrl && (
            <img
              ref={imgRef}
              src={objectUrl}
              alt=""
              draggable={false}
              onLoad={handleImgLoad}
              className="absolute max-w-none"
              style={{ width: dispW || undefined, height: dispH || undefined, left: pos.x, top: pos.y }}
            />
          )}
        </div>

        <div className="flex w-full items-center gap-2.5">
          <ZoomIn size={15} className="shrink-0 text-slate-400" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            className="w-full accent-brand-600"
            disabled={!naturalSize}
          />
        </div>

        <p className="text-center text-xs text-slate-400">Arraste a imagem para posicionar e use o zoom para ajustar</p>

        <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={exporting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} loading={exporting} disabled={!naturalSize}>
            Usar esta imagem
          </Button>
        </div>
      </div>
    </Modal>
  )
}

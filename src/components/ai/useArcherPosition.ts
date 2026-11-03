import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

/** Posição do botão flutuante do Archer: lado da tela + distância do fundo.
 *  Arrastar move livre e, ao soltar, ele gruda no lado mais perto (esquerda ou direita).
 *  Teclado (leitor de tela): Alt + setas. Fica salvo no navegador. */

export type ArcherSide = 'left' | 'right'
interface Pos {
  side: ArcherSide
  bottom: number
}

const KEY = 'archer.pos'
const BIG_KEY = 'archer.big'
const SIZE = 52
const GAP = 24 // distância da borda lateral
const MIN = 16 // distância mínima do topo/fundo
const DRAG_PX = 6 // abaixo disso é clique, não arraste

function load(): Pos {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (v && (v.side === 'left' || v.side === 'right') && Number.isFinite(v.bottom)) return { side: v.side, bottom: v.bottom }
  } catch {
    /* sem storage: posição padrão */
  }
  return { side: 'right', bottom: GAP }
}
function save(p: Pos) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* sem storage: só não lembra depois do F5 */
  }
}

const clampBottom = (b: number, h: number) => Math.round(Math.min(Math.max(b, MIN), Math.max(MIN, h - SIZE - MIN)))

export function useArcherPosition() {
  const [pos, setPos] = useState<Pos>(load)
  // Caixa grande: mais larga e quase da altura da tela.
  const [big, setBig] = useState(() => {
    try {
      return localStorage.getItem(BIG_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggleBig = () =>
    setBig((v) => {
      try {
        localStorage.setItem(BIG_KEY, v ? '0' : '1')
      } catch {
        /* sem storage */
      }
      return !v
    })
  const [vh, setVh] = useState(() => window.innerHeight)
  const [vw, setVw] = useState(() => window.innerWidth)
  // Enquanto arrasta: canto superior esquerdo do botão, em px.
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const start = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null)
  const justDragged = useRef(false)

  useEffect(() => {
    const onResize = () => {
      setVh(window.innerHeight)
      setVw(window.innerWidth)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const bottom = clampBottom(pos.bottom, vh)

  // Avisa o CSS (ex.: caixa de escrever do WhatsApp deixa espaço do lado certo).
  useEffect(() => {
    document.body.dataset.archerSide = pos.side
    return () => {
      delete document.body.dataset.archerSide
    }
  }, [pos.side])

  const commit = useCallback(
    (p: Pos) => {
      const next = { side: p.side, bottom: clampBottom(p.bottom, vh) }
      setPos(next)
      save(next)
    },
    [vh]
  )

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    const r = e.currentTarget.getBoundingClientRect()
    start.current = { px: e.clientX, py: e.clientY, ox: r.left, oy: r.top, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const s = start.current
    if (!s) return
    const dx = e.clientX - s.px
    const dy = e.clientY - s.py
    if (!s.moved && Math.hypot(dx, dy) < DRAG_PX) return
    s.moved = true
    setDrag({ x: Math.min(Math.max(s.ox + dx, 0), vw - SIZE), y: Math.min(Math.max(s.oy + dy, 0), vh - SIZE) })
  }
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const s = start.current
    start.current = null
    if (!s?.moved || !drag) {
      setDrag(null)
      return
    }
    justDragged.current = true
    const side: ArcherSide = drag.x + SIZE / 2 < vw / 2 ? 'left' : 'right'
    commit({ side, bottom: vh - drag.y - SIZE })
    setDrag(null)
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }
  /** O clique que fecha um arraste não abre o chat. */
  const consumeDragClick = () => {
    if (!justDragged.current) return false
    justDragged.current = false
    return true
  }
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!e.altKey) return
    const moves: Record<string, Pos> = {
      ArrowLeft: { ...pos, side: 'left' },
      ArrowRight: { ...pos, side: 'right' },
      ArrowUp: { ...pos, bottom: bottom + 60 },
      ArrowDown: { ...pos, bottom: bottom - 60 },
    }
    const next = moves[e.key]
    if (!next) return
    e.preventDefault()
    commit(next)
  }

  const buttonStyle: CSSProperties = drag
    ? { left: drag.x, top: drag.y, cursor: 'grabbing', transition: 'none' }
    : { [pos.side]: GAP, bottom, cursor: 'grab' }

  // Painel abre do mesmo lado; acima do botão, ou abaixo se o botão estiver na metade de cima.
  const above = bottom < vh / 2
  const room = above ? vh - (bottom + SIZE + 16) - MIN : vh - bottom - MIN - 12
  const panelStyle: CSSProperties = {
    [pos.side]: GAP,
    ...(above ? { bottom: bottom + SIZE + 16 } : { top: vh - bottom + 12 }),
    height: Math.max(280, Math.min(big ? 1000 : 520, room)),
    width: Math.min(big ? 720 : 380, vw - 2 * MIN),
    transition: 'width 160ms ease, height 160ms ease',
  }

  return { big, toggleBig, side: pos.side, dragging: Boolean(drag), buttonStyle, panelStyle, handlers: { onPointerDown, onPointerMove, onPointerUp, onKeyDown }, consumeDragClick }
}

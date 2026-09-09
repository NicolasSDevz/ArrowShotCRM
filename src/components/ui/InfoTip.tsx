import { useEffect, useRef, useState } from 'react'

/** Ícone ℹ️ com tooltip explicativo. Aparece no hover, no foco por teclado e
 *  no clique (fixa até clicar fora / Esc). Fundo escuro em ambos os temas,
 *  seta apontando para o ícone. Usado nos cards do painel "Visão Geral". */
export function InfoTip({ title, children }: { title?: string; children: string }) {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const open = hover || pinned

  useEffect(() => {
    if (!pinned) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPinned(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [pinned])

  return (
    <span ref={ref} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={title ? `O que é ${title}` : 'Mais informações'}
        aria-expanded={open}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onClick={() => setPinned((p) => !p)}
        className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
      >
        <span aria-hidden="true">ℹ️</span>
      </button>
      {open && (
        <span
          role="tooltip"
          className="infotip-pop absolute right-0 top-full z-[80] mt-2 block w-[250px] whitespace-pre-line text-left text-xs font-normal leading-relaxed"
          style={{
            backgroundColor: '#1E293B',
            color: '#F1F5F9',
            borderRadius: 8,
            padding: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <span
            aria-hidden="true"
            className="absolute -top-1.5 right-2.5 block h-3 w-3 rotate-45"
            style={{ backgroundColor: '#1E293B' }}
          />
          {title && <span className="mb-1 block font-semibold">{title}</span>}
          <span className="relative">{children}</span>
        </span>
      )}
    </span>
  )
}

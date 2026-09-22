import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'

/** Ícone de informação com popup explicativo — abre e fecha só no clique
 *  (nunca no hover, pra não atrapalhar quem só tá passando o mouse pelo
 *  card), fecha ao clicar fora ou apertar Esc. Fundo escuro em ambos os
 *  temas, seta apontando pro ícone. Usado nos cards do painel "Visão
 *  Geral" — `children` aceita texto simples ou conteúdo rico (ex: lista de
 *  clientes que deram churn, no popup de Churn Rate). */
export function InfoTip({ title, children }: { title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={title ? `O que é ${title}` : 'Mais informações'}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((p) => !p)
        }}
        className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-slate-600 focus-visible:text-slate-600"
      >
        <Info size={14} aria-hidden="true" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="infotip-pop absolute right-0 top-full z-[80] mt-2 block max-h-80 w-[290px] overflow-y-auto whitespace-pre-line text-left text-xs font-normal leading-relaxed"
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
          {title && <span className="relative mb-1 block font-semibold">{title}</span>}
          <span className="relative block">{children}</span>
        </span>
      )}
    </span>
  )
}

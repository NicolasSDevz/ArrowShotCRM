import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { MoreVertical } from 'lucide-react'

export type ActionsMenuItem = { label: string; icon?: ReactNode; onSelect: () => void; hint?: string }

/** Menu "⋮" com as ações que se usa pouco. Acessível: botão com
 *  aria-haspopup, itens role="menuitem", setas pra cima/baixo, Esc fecha e
 *  devolve o foco pro botão. */
export function ActionsMenu({ label, items }: { label: string; items: ActionsMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const btnRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (open) requestAnimationFrame(() => itemRefs.current[0]?.focus())
  }, [open])

  const close = (focusButton = true) => {
    setOpen(false)
    if (focusButton) btnRef.current?.focus()
  }

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = itemRefs.current.findIndex((el) => el === document.activeElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      itemRefs.current[(idx + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      itemRefs.current[(idx - 1 + items.length) % items.length]?.focus()
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        title={label}
        className={`flex h-[38px] w-[38px] items-center justify-center rounded-lg border transition-colors ${
          open ? 'border-brand-600 bg-brand-50 text-slate-800' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
        }`}
      >
        <MoreVertical size={16} aria-hidden="true" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => close(false)} aria-hidden="true" />
          <div
            id={id}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
          >
            {items.map((it, i) => (
              <button
                key={it.label}
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                type="button"
                role="menuitem"
                onClick={() => {
                  close(false)
                  it.onSelect()
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
              >
                {it.icon && (
                  <span aria-hidden="true" className="text-slate-400">
                    {it.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  {it.label}
                  {it.hint && <span className="block text-xs text-slate-400">{it.hint}</span>}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

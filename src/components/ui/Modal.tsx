import { useId, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useDialogA11y } from './useDialogA11y'

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
  onTop = false,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  width?: string
  /** Acima de tudo (inclusive do construtor de formulário, que é tela cheia) — pra avisos globais. */
  onTop?: boolean
}) {
  const titleId = useId()
  const { panelRef, onKeyDown } = useDialogA11y(open, onClose)
  if (!open) return null

  return (
    // Celular: abre como folha que sobe de baixo (mais fácil de alcançar com o polegar).
    <div className={`fixed inset-0 ${onTop ? 'z-[300]' : 'z-40'} flex items-end justify-center sm:items-center sm:p-4`}>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`sheet-up relative z-50 flex max-h-[92dvh] w-full flex-col ${width} rounded-t-2xl bg-white shadow-2xl outline-none sm:max-h-[90vh] sm:rounded-xl`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3.5 sm:py-4">
          <div id={titleId} className="text-base font-semibold text-slate-800">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:max-h-[75vh]" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

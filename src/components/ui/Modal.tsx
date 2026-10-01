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
    <div className={`fixed inset-0 ${onTop ? 'z-[300]' : 'z-40'} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`relative z-50 w-full ${width} rounded-xl bg-white shadow-2xl outline-none`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
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
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

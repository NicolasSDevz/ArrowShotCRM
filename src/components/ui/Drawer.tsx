import { useId, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useDialogA11y } from './useDialogA11y'

/** Right-hand slide-over used for task/content/client details.
 *  Chosen over full-page routes so opening an item never loses the board's scroll/filter state.
 *  Acessível pra leitor de tela (Jamilson): role="dialog", foco vai pro painel
 *  ao abrir e volta pro botão de origem ao fechar, Esc fecha. */
export function Drawer({
  open,
  onClose,
  title,
  children,
  width = 'w-full max-w-xl',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  width?: string
}) {
  const titleId = useId()
  const { panelRef, onKeyDown } = useDialogA11y(open, onClose)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`relative z-50 flex ${width} flex-col bg-white shadow-2xl outline-none`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div id={titleId} className="min-w-0 text-base font-semibold text-slate-800">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

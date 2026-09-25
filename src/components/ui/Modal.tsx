import type { ReactNode } from 'react'
import { X } from 'lucide-react'

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
  if (!open) return null

  return (
    <div className={`fixed inset-0 ${onTop ? 'z-[300]' : 'z-40'} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className={`relative z-50 w-full ${width} rounded-xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="text-base font-semibold text-slate-800">{title}</div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

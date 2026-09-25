import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import { Button } from './Button'
import { onConfirmRequest, type ConfirmRequest } from '../../utils/confirmDialog'

/** Janela de confirmação global (ver utils/confirmDialog). Fica numa camada
 *  acima de tudo — inclusive do construtor de formulário, que é tela cheia. */
export function ConfirmDialogHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null)
  const resolveRef = useRef<((ok: boolean) => void) | null>(null)

  useEffect(
    () =>
      onConfirmRequest((r, resolve) => {
        // Uma confirmação nova antes de responder a anterior: a anterior vale como "não".
        resolveRef.current?.(false)
        resolveRef.current = resolve
        setReq(r)
      }),
    []
  )

  const answer = (ok: boolean) => {
    resolveRef.current?.(ok)
    resolveRef.current = null
    setReq(null)
  }

  useEffect(() => {
    if (!req) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [req])

  if (!req) return null
  const Icon = req.danger ? AlertTriangle : HelpCircle
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="absolute inset-0 bg-black/40" onClick={() => answer(false)} />
      <div className="relative w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${req.danger ? 'bg-red-50 text-red-500' : 'bg-brand-50 text-brand-600'}`}>
            <Icon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p id="confirm-title" className="text-base font-semibold text-slate-800">
              {req.title}
            </p>
            {req.message && <p className="mt-1 text-sm leading-relaxed text-slate-500">{req.message}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => answer(false)}>
            Cancelar
          </Button>
          <Button autoFocus onClick={() => answer(true)} className={req.danger ? '!bg-red-600 hover:!bg-red-700' : ''}>
            {req.confirmLabel ?? 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

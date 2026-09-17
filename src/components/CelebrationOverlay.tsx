import { useEffect, useRef, useState } from 'react'
import { subscribeCelebrations, pruneOldCelebrations, type CelebrationEvent } from '../services/celebrationService'
import { fireCelebration } from '../utils/celebration'

/** Overlay global (montado no AppLayout) — escuta `celebrationEvents` e, a
 *  cada evento fresco, dispara confetes + som e mostra um toast centralizado
 *  que fica até alguém clicar em "OK". Funciona em qualquer rota. */
export function CelebrationOverlay() {
  const [toast, setToast] = useState<{ clientName: string; closedBy: string } | null>(null)
  const seen = useRef<Set<string>>(new Set())
  const lastFiredAt = useRef(0)

  useEffect(() => {
    pruneOldCelebrations()

    const onNew = (event: CelebrationEvent) => {
      if (seen.current.has(event.id)) return
      seen.current.add(event.id)

      // dedupe: mover p/ "Fechado" e "Converter em cliente" podem gerar dois
      // eventos seguidos — uma festa só.
      if (Date.now() - lastFiredAt.current < 8000) {
        setToast({ clientName: event.clientName, closedBy: event.closedBy })
        return
      }
      lastFiredAt.current = Date.now()

      fireCelebration()
      setToast({ clientName: event.clientName, closedBy: event.closedBy })
    }

    const unsub = subscribeCelebrations(onNew, (err) => console.error('subscribeCelebrations', err))
    return unsub
  }, [])

  if (!toast) return null

  return (
    <div className="celebration-toast pointer-events-none fixed inset-x-0 top-6 z-[200] flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-3 rounded-xl px-5 py-3.5 shadow-2xl"
        style={{ backgroundColor: '#1E293B', border: '1px solid #2563EB', maxWidth: '92vw' }}
      >
        <span className="text-2xl" aria-hidden="true">🎉</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Novo cliente fechado!</p>
          <p className="truncate text-xs text-slate-300">
            {toast.closedBy} fechou {toast.clientName}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setToast(null)}
          className="ml-1 shrink-0 rounded-lg bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
        >
          OK
        </button>
      </div>
    </div>
  )
}

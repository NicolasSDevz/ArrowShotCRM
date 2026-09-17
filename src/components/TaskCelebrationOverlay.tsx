import { useEffect, useRef, useState } from 'react'
import { fireTaskCompletionCelebration } from '../utils/celebration'
import { TASK_CELEBRATION_EVENT } from '../utils/taskCelebration'

/** Overlay global (montado no AppLayout) — escuta o evento disparado quando
 *  uma tarefa/checklist de questionário é concluída (ver utils/taskCelebration
 *  e TAREFA 2): confetes + mensagem motivadora centralizada por 5s. */
export function TaskCelebrationOverlay() {
  const [message, setMessage] = useState<string | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const onCelebrate = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail
      fireTaskCompletionCelebration()
      setMessage(detail.message)
      clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setMessage(null), 5000)
    }

    window.addEventListener(TASK_CELEBRATION_EVENT, onCelebrate)
    return () => {
      window.removeEventListener(TASK_CELEBRATION_EVENT, onCelebrate)
      clearTimeout(hideTimer.current)
    }
  }, [])

  if (!message) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto rounded-2xl px-7 py-5 text-center shadow-2xl"
        style={{ backgroundColor: '#1E293B', border: '1px solid #2563EB', maxWidth: '92vw' }}
      >
        <p className="text-lg font-bold text-white">{message}</p>
      </div>
    </div>
  )
}

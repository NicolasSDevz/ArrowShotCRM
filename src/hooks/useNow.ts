import { useEffect, useState } from 'react'

/** Hora atual que se atualiza sozinha a cada `everyMs` — pra textos como
 *  "visto há 5 min" e o status online/offline se corrigirem sem recarregar. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return now
}

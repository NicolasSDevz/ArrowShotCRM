import { useEffect } from 'react'

/** Script principal desta página (ex: /assets/index-AbC123.js). Muda a cada deploy. */
function currentBundle(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')
  return el ? new URL(el.src, location.origin).pathname : null
}

/** App instalado na tela de início (Quiver): o iPhone mantém a versão antiga
 *  aberta por dias e nunca recarrega sozinho — antes era preciso remover e
 *  adicionar de novo. Toda vez que a pessoa volta pro app (e a cada 15 min
 *  com ele aberto), confere se saiu um deploy novo e recarrega. */
export function useAppAutoUpdate(enabled = true) {
  useEffect(() => {
    if (!enabled || import.meta.env.DEV) return
    const mine = currentBundle()
    if (!mine) return
    let checking = false

    const check = async () => {
      if (checking || document.visibilityState !== 'visible') return
      checking = true
      try {
        const res = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' })
        const html = await res.text()
        const latest = html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+\.js)"/)?.[1]
        if (latest && new URL(latest, location.origin).pathname !== mine) location.reload()
      } catch {
        /* sem internet: tenta na próxima */
      } finally {
        checking = false
      }
    }

    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    window.addEventListener('pageshow', check)
    const timer = window.setInterval(check, 15 * 60_000)
    void check()
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
      window.removeEventListener('pageshow', check)
      window.clearInterval(timer)
    }
  }, [enabled])
}

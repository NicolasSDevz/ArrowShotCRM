import { useCallback, useEffect, useRef } from 'react'
import { sendCheckoutVisit } from '../../services/storeApi'
import { readUtms } from './checkoutUtils'

/** Etapas do funil do checkout (mesma régua do servidor, api/loja.js). */
export const FUNNEL_STEP = { open: 1, started: 2, filled: 3, clickedPay: 4 } as const

function visitId(slug: string) {
  const key = `cv-${slug}`
  try {
    const saved = sessionStorage.getItem(key)
    if (saved && /^v_[A-Za-z0-9]{10,40}$/.test(saved)) return saved
  } catch {}
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 62]).join('')
  const sid = `v_${Date.now().toString(36)}${rand}`
  try {
    sessionStorage.setItem(key, sid)
  } catch {}
  return sid
}

/** Funil do checkout: registra até onde a pessoa chegou (Loja > Funil).
 *  Uma visita por aba (recarregar a página não conta de novo). Não roda na pré-visualização. */
export function useCheckoutFunnel(slug: string, enabled: boolean, mobile: boolean) {
  const sid = useRef('')
  const step = useRef(0)
  const lastField = useRef<string | null>(null)
  const shownMs = useRef(0)
  const shownAt = useRef<number | null>(null)

  const send = useCallback(
    (body: Record<string, unknown>) => {
      if (!enabled || !sid.current) return
      sendCheckoutVisit({ sid: sid.current, slug, ...body }).catch(() => {})
    },
    [enabled, slug]
  )

  useEffect(() => {
    if (!enabled) return
    sid.current = visitId(slug)
    step.current = FUNNEL_STEP.open
    send({ step: FUNNEL_STEP.open, device: mobile ? 'mobile' : 'desktop', utm: readUtms(), referrer: document.referrer || null })

    // Tempo com a página na tela: vai junto quando a pessoa sai ou troca de aba.
    const seconds = () => Math.round((shownMs.current + (shownAt.current ? Date.now() - shownAt.current : 0)) / 1000)
    shownAt.current = document.visibilityState === 'visible' ? Date.now() : null
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        shownAt.current = Date.now()
        return
      }
      flush()
    }
    const flush = () => {
      if (shownAt.current) shownMs.current += Date.now() - shownAt.current
      shownAt.current = null
      const body = JSON.stringify({ sid: sid.current, slug, seconds: seconds() })
      try {
        navigator.sendBeacon('/api/loja?action=checkout-visit', new Blob([body], { type: 'application/json' }))
      } catch {}
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      // Saiu do checkout sem fechar a aba (ex.: foi pra página de obrigado).
      flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, slug])

  /** Etapa nova (só manda se avançou). */
  const reach = useCallback(
    (to: number, extra: Record<string, unknown> = {}) => {
      if (to <= step.current && !Object.keys(extra).length) return
      step.current = Math.max(step.current, to)
      send({ step: step.current, ...extra })
    },
    [send]
  )

  /** A pessoa mexeu num campo (data-funnel="nome", "email"...). */
  const touch = useCallback(
    (field: string) => {
      if (field === lastField.current) return
      lastField.current = field
      step.current = Math.max(step.current, FUNNEL_STEP.started)
      send({ step: step.current, field })
    },
    [send]
  )

  return { reach, touch, sid }
}

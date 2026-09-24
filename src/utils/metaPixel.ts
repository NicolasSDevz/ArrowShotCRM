/** Aceita só o número do pixel ou o código inteiro que o Meta entrega
 *  (`fbq('init', '1612198150248366')`) e devolve só o id. null = não achou. */
export function parseMetaPixelId(input?: string | null): string | null {
  const raw = input?.trim()
  if (!raw) return null
  if (/^\d{8,20}$/.test(raw)) return raw
  const fromInit = raw.match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{8,20})['"]/)
  if (fromInit) return fromInit[1]
  const fromNoscript = raw.match(/facebook\.com\/tr\?id=(\d{8,20})/)
  return fromNoscript ? fromNoscript[1] : null
}

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[]; loaded: boolean; version: string; push: unknown }

declare global {
  interface Window {
    fbq?: Fbq
    _fbq?: Fbq
  }
}

/** Mesmo código oficial do Meta Pixel (carrega fbevents.js, init + PageView),
 *  sem precisar colar <script> na página. Chamar de novo com o mesmo id não
 *  duplica nada. */
export function loadMetaPixel(pixelId: string) {
  if (typeof window === 'undefined') return
  if (!window.fbq) {
    const n = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args)
      else n.queue.push(args)
    } as Fbq
    n.push = n
    n.loaded = true
    n.version = '2.0'
    n.queue = []
    window.fbq = n
    if (!window._fbq) window._fbq = n
    const script = document.createElement('script')
    script.async = true
    script.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.appendChild(script)
  }
  const loaded = ((window as unknown as { __pixels?: Set<string> }).__pixels ??= new Set<string>())
  if (loaded.has(pixelId)) return
  loaded.add(pixelId)
  window.fbq('init', pixelId)
  window.fbq('track', 'PageView')
}

/** Evento padrão do Meta (ex: 'Lead' quando o formulário é enviado). */
export function trackMetaPixel(event: string, params?: Record<string, unknown>) {
  window.fbq?.('track', event, params)
}

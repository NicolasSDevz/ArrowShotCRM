import { useEffect, useState } from 'react'

/** Carrega uma fonte do Google Fonts uma vez só. */
export function useGoogleFont(font?: string | null) {
  useEffect(() => {
    if (!font || font === 'Inter') return
    const id = `gf-${font.replace(/\s+/g, '-')}`
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;600;700;800&display=swap`
    document.head.appendChild(link)
  }, [font])
}

/** Contagem regressiva que não reinicia ao recarregar a página (fica na sessão). */
export function useCountdown(storageKey: string, minutes: number | null) {
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    if (!minutes) return
    let end: number
    try {
      const saved = Number(sessionStorage.getItem(storageKey))
      end = saved > Date.now() ? saved : Date.now() + minutes * 60_000
      sessionStorage.setItem(storageKey, String(end))
    } catch {
      end = Date.now() + minutes * 60_000
    }
    const tick = () => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000)))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [storageKey, minutes])
  return left
}

export function formatClock(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

declare global {
  interface Window {
    // SDK do Mercado Pago (https://sdk.mercadopago.com/js/v2)
    MercadoPago?: new (publicKey: string, opts?: { locale?: string }) => MercadoPagoInstance
  }
}

export interface CardBrickFormData {
  token: string
  issuer_id?: string
  payment_method_id: string
  transaction_amount: number
  installments: number
  payer?: { email?: string; identification?: { type: string; number: string } }
}

interface BrickController {
  unmount: () => void
}

interface MercadoPagoInstance {
  bricks: () => {
    create: (kind: 'cardPayment', containerId: string, settings: unknown) => Promise<BrickController>
  }
}

let sdkPromise: Promise<void> | null = null

export function loadMercadoPagoSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve()
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://sdk.mercadopago.com/js/v2'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      sdkPromise = null
      reject(new Error('Não foi possível carregar o pagamento com cartão'))
    }
    document.head.appendChild(s)
  })
  return sdkPromise
}

export async function mountCardBrick(opts: {
  publicKey: string
  containerId: string
  amountCents: number
  maxInstallments: number
  color: string
  email?: string
  onSubmit: (data: CardBrickFormData) => Promise<void>
  onError?: (message: string) => void
}): Promise<BrickController> {
  await loadMercadoPagoSdk()
  const mp = new window.MercadoPago!(opts.publicKey, { locale: 'pt-BR' })
  return mp.bricks().create('cardPayment', opts.containerId, {
    initialization: { amount: opts.amountCents / 100, payer: opts.email ? { email: opts.email } : undefined },
    customization: {
      paymentMethods: { maxInstallments: opts.maxInstallments },
      visual: { style: { customVariables: { baseColor: opts.color } }, texts: { formSubmit: 'Pagar agora' } },
    },
    callbacks: {
      onReady: () => {},
      onSubmit: (data: CardBrickFormData) => opts.onSubmit(data),
      onError: (err: { message?: string }) => opts.onError?.(err?.message || 'Erro no formulário do cartão'),
    },
  })
}

/** Mensagens claras para os motivos de recusa mais comuns do Mercado Pago. */
export function refusalMessage(detail?: string | null) {
  switch (detail) {
    case 'cc_rejected_insufficient_amount':
      return 'Cartão sem limite suficiente. Tente outro cartão ou pague com Pix.'
    case 'cc_rejected_bad_filled_security_code':
      return 'Código de segurança (CVV) incorreto.'
    case 'cc_rejected_bad_filled_date':
      return 'Data de validade incorreta.'
    case 'cc_rejected_bad_filled_card_number':
    case 'cc_rejected_bad_filled_other':
      return 'Confira os dados do cartão.'
    case 'cc_rejected_call_for_authorize':
      return 'O banco pediu autorização. Ligue para o seu banco e tente de novo.'
    case 'cc_rejected_high_risk':
      return 'Pagamento recusado por segurança. Tente outro cartão ou pague com Pix.'
    case 'cc_rejected_duplicated_payment':
      return 'Você já fez um pagamento com esse valor. Confira seu e-mail.'
    default:
      return 'Pagamento recusado. Tente outro cartão ou pague com Pix.'
  }
}

/** Cookies do Pixel (_fbp/_fbc) e a página, pra API de Conversões casar o comprador. */
export function readTracking() {
  const cookie = (name: string) => document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))?.split('=')[1] || null
  return { fbp: cookie('_fbp'), fbc: cookie('_fbc'), fbclid: new URLSearchParams(window.location.search).get('fbclid'), url: window.location.href.split('?')[0] }
}

export function readUtms(): Record<string, string> {
  const out: Record<string, string> = {}
  const params = new URLSearchParams(window.location.search)
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'fbclid']) {
    const v = params.get(k)
    if (v) out[k] = v
  }
  return out
}

/** true quando a tela é de celular/tablet em pé (abaixo de 1024 px). */
export function useIsNarrow() {
  const query = '(max-width: 1023px)'
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

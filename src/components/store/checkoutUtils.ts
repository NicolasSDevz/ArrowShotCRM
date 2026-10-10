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

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'fbclid']
const ATTRIBUTION_KEY = 'ck-attribution'
const ATTRIBUTION_TTL_MS = 7 * 86400_000

interface Attribution {
  at: number
  fbclidAt?: number
  fbp?: string
  fbc?: string
  utm: Record<string, string>
}

/** Guarda o que veio no link do anúncio (UTMs, fbclid e os cookies do Pixel que a
 *  página de vendas repassa como ?fbp=&fbc=). Sem isso, recarregar a página ou
 *  voltar depois perde a origem da venda e o Meta não liga a compra ao anúncio. */
export function captureAttribution() {
  const params = new URLSearchParams(window.location.search)
  let saved: Attribution | null = null
  try {
    saved = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || 'null')
    if (saved && Date.now() - saved.at > ATTRIBUTION_TTL_MS) saved = null
  } catch {
    saved = null
  }
  const utm: Record<string, string> = {}
  for (const k of UTM_KEYS) {
    const v = params.get(k)
    if (v) utm[k] = v
  }
  const fresh = Object.keys(utm).length > 0 || params.get('fbp') || params.get('fbc')
  if (!fresh) return saved
  const next: Attribution = {
    at: Date.now(),
    // Mesmo fbclid de antes = mesmo clique: mantém a hora original.
    fbclidAt: utm.fbclid ? (saved?.utm.fbclid === utm.fbclid && saved.fbclidAt ? saved.fbclidAt : Date.now()) : saved?.fbclidAt,
    fbp: params.get('fbp') || saved?.fbp,
    fbc: params.get('fbc') || (utm.fbclid ? undefined : saved?.fbc),
    utm: Object.keys(utm).length ? utm : saved?.utm || {},
  }
  try {
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(next))
  } catch {
    /* sem storage: segue só com a URL */
  }
  return next
}

/** Cookies do Pixel (_fbp/_fbc) e a página, pra API de Conversões casar o comprador. */
export function readTracking() {
  const cookie = (name: string) => document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))?.split('=')[1] || null
  const a = captureAttribution()
  const fbclid = a?.utm.fbclid || null
  // Cookie de clique daqui só vale se for do mesmo fbclid; senão o repassado pela página de vendas.
  const fbcCookie = cookie('_fbc')
  const fbc = fbcCookie && (!fbclid || fbcCookie.endsWith(fbclid)) ? fbcCookie : a?.fbc || null
  return { fbp: a?.fbp || cookie('_fbp'), fbc, fbclid, fbclidAt: a?.fbclidAt ?? null, url: window.location.href.split('?')[0] }
}

export function readUtms(): Record<string, string> {
  return captureAttribution()?.utm ?? {}
}

/** Erros de digitação comuns no domínio do e-mail. Devolve a sugestão ou null. */
export function emailTypoSuggestion(email: string): string | null {
  const m = /^([^\s@]+)@([^\s@]+)$/.exec(email.trim().toLowerCase())
  if (!m) return null
  const fixes: Record<string, string> = {
    'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
    'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'gmail.com.br': 'gmail.com', 'gmaill.com': 'gmail.com',
    'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmil.com': 'hotmail.com', 'homail.com': 'hotmail.com',
    'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'outlook.con': 'outlook.com', 'otlook.com': 'outlook.com',
    'yahoo.com.b': 'yahoo.com.br', 'yaho.com.br': 'yahoo.com.br', 'yahoo.co': 'yahoo.com', 'yahoo.con': 'yahoo.com',
    'icloud.co': 'icloud.com', 'icloud.con': 'icloud.com', 'iclod.com': 'icloud.com', 'icoud.com': 'icloud.com',
    'uol.com': 'uol.com.br', 'bol.com': 'bol.com.br',
  }
  const fix = fixes[m[2]]
  return fix ? `${m[1]}@${fix}` : null
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

function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((ch) => ch + ch).join('') : m[1]
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Contraste entre duas cores (1 a 21). null = cor inválida. */
export function contrastRatio(a: string, b: string) {
  const la = luminance(a)
  const lb = luminance(b)
  if (la === null || lb === null) return null
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Cor do texto legível sobre o fundo: mantém a escolhida se der pra ler, senão escuro/claro automático. */
export function readableOn(text: string, bg: string, min = 3) {
  const ratio = contrastRatio(text, bg)
  if (ratio === null || ratio >= min) return text
  return (luminance(bg) ?? 1) > 0.4 ? '#0f172a' : '#f8fafc'
}

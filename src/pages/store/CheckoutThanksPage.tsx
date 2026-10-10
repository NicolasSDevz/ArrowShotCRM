import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Copy, Clock, MessageCircle, XCircle } from 'lucide-react'
import QRCode from 'qrcode'
import { fetchCheckout, fetchOrderStatus, type OrderStatus, type PublicCheckout } from '../../services/storeApi'
import { loadMetaPixel, trackMetaPixel } from '../../utils/metaPixel'
import { formatCents } from '../../types/store'
import { Spinner } from '../../components/ui/FullPageSpinner'
import { refusalMessage } from '../../components/store/checkoutUtils'

/** /pay/:slug/obrigado?order=&key= — mostra o Pix (QR + copia e cola) enquanto
 *  o pagamento não cai, confere sozinho a cada 5 s e, aprovado, entrega o link
 *  da área de membros. */
export function CheckoutThanksPage() {
  const { slug = '' } = useParams()
  const [params] = useSearchParams()
  const orderId = params.get('order') || ''
  const key = params.get('key') || ''
  const [order, setOrder] = useState<OrderStatus | null>(null)
  const [product, setProduct] = useState<PublicCheckout | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const tracked = useRef(false)
  const [qrImage, setQrImage] = useState<string | null>(null)

  // Pix direto na conta vem só com o copia e cola: o QR é desenhado aqui.
  const pixText = order?.pix && !order.pix.qrBase64 ? order.pix.qrCode : null
  useEffect(() => {
    if (!pixText) return
    QRCode.toDataURL(pixText, { width: 448, margin: 1 }).then(setQrImage).catch(() => setQrImage(null))
  }, [pixText])

  useEffect(() => {
    fetchCheckout(slug)
      .then((p) => {
        setProduct(p)
        if (p.checkout.fbPixelId) loadMetaPixel(p.checkout.fbPixelId)
      })
      .catch(() => {})
  }, [slug])

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const started = Date.now()
    let waitingAccess = 0
    const poll = async () => {
      try {
        const o = await fetchOrderStatus(orderId, key)
        if (stop) return
        setOrder(o)
        // 5 s nos primeiros 10 min; depois a cada 30 s (Pix confirmado à mão pode demorar).
        if (o.status === 'pending') timer = setTimeout(poll, Date.now() - started < 600_000 ? 5000 : 30_000)
        // Aprovado mas o acesso ainda está sendo gerado (outra conferência chegou junto): busca de novo.
        else if (o.status === 'approved' && !o.accessUrl && waitingAccess++ < 10) timer = setTimeout(poll, 3000)
      } catch (err) {
        if (!stop) setError((err as Error).message)
      }
    }
    poll()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [orderId, key])

  // Purchase no Pixel uma vez só por pedido. Só nas primeiras 24 h depois da aprovação:
  // o Meta junta navegador + servidor (mesmo event_id) só dentro de 48 h, então
  // reabrir esta página dias depois (ou em outro aparelho) contaria a venda de novo.
  useEffect(() => {
    if (!order || order.status !== 'approved' || !product?.checkout.fbPixelId || tracked.current) return
    if (!(order.amount > 0)) return
    if (order.approvedAt && Date.now() - new Date(order.approvedAt).getTime() > 24 * 3600_000) return
    const flag = `px-purchase-${order.orderId}`
    try {
      if (localStorage.getItem(flag)) return
      localStorage.setItem(flag, '1')
    } catch {
      /* segue */
    }
    tracked.current = true
    trackMetaPixel('Purchase', { value: order.amount / 100, currency: 'BRL', content_name: order.items.map((i) => i.name).join(' + ') }, `purchase-${order.orderId}`)
  }, [order, product])

  // Página de obrigado própria (configurada no produto). Só leva embora sozinho se o
  // acesso também foi por e-mail: senão o botão daqui é o único jeito de entrar.
  const thankYouUrl = order?.status === 'approved' ? product?.checkout.thankYouUrl || null : null
  useEffect(() => {
    if (order?.status === 'approved' && order.emailSent && order.accessUrl && product?.checkout.thankYouUrl) {
      const t = setTimeout(() => window.location.assign(product.checkout.thankYouUrl!), 4000)
      return () => clearTimeout(t)
    }
  }, [order, product])

  const color = product?.checkout.primaryColor || '#2563eb'

  const copyPix = async () => {
    if (!order?.pix?.qrCode) return
    try {
      await navigator.clipboard.writeText(order.pix.qrCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      /* o campo de texto fica visível pra copiar na mão */
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-slate-100 px-4 py-10" style={{ colorScheme: 'light' }}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-center shadow-sm">
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {!order && !error && <Spinner className="mx-auto h-6 w-6" />}

        {order?.status === 'pending' && order.pix && (
          <section aria-live="polite">
            <Clock className="mx-auto mb-2" size={36} style={{ color }} aria-hidden="true" />
            <h1 className="text-xl font-bold text-slate-900">Falta pouco! Pague o Pix</h1>
            <p className="mt-1 text-sm text-slate-500">Valor: <strong>{formatCents(order.amount)}</strong>. Abra o app do banco e escaneie o QR Code ou use o copia e cola.</p>
            {order.pix.qrBase64 && <img src={`data:image/png;base64,${order.pix.qrBase64}`} alt="QR Code do Pix" className="mx-auto my-4 h-56 w-56" />}
            {!order.pix.qrBase64 && qrImage && <img src={qrImage} alt="QR Code do Pix" className="mx-auto my-4 h-56 w-56" />}
            {order.pix.qrCode && (
              <>
                <label className="block text-left text-xs text-slate-500">
                  Pix copia e cola
                  <textarea readOnly value={order.pix.qrCode} rows={3} className="mt-1 w-full resize-none rounded-lg border border-slate-200 p-2 text-xs text-slate-700" onFocus={(e) => e.currentTarget.select()} />
                </label>
                <button onClick={copyPix} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold text-white" style={{ background: color }}>
                  <Copy size={18} /> {copied ? 'Código copiado!' : 'Copiar código Pix'}
                </button>
              </>
            )}
            {order.manualPix ? (
              <>
                <p className="mt-4 text-sm text-slate-600">
                  Depois de pagar, a nossa equipe confirma o recebimento e o botão de acesso aparece aqui mesmo. Deixe esta página aberta ou salve o link dela nos favoritos.
                </p>
                {order.pix.whatsapp && (
                  <a
                    href={`https://wa.me/${order.pix.whatsapp.startsWith('55') ? order.pix.whatsapp : `55${order.pix.whatsapp}`}?text=${encodeURIComponent(`Olá! Fiz o Pix do pedido ${order.orderId} (${formatCents(order.amount)}) no nome de ${order.buyerName}. Segue o comprovante.`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-500 font-semibold text-emerald-700 hover:bg-emerald-50"
                  >
                    <MessageCircle size={18} aria-hidden="true" /> Enviar comprovante no WhatsApp (libera mais rápido)
                  </a>
                )}
                <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-400"><Spinner className="h-3 w-3" /> Esta página atualiza sozinha.</div>
              </>
            ) : (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500"><Spinner className="h-3.5 w-3.5" /> Aguardando o pagamento. Esta página atualiza sozinha.</div>
            )}
          </section>
        )}

        {order?.status === 'pending' && !order.pix && (
          <section aria-live="polite">
            <Clock className="mx-auto mb-2" size={36} style={{ color }} aria-hidden="true" />
            <h1 className="text-xl font-bold text-slate-900">Pagamento em análise</h1>
            <p className="mt-1 text-sm text-slate-500">O Mercado Pago está conferindo o pagamento. Assim que aprovar, o acesso aparece aqui e no seu e-mail.</p>
          </section>
        )}

        {order?.status === 'approved' && (
          <section aria-live="polite">
            <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={44} aria-hidden="true" />
            <h1 className="text-xl font-bold text-slate-900">Compra aprovada!</h1>
            <p className="mt-1 text-sm text-slate-500">
              {order.buyerName.split(' ')[0]}, seu acesso está liberado
              {order.emailSent ? ` e também foi enviado para ${order.buyerEmail}` : ''}.
            </p>
            <ul className="mt-4 space-y-1 text-left text-sm text-slate-700">
              {order.items.map((i) => <li key={i.name} className="flex justify-between border-b border-slate-100 py-1.5"><span>{i.name}</span><span>{formatCents(i.price)}</span></li>)}
            </ul>
            {order.accessUrl && (
              <a href={order.accessUrl} className="mt-5 flex h-12 w-full items-center justify-center rounded-xl font-semibold text-white" style={{ background: color }}>
                Acessar a área de membros
              </a>
            )}
            {order.status === 'approved' && !order.accessUrl && (
              <p className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500"><Spinner className="h-3.5 w-3.5" /> Preparando seu acesso...</p>
            )}
            <p className="mt-3 text-xs text-slate-400">Salve esta página nos favoritos: o botão acima é o seu acesso. Lá dentro você pode criar uma senha.</p>
            {thankYouUrl && !order.emailSent && (
              <a href={thankYouUrl} className="mt-4 inline-block text-sm font-medium underline" style={{ color }}>
                Já guardei meu acesso, continuar
              </a>
            )}
          </section>
        )}

        {(order?.status === 'refused' || order?.status === 'refunded') && (
          <section aria-live="polite">
            <XCircle className="mx-auto mb-2 text-red-500" size={40} aria-hidden="true" />
            <h1 className="text-xl font-bold text-slate-900">{order.status === 'refunded' ? 'Pedido reembolsado' : 'Pagamento não aprovado'}</h1>
            {order.status === 'refused' && <p className="mt-1 text-sm text-slate-500">{order.method === 'pix' ? 'O Pix expirou. Faça um novo pedido.' : refusalMessage(order.statusDetail)}</p>}
            <a href={`/pay/${slug}`} className="mt-5 inline-flex h-11 items-center justify-center rounded-xl px-6 font-semibold text-white" style={{ background: color }}>Tentar de novo</a>
          </section>
        )}
      </div>
    </main>
  )
}

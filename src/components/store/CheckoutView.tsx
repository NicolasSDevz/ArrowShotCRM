import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, CreditCard, Lock, QrCode, ShieldCheck, Star, Ticket } from 'lucide-react'
import { checkCoupon, createOrder, type PublicCheckout } from '../../services/storeApi'
import { maskDocument, maskPhone } from '../../utils/masks'
import { trackMetaPixel } from '../../utils/metaPixel'
import { formatCents } from '../../types/store'
import { formatClock, mountCardBrick, readUtms, refusalMessage, useCountdown, useGoogleFont, type CardBrickFormData } from './checkoutUtils'

type Method = 'pix' | 'card' | 'test'

/** Página de pagamento. Usada no link público (/pay/:slug) e na pré-visualização
 *  da "Configuração de tela" dentro do CRM (preview = não cobra nada). */
export function CheckoutView({ data, preview = false, device = 'desktop' }: { data: PublicCheckout; preview?: boolean; device?: 'desktop' | 'mobile' }) {
  const navigate = useNavigate()
  const c = data.checkout
  const uid = useId().replace(/:/g, '')
  const brickId = `card-brick-${uid}`
  useGoogleFont(c.font)
  const secondsLeft = useCountdown(`cd-${data.slug}`, c.countdown?.minutes ?? null)

  const methods: Method[] = useMemo(() => {
    if (data.gateway.testMode) return ['test']
    const list: Method[] = []
    if (data.paymentMethods.pix) list.push('pix')
    if (data.paymentMethods.card) list.push('card')
    return list
  }, [data])

  const [method, setMethod] = useState<Method>(methods[0] ?? 'pix')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [email2, setEmail2] = useState('')
  const [phone, setPhone] = useState('')
  const [cpf, setCpf] = useState('')
  const [bumps, setBumps] = useState<string[]>([])
  const [couponOpen, setCouponOpen] = useState(false)
  const [couponInput, setCouponInput] = useState('')
  const [coupon, setCoupon] = useState<{ code: string; percent: number } | null>(null)
  const [couponMsg, setCouponMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const mainPrice = coupon ? Math.round(data.price * (1 - coupon.percent / 100)) : data.price
  const bumpTotal = data.bumps.filter((b) => bumps.includes(b.productId)).reduce((s, b) => s + b.price, 0)
  const total = mainPrice + bumpTotal

  useEffect(() => {
    if (!preview && c.fbPixelId) trackMetaPixel('InitiateCheckout', { value: data.price / 100, currency: 'BRL', content_name: data.name })
  }, [preview, c.fbPixelId, data.price, data.name])

  const validate = (): string | null => {
    if (name.trim().split(/\s+/).length < 2) return 'Informe seu nome completo.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return 'Informe um e-mail válido.'
    if (c.confirmEmail && email.trim().toLowerCase() !== email2.trim().toLowerCase()) return 'Os e-mails não são iguais.'
    if (c.askPhone && phone.replace(/\D/g, '').length < 10) return 'Informe seu celular com DDD.'
    const doc = cpf.replace(/\D/g, '')
    if (c.askCpf && doc.length !== 11 && doc.length !== 14) return 'Informe um CPF ou CNPJ válido.'
    return null
  }

  const basePayload = () => ({
    slug: data.slug,
    bumpIds: bumps,
    coupon: coupon?.code ?? null,
    buyer: { name, email, phone, cpf },
    utm: readUtms(),
  })

  const goToThanks = (orderId: string, key: string) => {
    navigate(`/pay/${data.slug}/obrigado?order=${orderId}&key=${key}`)
  }

  // Cartão: o Brick do Mercado Pago desenha o formulário e gera o token.
  const submitCardRef = useRef<(d: CardBrickFormData) => Promise<void>>(async () => {})
  const submitCard = async (d: CardBrickFormData) => {
    const problem = validate()
    if (problem) {
      setError(problem)
      formRef.current?.querySelector<HTMLInputElement>('input')?.focus()
      throw new Error(problem)
    }
    setError('')
    if (c.fbPixelId) trackMetaPixel('AddPaymentInfo', { value: total / 100, currency: 'BRL' })
    const result = await createOrder({
      ...basePayload(),
      method: 'card',
      card: { token: d.token, installments: d.installments, paymentMethodId: d.payment_method_id, issuerId: d.issuer_id, identification: d.payer?.identification },
    }).catch((err: Error) => {
      setError(err.message)
      throw err
    })
    if (result.status === 'refused') {
      setError(refusalMessage(result.statusDetail))
      throw new Error('recusado')
    }
    goToThanks(result.orderId, result.key)
  }
  useEffect(() => {
    submitCardRef.current = submitCard
  })

  useEffect(() => {
    if (preview || method !== 'card' || !data.gateway.publicKey) return
    let controller: { unmount: () => void } | null = null
    let cancelled = false
    mountCardBrick({
      publicKey: data.gateway.publicKey,
      containerId: brickId,
      amountCents: total,
      maxInstallments: data.maxInstallments,
      color: c.primaryColor,
      onSubmit: (d) => submitCardRef.current(d),
      onError: (m) => setError(m),
    })
      .then((ctrl) => {
        if (cancelled) ctrl.unmount()
        else controller = ctrl
      })
      .catch((err: Error) => setError(err.message))
    return () => {
      cancelled = true
      controller?.unmount()
    }
  }, [preview, method, total, data.gateway.publicKey, data.maxInstallments, c.primaryColor, brickId])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (preview) return
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    setBusy(true)
    try {
      if (c.fbPixelId) trackMetaPixel('AddPaymentInfo', { value: total / 100, currency: 'BRL' })
      const result = await createOrder({ ...basePayload(), method })
      goToThanks(result.orderId, result.key)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const applyCoupon = async () => {
    if (preview || !couponInput.trim()) return
    setCouponMsg('')
    try {
      const r = await checkCoupon(data.slug, couponInput)
      setCoupon(r)
      setCouponMsg(`Cupom ${r.code} aplicado: ${r.percent}% de desconto.`)
    } catch (err) {
      setCoupon(null)
      setCouponMsg((err as Error).message)
    }
  }

  const mobile = device === 'mobile'
  const color = c.primaryColor
  const inputCls = 'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] text-slate-900 outline-none focus:border-[var(--ck)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ck)_25%,transparent)]'

  return (
    <div
      className="min-h-full"
      style={{ background: c.backgroundColor, fontFamily: `'${c.font}', Inter, system-ui, sans-serif`, ['--ck' as string]: color, colorScheme: 'light' }}
    >
      {c.countdown && secondsLeft !== null && (
        <div className="sticky top-0 z-10 px-4 py-2.5 text-center text-white" style={{ background: c.countdown.color }} role="timer" aria-label={`${c.countdown.text}: ${formatClock(secondsLeft)}`}>
          <span className="text-2xl font-bold tabular-nums">{formatClock(secondsLeft)}</span>
          <span className="ml-3 text-sm font-medium">{secondsLeft > 0 ? c.countdown.text : 'O tempo acabou!'}</span>
        </div>
      )}

      <div className={`mx-auto px-4 py-6 ${mobile ? 'max-w-md' : 'max-w-5xl'}`}>
        {c.headerImageUrl && <img src={c.headerImageUrl} alt="" className="mb-5 w-full rounded-xl object-cover" />}

        <div className={`grid gap-6 ${mobile ? '' : 'lg:grid-cols-[1fr_340px]'}`}>
          <form ref={formRef} onSubmit={onSubmit} className="space-y-5" noValidate>
            {/* Cabeçalho do produto */}
            <section className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm">
              {data.imageUrl && <img src={data.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight text-slate-900">{c.headline || data.name}</h1>
                {c.subheadline && <p className="mt-1 text-sm text-slate-500">{c.subheadline}</p>}
                <p className="mt-2 text-lg font-bold" style={{ color }}>
                  {data.comparePrice && data.comparePrice > data.price && (
                    <span className="mr-2 text-sm font-normal text-slate-400 line-through">{formatCents(data.comparePrice)}</span>
                  )}
                  {formatCents(data.price)}
                  {data.maxInstallments > 1 && data.paymentMethods.card && <span className="ml-1 text-sm font-normal text-slate-500">à vista ou em até {data.maxInstallments}x no cartão</span>}
                </p>
              </div>
            </section>

            {/* Dados */}
            <section className="space-y-3 rounded-xl bg-white p-5 shadow-sm" aria-labelledby={`${uid}-dados`}>
              <h2 id={`${uid}-dados`} className="text-base font-semibold text-slate-900">Seus dados</h2>
              <label className="block">
                <span className="mb-1 block text-sm text-slate-600">Nome completo</span>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-slate-600">E-mail (é por ele que você vai acessar)</span>
                <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </label>
              {c.confirmEmail && (
                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">Confirme o e-mail</span>
                  <input className={inputCls} type="email" value={email2} onChange={(e) => setEmail2(e.target.value)} required />
                </label>
              )}
              <div className={`grid gap-3 ${mobile ? '' : 'sm:grid-cols-2'}`}>
                {c.askCpf && (
                  <label className="block">
                    <span className="mb-1 block text-sm text-slate-600">CPF ou CNPJ</span>
                    <input className={inputCls} inputMode="numeric" value={cpf} onChange={(e) => setCpf(maskDocument(e.target.value))} required />
                  </label>
                )}
                {c.askPhone && (
                  <label className="block">
                    <span className="mb-1 block text-sm text-slate-600">Celular com DDD</span>
                    <input className={inputCls} inputMode="tel" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} autoComplete="tel" required />
                  </label>
                )}
              </div>
            </section>

            {/* Pagamento */}
            <section className="space-y-4 rounded-xl bg-white p-5 shadow-sm" aria-labelledby={`${uid}-pag`}>
              <h2 id={`${uid}-pag`} className="text-base font-semibold text-slate-900">Pagamento</h2>
              {methods.length === 0 ? (
                <p className="text-sm text-amber-700">Nenhuma forma de pagamento disponível. Fale com o vendedor.</p>
              ) : (
                <div role="radiogroup" aria-label="Forma de pagamento" className="flex flex-wrap gap-2">
                  {methods.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={method === m}
                      onClick={() => setMethod(m)}
                      className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-medium ${method === m ? 'text-slate-900' : 'border-slate-200 text-slate-500'}`}
                      style={method === m ? { borderColor: color } : undefined}
                    >
                      {m === 'pix' ? <QrCode size={18} /> : m === 'card' ? <CreditCard size={18} /> : <Check size={18} />}
                      {m === 'pix' ? 'Pix' : m === 'card' ? 'Cartão de crédito' : 'Modo teste'}
                    </button>
                  ))}
                </div>
              )}

              {method === 'pix' && (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  Ao finalizar, aparece o QR Code e o código copia e cola. A liberação é imediata depois do pagamento.
                </p>
              )}
              {method === 'test' && (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  Modo teste: o Mercado Pago ainda não foi configurado. A compra é liberada sem cobrança, só para conferir o fluxo.
                </p>
              )}
              {method === 'card' && (preview ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  Aqui aparece o formulário seguro do cartão (Mercado Pago), com parcelamento em até {data.maxInstallments}x.
                </div>
              ) : (
                <div id={brickId} />
              ))}

              {/* Order bumps */}
              {data.bumps.map((b) => {
                const on = bumps.includes(b.productId)
                return (
                  <label key={b.productId} className="block cursor-pointer rounded-xl border-2 border-dashed p-4" style={{ borderColor: on ? color : '#cbd5e1', background: on ? `color-mix(in srgb, ${color} 6%, white)` : '#fff' }}>
                    <p className="text-sm font-bold uppercase tracking-wide" style={{ color }}>{b.headline}</p>
                    <div className="mt-2 flex gap-3">
                      {b.imageUrl && <img src={b.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
                      <div className="min-w-0 text-sm text-slate-600">
                        <p className="font-semibold text-slate-900">{b.name}</p>
                        {b.description && <p className="mt-0.5">{b.description}</p>}
                        <p className="mt-1 font-semibold text-slate-900">
                          {b.fullPrice > b.price && <span className="mr-2 font-normal text-slate-400 line-through">{formatCents(b.fullPrice)}</span>}
                          {formatCents(b.price)}
                        </p>
                      </div>
                    </div>
                    <span className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setBumps((prev) => (on ? prev.filter((x) => x !== b.productId) : [...prev, b.productId]))}
                        className="h-5 w-5"
                        style={{ accentColor: color }}
                      />
                      {b.cta}
                    </span>
                  </label>
                )
              })}

              {/* Cupom */}
              <div>
                {!couponOpen ? (
                  <button type="button" onClick={() => setCouponOpen(true)} className="flex items-center gap-1.5 text-sm text-slate-500 underline-offset-2 hover:underline">
                    <Ticket size={15} /> Tenho um cupom de desconto
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <input className={`${inputCls} uppercase`} aria-label="Código do cupom" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} placeholder="CUPOM" />
                    <button type="button" onClick={applyCoupon} className="rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Aplicar</button>
                  </div>
                )}
                {couponMsg && <p className="mt-1.5 text-sm text-slate-600" aria-live="polite">{couponMsg}</p>}
              </div>

              {/* Resumo */}
              <div className="space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
                <div className="flex justify-between"><span>{data.name}</span><span>{formatCents(mainPrice)}</span></div>
                {data.bumps.filter((b) => bumps.includes(b.productId)).map((b) => (
                  <div key={b.productId} className="flex justify-between"><span>{b.name}</span><span>{formatCents(b.price)}</span></div>
                ))}
                <div className="flex justify-between pt-1 text-base font-bold text-slate-900"><span>Total</span><span>{formatCents(total)}</span></div>
              </div>

              {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

              {method !== 'card' && methods.length > 0 && (
                <button
                  type="submit"
                  disabled={busy}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-xl text-lg font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-60"
                  style={{ background: color }}
                >
                  <Lock size={18} /> {busy ? 'Processando...' : method === 'pix' ? `${c.buttonText} com Pix` : c.buttonText}
                </button>
              )}
              <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400"><Lock size={12} /> Pagamento seguro processado pelo Mercado Pago</p>
            </section>
          </form>

          {/* Coluna lateral: imagens, benefícios, garantia, depoimentos */}
          <aside className="space-y-4">
            {c.sideImages.map((src, i) => <img key={i} src={src} alt="" className="w-full rounded-xl" />)}
            {c.benefits.length > 0 && (
              <section className="rounded-xl bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-base font-semibold text-slate-900">O que você recebe</h2>
                <ul className="space-y-2 text-sm text-slate-700">
                  {c.benefits.map((b, i) => (
                    <li key={i} className="flex gap-2"><Check size={18} className="shrink-0" style={{ color }} aria-hidden="true" />{b}</li>
                  ))}
                </ul>
              </section>
            )}
            {c.guaranteeDays > 0 && (
              <section className="flex items-center gap-3 rounded-xl bg-white p-5 shadow-sm">
                <ShieldCheck size={40} className="shrink-0" style={{ color }} aria-hidden="true" />
                <div>
                  <h2 className="font-semibold text-slate-900">Garantia de {c.guaranteeDays} dias</h2>
                  <p className="text-sm text-slate-500">Se não gostar, devolvemos 100% do seu dinheiro.</p>
                </div>
              </section>
            )}
            {c.testimonials.map((t, i) => (
              <figure key={i} className="rounded-xl bg-white p-5 shadow-sm">
                <div className="mb-2 flex gap-0.5 text-amber-400" aria-label="5 estrelas">{[0, 1, 2, 3, 4].map((s) => <Star key={s} size={14} fill="currentColor" />)}</div>
                <blockquote className="text-sm text-slate-700">“{t.text}”</blockquote>
                <figcaption className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  {t.photoUrl && <img src={t.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />}
                  {t.name}
                </figcaption>
              </figure>
            ))}
          </aside>
        </div>

        <footer className="mt-8 space-y-1 text-center text-xs text-slate-400">
          {c.footerText && <p>{c.footerText}</p>}
          {data.supportEmail && <p>Dúvidas: {data.supportEmail}</p>}
        </footer>
      </div>
    </div>
  )
}

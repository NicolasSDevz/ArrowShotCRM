import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BadgeCheck, Check, CreditCard, Headphones, Infinity as InfinityIcon, Lock, QrCode, ShieldCheck, Star, Ticket, UserCheck, Zap, type LucideIcon } from 'lucide-react'
import { checkCoupon, createOrder, type PublicCheckout } from '../../services/storeApi'
import { maskDocument, maskPhone } from '../../utils/masks'
import { trackMetaPixel } from '../../utils/metaPixel'
import { checkoutSeals, formatCents, sealCopy, type StoreSealKey } from '../../types/store'

const SEAL_ICONS: Record<StoreSealKey, LucideIcon> = {
  secure: Lock,
  guarantee: ShieldCheck,
  satisfaction: BadgeCheck,
  instant: Zap,
  privacy: UserCheck,
  pix: QrCode,
  support: Headphones,
  lifetime: InfinityIcon,
}
import { formatClock, mountCardBrick, readUtms, refusalMessage, readTracking, useCountdown, useGoogleFont, useIsNarrow, type CardBrickFormData } from './checkoutUtils'

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
  const subtotal = mainPrice + bumpTotal
  const pixPct = data.pixDiscountPercent || 0
  const pixOff = method === 'pix' && pixPct ? Math.round(subtotal * (pixPct / 100)) : 0
  const total = subtotal - pixOff

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
    tracking: readTracking(),
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

  // No link público o dispositivo vem do tamanho da tela; na prévia, do botão Computador/Celular.
  const narrow = useIsNarrow()
  const mobile = preview ? device === 'mobile' : narrow
  const color = c.primaryColor
  const d = c.design ?? {}
  const dk = d.desktop ?? {}
  const mb = d.mobile ?? {}
  const textColor = d.textColor || '#0f172a'
  const radius = d.radius === 'square' ? '4px' : d.radius === 'round' ? '22px' : '12px'
  const cardStyle = { background: d.cardColor || '#ffffff', color: textColor, borderRadius: radius }
  const btnAnim = d.buttonAnimation && d.buttonAnimation !== 'none' ? `lf-anim lf-anim-${d.buttonAnimation}` : ''
  const inputCls = 'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] text-slate-900 outline-none focus:border-[var(--ck)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ck)_25%,transparent)]'
  const labelCls = 'mb-1 block text-sm opacity-75'

  const header = mobile ? (mb.hideHeader ? null : mb.headerImageUrl || c.headerImageUrl) : dk.hideHeader ? null : c.headerImageUrl
  const side = mobile ? 'below' : (dk.side ?? 'right')
  const width = mobile ? 'max-w-md' : dk.width === 'narrow' ? 'max-w-3xl' : dk.width === 'wide' ? 'max-w-6xl' : 'max-w-5xl'
  const cdDevices = c.countdown?.devices ?? 'all'
  const cd = c.countdown && secondsLeft !== null && (cdDevices === 'all' || (cdDevices === 'mobile') === mobile) ? c.countdown : null
  // No celular a lateral fica embaixo de tudo, então o contador usa a posição própria do celular.
  const cdPos = !cd ? 'top' : mobile ? (cd.mobilePosition ?? (cd.position === 'side' ? 'form' : cd.position)) : cd.position
  const sticky = !!(mobile && mb.stickyButton && method !== 'card' && methods.length > 0)
  const submitLabel = busy ? 'Processando...' : method === 'pix' ? `${c.buttonText} com Pix` : c.buttonText

  const seals = [
    ...checkoutSeals(d, c.guaranteeDays).map((k) => ({ icon: SEAL_ICONS[k] ?? BadgeCheck, ...sealCopy(k, d, c.guaranteeDays) })),
    ...(d.customSeals ?? []).filter(Boolean).map((t) => ({ icon: BadgeCheck, title: t, text: '' })),
  ].filter((x) => x.title)
  const sealsAt = d.sealsPosition ?? 'side'
  // Lateral: um cartão por selo, todos do mesmo tamanho, um embaixo do outro.
  const sealCards = sealsAt !== 'button' && seals.map((x, i) => (
    <section key={`seal-${i}`} className="flex min-h-[92px] items-center gap-4 p-5 shadow-sm" style={cardStyle}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }} aria-hidden="true">
        <x.icon size={24} style={{ color }} />
      </span>
      <div className="min-w-0">
        <h2 className="font-semibold leading-snug">{x.title}</h2>
        {x.text && <p className="mt-0.5 text-sm leading-snug opacity-70">{x.text}</p>}
      </div>
    </section>
  ))
  // Embaixo do botão: etiquetas pequenas.
  const sealsRow = sealsAt !== 'side' && seals.length > 0 && (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5" aria-label="Garantias da compra">
      {seals.map((x, i) => (
        <li key={i} className="flex items-center gap-1.5 text-xs font-semibold opacity-80">
          <x.icon size={14} style={{ color }} aria-hidden="true" />
          {x.title}
        </li>
      ))}
    </ul>
  )

  const countdownBox = cd && secondsLeft !== null && (
    <div className="px-4 py-3 text-center" style={{ background: cd.color, color: cd.textColor, borderRadius: radius }} role="timer" aria-label={`${cd.text}: ${formatClock(secondsLeft)}`}>
      <span className="block text-3xl font-bold tabular-nums">{formatClock(secondsLeft)}</span>
      <span className="text-sm font-medium">{secondsLeft > 0 ? cd.text : 'O tempo acabou!'}</span>
    </div>
  )

  const sideColumn = (
    <aside className="space-y-4">
      {cdPos === 'side' && countdownBox}
      {!(mobile && mb.hideSideImages) && c.sideImages.map((src, i) => <img key={i} src={src} alt="" className="w-full" style={{ borderRadius: radius }} />)}
      {c.benefits.length > 0 && (
        <section className="p-5 shadow-sm" style={cardStyle}>
          <h2 className="mb-3 text-base font-semibold">O que você recebe</h2>
          <ul className="space-y-2 text-sm opacity-90">
            {c.benefits.map((b, i) => (
              <li key={i} className="flex gap-2"><Check size={18} className="shrink-0" style={{ color }} aria-hidden="true" />{b}</li>
            ))}
          </ul>
        </section>
      )}
      {sealCards}
      {!(mobile && mb.hideTestimonials) && c.testimonials.map((t, i) => (
        <figure key={i} className="p-5 shadow-sm" style={cardStyle}>
          <div className="mb-2 flex gap-0.5 text-amber-400" aria-label="5 estrelas">{[0, 1, 2, 3, 4].map((s) => <Star key={s} size={14} fill="currentColor" />)}</div>
          <blockquote className="text-sm opacity-90">“{t.text}”</blockquote>
          <figcaption className="mt-3 flex items-center gap-2 text-sm font-semibold">
            {t.photoUrl && <img src={t.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />}
            {t.name}
          </figcaption>
        </figure>
      ))}
    </aside>
  )

  const form = (
          <form ref={formRef} onSubmit={onSubmit} className="space-y-5" noValidate>
            {cdPos === 'form' && countdownBox}
            {/* Cabeçalho do produto */}
            <section className={`flex items-center gap-4 p-4 shadow-sm ${d.titleAlign === 'center' ? 'flex-col text-center' : ''}`} style={cardStyle}>
              {data.imageUrl && <img src={data.imageUrl} alt="" className="h-20 w-20 shrink-0 object-cover" style={{ borderRadius: radius }} />}
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight">{c.headline || data.name}</h1>
                {c.subheadline && <p className="mt-1 text-sm opacity-70">{c.subheadline}</p>}
                <p className="mt-2 text-lg font-bold" style={{ color }}>
                  {data.comparePrice && data.comparePrice > data.price && (
                    <span className="mr-2 text-sm font-normal line-through opacity-50" style={{ color: textColor }}>{formatCents(data.comparePrice)}</span>
                  )}
                  {formatCents(data.price)}
                  {data.maxInstallments > 1 && data.paymentMethods.card && <span className="ml-1 text-sm font-normal opacity-70" style={{ color: textColor }}>à vista ou em até {data.maxInstallments}x no cartão</span>}
                  {pixPct > 0 && data.paymentMethods.pix && (
                    <span className="mt-1 block text-sm font-semibold text-emerald-600">
                      {formatCents(Math.round(data.price * (1 - pixPct / 100)))} no Pix ({pixPct}% de desconto)
                    </span>
                  )}
                </p>
              </div>
            </section>

            {/* Dados */}
            <section className="space-y-3 p-5 shadow-sm" style={cardStyle} aria-labelledby={`${uid}-dados`}>
              <h2 id={`${uid}-dados`} className="text-base font-semibold">Seus dados</h2>
              <label className="block">
                <span className={labelCls}>Nome completo</span>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </label>
              <label className="block">
                <span className={labelCls}>E-mail (é por ele que você vai acessar)</span>
                <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </label>
              {c.confirmEmail && (
                <label className="block">
                  <span className={labelCls}>Confirme o e-mail</span>
                  <input className={inputCls} type="email" value={email2} onChange={(e) => setEmail2(e.target.value)} required />
                </label>
              )}
              <div className={`grid gap-3 ${mobile ? '' : 'grid-cols-2'}`}>
                {c.askCpf && (
                  <label className="block">
                    <span className={labelCls}>CPF ou CNPJ</span>
                    <input className={inputCls} inputMode="numeric" value={cpf} onChange={(e) => setCpf(maskDocument(e.target.value))} required />
                  </label>
                )}
                {c.askPhone && (
                  <label className="block">
                    <span className={labelCls}>Celular com DDD</span>
                    <input className={inputCls} inputMode="tel" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} autoComplete="tel" required />
                  </label>
                )}
              </div>
            </section>

            {/* Pagamento */}
            <section className="space-y-4 p-5 shadow-sm" style={cardStyle} aria-labelledby={`${uid}-pag`}>
              <h2 id={`${uid}-pag`} className="text-base font-semibold">Pagamento</h2>
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
                      className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-medium ${method === m ? '' : 'border-black/10 opacity-70'}`}
                      style={method === m ? { borderColor: color } : undefined}
                    >
                      {m === 'pix' ? <QrCode size={18} /> : m === 'card' ? <CreditCard size={18} /> : <Check size={18} />}
                      {m === 'pix' ? 'Pix' : m === 'card' ? 'Cartão de crédito' : 'Modo teste'}
                      {m === 'pix' && pixPct > 0 && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">-{pixPct}%</span>}
                    </button>
                  ))}
                </div>
              )}

              {method === 'pix' && (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  {data.gateway.pixManual
                    ? 'Ao finalizar, aparece o QR Code e o código copia e cola. O acesso é liberado assim que o pagamento for confirmado.'
                    : 'Ao finalizar, aparece o QR Code e o código copia e cola. A liberação é imediata depois do pagamento.'}
                </p>
              )}
              {method === 'test' && (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  Modo teste: o Mercado Pago ainda não foi configurado. A compra é liberada sem cobrança, só para conferir o fluxo.
                </p>
              )}
              {method === 'card' && (preview ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm opacity-70">
                  Aqui aparece o formulário seguro do cartão (Mercado Pago), com parcelamento em até {data.maxInstallments}x.
                </div>
              ) : (
                <div id={brickId} />
              ))}

              {/* Order bumps */}
              {data.bumps.map((b) => {
                const on = bumps.includes(b.productId)
                return (
                  <label
                    key={b.productId}
                    className={`block cursor-pointer border-2 border-dashed p-4 ${!on && b.animation && !['none', 'arrow', 'blink'].includes(b.animation) ? `ob-anim ob-${b.animation}` : ''}`}
                    style={{ borderColor: on ? color : '#cbd5e1', background: on ? `color-mix(in srgb, ${color} 8%, transparent)` : 'transparent', borderRadius: radius, ['--ob' as string]: color }}
                  >
                    <p className={`text-sm font-bold uppercase tracking-wide ${!on && b.animation === 'blink' ? 'ob-anim ob-blink' : ''}`} style={{ color }}>{b.headline}</p>
                    <div className="mt-2 flex gap-3">
                      {b.imageUrl && <img src={b.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
                      <div className="min-w-0 text-sm opacity-90">
                        <p className="font-semibold">{b.name}</p>
                        {b.description && <p className="mt-0.5">{b.description}</p>}
                        <p className="mt-1 font-semibold">
                          {b.fullPrice > b.price && <span className="mr-2 font-normal text-slate-400 line-through">{formatCents(b.fullPrice)}</span>}
                          {formatCents(b.price)}
                        </p>
                      </div>
                    </div>
                    <span className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
                      {!on && b.animation === 'arrow' && <ArrowRight size={18} className="ob-anim ob-arrow shrink-0" style={{ color }} aria-hidden="true" />}
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
                  <button type="button" onClick={() => setCouponOpen(true)} className="flex items-center gap-1.5 text-sm opacity-70 underline-offset-2 hover:underline">
                    <Ticket size={15} /> Tenho um cupom de desconto
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <input className={`${inputCls} uppercase`} aria-label="Código do cupom" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} placeholder="CUPOM" />
                    <button type="button" onClick={applyCoupon} className="rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Aplicar</button>
                  </div>
                )}
                {couponMsg && <p className="mt-1.5 text-sm opacity-80" aria-live="polite">{couponMsg}</p>}
              </div>

              {/* Resumo */}
              <div className="space-y-1 border-t border-black/10 pt-3 text-sm opacity-90">
                <div className="flex justify-between"><span>{data.name}</span><span>{formatCents(mainPrice)}</span></div>
                {data.bumps.filter((b) => bumps.includes(b.productId)).map((b) => (
                  <div key={b.productId} className="flex justify-between"><span>{b.name}</span><span>{formatCents(b.price)}</span></div>
                ))}
                {pixOff > 0 && (
                  <div className="flex justify-between text-emerald-600"><span>Desconto no Pix ({pixPct}%)</span><span>-{formatCents(pixOff)}</span></div>
                )}
                <div className="flex justify-between pt-1 text-base font-bold"><span>Total</span><span>{formatCents(total)}</span></div>
              </div>

              {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

              {cdPos === 'button' && countdownBox}
              {method !== 'card' && methods.length > 0 && (
                <button
                  type="submit"
                  disabled={busy}
                  className={`flex h-14 w-full items-center justify-center gap-2 text-lg font-bold shadow-md transition hover:brightness-110 disabled:opacity-60 ${btnAnim}`}
                  style={{ background: color, color: d.buttonTextColor || '#ffffff', borderRadius: radius }}
                >
                  <Lock size={18} /> {submitLabel}
                </button>
              )}
              {sealsRow}
              <p className="flex items-center justify-center gap-1.5 text-xs opacity-60"><Lock size={12} /> Pagamento seguro processado pelo Mercado Pago</p>
            </section>
          </form>
  )

  return (
    <div
      className="min-h-full"
      style={{ background: c.backgroundColor, color: textColor, fontFamily: `'${c.font}', Inter, system-ui, sans-serif`, ['--ck' as string]: color, colorScheme: 'light' }}
    >
      {cdPos === 'top' && cd && secondsLeft !== null && (
        <div className="sticky top-0 z-10 px-4 py-2.5 text-center" style={{ background: cd.color, color: cd.textColor }} role="timer" aria-label={`${cd.text}: ${formatClock(secondsLeft)}`}>
          <span className="text-2xl font-bold tabular-nums">{formatClock(secondsLeft)}</span>
          <span className="ml-3 text-sm font-medium">{secondsLeft > 0 ? cd.text : 'O tempo acabou!'}</span>
        </div>
      )}

      <div className={`mx-auto px-4 py-6 ${width} ${sticky ? 'pb-24' : ''}`}>
        {header && <img src={header} alt="" className="mb-5 w-full object-cover" style={{ borderRadius: radius }} />}

        {side === 'below' ? (
          <div className="space-y-6">
            {mobile && mb.sideFirst ? <>{sideColumn}{form}</> : <>{form}{sideColumn}</>}
          </div>
        ) : (
          <div className={`grid gap-6 ${side === 'left' ? 'grid-cols-[340px_1fr]' : 'grid-cols-[1fr_340px]'}`}>
            {side === 'left' ? <>{sideColumn}{form}</> : <>{form}{sideColumn}</>}
          </div>
        )}

        <footer className="mt-8 space-y-1 text-center text-xs opacity-60">
          {c.footerText && <p>{c.footerText}</p>}
          {data.supportEmail && <p>Dúvidas: {data.supportEmail}</p>}
        </footer>
      </div>

      {sticky && (
        <div className={`${preview ? 'sticky' : 'fixed inset-x-0'} bottom-0 z-20 border-t border-black/10 p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]`} style={{ background: d.cardColor || '#ffffff' }}>
          <button
            type="button"
            onClick={() => formRef.current?.requestSubmit()}
            disabled={busy}
            className={`flex h-12 w-full items-center justify-center gap-2 font-bold disabled:opacity-60 ${btnAnim}`}
            style={{ background: color, color: d.buttonTextColor || '#ffffff', borderRadius: radius }}
          >
            <Lock size={16} /> {submitLabel} · {formatCents(total)}
          </button>
        </div>
      )}
    </div>
  )
}

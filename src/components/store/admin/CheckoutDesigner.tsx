import { useState } from 'react'
import { Monitor, Plus, Smartphone, Trash2 } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../../ui/Field'
import { ImageField } from './ImageField'
import { TextListEditor } from './ListEditor'
import { CheckoutView } from '../CheckoutView'
import { maskCurrencyInput, parseCurrencyToNumber } from '../../../utils/masks'
import { parseMetaPixelId } from '../../../utils/metaPixel'
import { STORE_FONTS, formatCents, type StoreCheckoutConfig, type StoreProduct } from '../../../types/store'
import type { PublicCheckout } from '../../../services/storeApi'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {children}
    </section>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  )
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-[38px] w-12 cursor-pointer rounded-lg border border-slate-200" aria-label={`${label}: seletor`} />
        <Input value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label}: código`} />
      </div>
    </Field>
  )
}

/** Monta o PublicCheckout da pré-visualização a partir do rascunho. */
function previewData(product: StoreProduct, all: StoreProduct[]): PublicCheckout {
  const c = product.checkout
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl ?? null,
    price: product.price,
    comparePrice: product.comparePrice ?? null,
    supportEmail: product.supportEmail ?? null,
    maxInstallments: product.maxInstallments,
    paymentMethods: product.paymentMethods,
    pixDiscountPercent: product.pixDiscountPercent ?? 0,
    checkout: {
      primaryColor: c.primaryColor,
      backgroundColor: c.backgroundColor,
      font: c.font,
      headerImageUrl: c.headerImageUrl ?? null,
      headline: c.headline || product.name,
      subheadline: c.subheadline || '',
      countdown: c.countdown.enabled ? { minutes: c.countdown.minutes, text: c.countdown.text, color: c.countdown.color } : null,
      sideImages: c.sideImages.filter(Boolean),
      benefits: c.benefits.filter(Boolean),
      testimonials: c.testimonials.filter((t) => t.text),
      guaranteeDays: c.guaranteeDays,
      askPhone: c.askPhone,
      askCpf: c.askCpf,
      confirmEmail: c.confirmEmail,
      buttonText: c.buttonText || 'Comprar agora',
      fbPixelId: null,
      thankYouUrl: null,
      footerText: c.footerText || '',
    },
    bumps: c.bumps
      .map((b) => {
        const p = all.find((x) => x.id === b.productId)
        if (!p) return null
        return { productId: p.id, name: p.name, imageUrl: p.imageUrl ?? null, headline: b.headline || `Leve também: ${p.name}`, description: b.description || p.description, cta: b.cta || 'Sim, eu quero!', price: b.price || p.price, fullPrice: p.price }
      })
      .filter((b): b is NonNullable<typeof b> => !!b),
    gateway: { mercadoPago: true, publicKey: null, pixManual: false, testMode: false },
  }
}

/** "Configuração de tela" do checkout: formulário à esquerda, prévia ao vivo à direita. */
export function CheckoutDesigner({ product, allProducts, onChange }: { product: StoreProduct; allProducts: StoreProduct[]; onChange: (patch: Partial<StoreCheckoutConfig>) => void }) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const c = product.checkout
  const others = allProducts.filter((p) => p.id !== product.id)

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <div className="space-y-4">
        <Section title="Aparência">
          <div className="grid grid-cols-2 gap-3">
            <ColorInput label="Cor principal (botões)" value={c.primaryColor} onChange={(v) => onChange({ primaryColor: v })} />
            <ColorInput label="Cor de fundo" value={c.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
          </div>
          <Field label="Fonte">
            <Select value={c.font} onChange={(e) => onChange({ font: e.target.value })}>
              {STORE_FONTS.map((f) => <option key={f}>{f}</option>)}
            </Select>
          </Field>
          <ImageField label="Banner do topo" value={c.headerImageUrl} onChange={(v) => onChange({ headerImageUrl: v })} productId={product.id} assetKey="checkout-header" hint="Sugestão: 1200 x 300 px" aspect="aspect-[4/1]" />
          <Field label="Título"><Input value={c.headline ?? ''} onChange={(e) => onChange({ headline: e.target.value })} placeholder={product.name} /></Field>
          <Field label="Subtítulo"><Input value={c.subheadline ?? ''} onChange={(e) => onChange({ subheadline: e.target.value })} /></Field>
          <Field label="Texto do botão"><Input value={c.buttonText} onChange={(e) => onChange({ buttonText: e.target.value })} /></Field>
        </Section>

        <Section title="Contador de escassez">
          <Toggle label="Mostrar contador no topo" checked={c.countdown.enabled} onChange={(v) => onChange({ countdown: { ...c.countdown, enabled: v } })} />
          {c.countdown.enabled && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Minutos"><Input type="number" min={1} value={c.countdown.minutes} onChange={(e) => onChange({ countdown: { ...c.countdown, minutes: Number(e.target.value) || 15 } })} /></Field>
              <ColorInput label="Cor da faixa" value={c.countdown.color} onChange={(v) => onChange({ countdown: { ...c.countdown, color: v } })} />
              <div className="col-span-2"><Field label="Texto"><Input value={c.countdown.text} onChange={(e) => onChange({ countdown: { ...c.countdown, text: e.target.value } })} /></Field></div>
            </div>
          )}
        </Section>

        <Section title="Campos do formulário">
          <Toggle label="Pedir celular" checked={c.askPhone} onChange={(v) => onChange({ askPhone: v })} />
          <Toggle label="Pedir CPF ou CNPJ" checked={c.askCpf} onChange={(v) => onChange({ askCpf: v })} />
          <Toggle label="Pedir para confirmar o e-mail" checked={c.confirmEmail} onChange={(v) => onChange({ confirmEmail: v })} />
        </Section>

        <Section title="Order bumps (ofertas extras no checkout)">
          {c.bumps.map((b, i) => {
            const set = (patch: Partial<typeof b>) => onChange({ bumps: c.bumps.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
            return (
              <div key={i} className="space-y-2 rounded-xl border border-dashed border-slate-300 p-3">
                <div className="flex gap-2">
                  <Select aria-label={`Produto do order bump ${i + 1}`} value={b.productId} onChange={(e) => set({ productId: e.target.value })}>
                    {others.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatCents(p.price)})</option>)}
                  </Select>
                  <button type="button" onClick={() => onChange({ bumps: c.bumps.filter((_, j) => j !== i) })} className="rounded-lg px-2 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Remover order bump ${i + 1}`}><Trash2 size={15} /></button>
                </div>
                <Input aria-label="Chamada" placeholder="Chamada (ex.: Adquira também os moldes de buquê)" value={b.headline} onChange={(e) => set({ headline: e.target.value })} />
                <Textarea aria-label="Descrição" rows={2} placeholder="Descrição curta" value={b.description} onChange={(e) => set({ description: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <Input aria-label="Texto da caixinha" placeholder="Sim, eu quero!" value={b.cta} onChange={(e) => set({ cta: e.target.value })} />
                  <Input aria-label="Preço especial" placeholder="Preço especial (opcional)" value={b.price ? maskCurrencyInput(String(b.price)) : ''} onChange={(e) => { const v = parseCurrencyToNumber(e.target.value); set({ price: v ? Math.round(v * 100) : null }) }} />
                </div>
              </div>
            )
          })}
          {others.length === 0 ? (
            <p className="text-xs text-slate-400">Crie outro produto para oferecer como order bump.</p>
          ) : (
            <button type="button" onClick={() => onChange({ bumps: [...c.bumps, { productId: others[0].id, headline: '', description: '', cta: 'Sim, eu quero!', price: null }] })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
              <Plus size={13} /> Adicionar order bump
            </button>
          )}
        </Section>

        <Section title="Prova e confiança">
          <Field label="Garantia (dias, 0 = não mostrar)"><Input type="number" min={0} value={c.guaranteeDays} onChange={(e) => onChange({ guaranteeDays: Number(e.target.value) || 0 })} /></Field>
          <TextListEditor label="O que a pessoa recebe" items={c.benefits} onChange={(v) => onChange({ benefits: v })} placeholder="Ex.: 40 aulas em vídeo" />
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium text-slate-500">Depoimentos</legend>
            {c.testimonials.map((t, i) => (
              <div key={i} className="space-y-1.5 rounded-xl border border-slate-200 p-2.5">
                <div className="flex gap-1.5">
                  <Input aria-label={`Nome do depoimento ${i + 1}`} placeholder="Nome" value={t.name} onChange={(e) => onChange({ testimonials: c.testimonials.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <button type="button" onClick={() => onChange({ testimonials: c.testimonials.filter((_, j) => j !== i) })} className="rounded-lg px-2 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Remover depoimento ${i + 1}`}><Trash2 size={15} /></button>
                </div>
                <Textarea aria-label={`Texto do depoimento ${i + 1}`} rows={2} placeholder="Depoimento" value={t.text} onChange={(e) => onChange({ testimonials: c.testimonials.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              </div>
            ))}
            <button type="button" onClick={() => onChange({ testimonials: [...c.testimonials, { name: '', text: '' }] })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"><Plus size={13} /> Adicionar depoimento</button>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium text-slate-500">Imagens da lateral (mockups, prints, bônus)</legend>
            {c.sideImages.map((src, i) => (
              <ImageField key={i} label={`Imagem ${i + 1}`} value={src} onChange={(v) => onChange({ sideImages: v ? c.sideImages.map((x, j) => (j === i ? v : x)) : c.sideImages.filter((_, j) => j !== i) })} productId={product.id} assetKey={`side-${i}`} aspect="aspect-square" />
            ))}
            {c.sideImages.length < 6 && (
              <button type="button" onClick={() => onChange({ sideImages: [...c.sideImages, ''] })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"><Plus size={13} /> Adicionar imagem</button>
            )}
          </fieldset>
        </Section>

        <Section title="Rastreamento e pós-compra">
          <Field label="Pixel do Meta (número ou código)">
            <Input value={c.fbPixelId ?? ''} onChange={(e) => onChange({ fbPixelId: parseMetaPixelId(e.target.value) ?? e.target.value })} placeholder="1234567890" />
          </Field>
          <p className="text-[11px] text-slate-400">Dispara InitiateCheckout, AddPaymentInfo e Purchase (com valor). UTMs do link ficam salvas no pedido.</p>
          <Field label="Página de obrigado própria (opcional)"><Input value={c.thankYouUrl ?? ''} onChange={(e) => onChange({ thankYouUrl: e.target.value || null })} placeholder="https://..." /></Field>
          <Field label="Rodapé"><Input value={c.footerText ?? ''} onChange={(e) => onChange({ footerText: e.target.value })} placeholder="Arrow Shot, CNPJ 00.000.000/0001-00" /></Field>
        </Section>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-600">Pré-visualização</p>
          <div role="radiogroup" aria-label="Dispositivo da pré-visualização" className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(['desktop', 'mobile'] as const).map((d) => (
              <button key={d} role="radio" aria-checked={device === d} onClick={() => setDevice(d)} className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${device === d ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                {d === 'desktop' ? <Monitor size={14} /> : <Smartphone size={14} />} {d === 'desktop' ? 'Computador' : 'Celular'}
              </button>
            ))}
          </div>
        </div>
        <div className={`mx-auto max-h-[80vh] overflow-y-auto rounded-2xl border border-slate-200 shadow-sm ${device === 'mobile' ? 'max-w-[400px]' : ''}`} aria-label="Pré-visualização do checkout" role="region">
          <CheckoutView data={previewData(product, allProducts)} preview device={device} />
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Monitor, Plus, Settings2, Smartphone, Trash2 } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../../ui/Field'
import { ImageField } from './ImageField'
import { TextListEditor } from './ListEditor'
import { MetaCapiField } from './MetaCapiField'
import { CheckoutView } from '../CheckoutView'
import { EditorSection, Toggle } from '../../leads/LeadFormBuilderParts'
import { ButtonAnimationPicker, Segmented } from '../../leads/LeadFormBlocksEditor'
import { maskCurrencyInput, parseCurrencyToNumber } from '../../../utils/masks'
import { parseMetaPixelId } from '../../../utils/metaPixel'
import {
  STORE_FONTS,
  STORE_SEALS,
  formatCents,
  type StoreCheckoutConfig,
  type StoreCheckoutDesign,
  type StoreCountdownConfig,
  type StoreProduct,
  type StoreSealKey,
  type StoreBumpAnimation,
} from '../../../types/store'
import type { PublicCheckout } from '../../../services/storeApi'

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

/** Modelos prontos: trocam fundo, cartões, texto, botão e contador de uma vez. */
const PRESETS: { name: string; bg: string; card: string; text: string; primary: string; btnText: string; timer: string }[] = [
  { name: 'Claro', bg: '#f1f5f9', card: '#ffffff', text: '#0f172a', primary: '#2563eb', btnText: '#ffffff', timer: '#e55858' },
  { name: 'Verde', bg: '#f0fdf4', card: '#ffffff', text: '#14532d', primary: '#16a34a', btnText: '#ffffff', timer: '#dc2626' },
  { name: 'Laranja', bg: '#fff7ed', card: '#ffffff', text: '#431407', primary: '#ea580c', btnText: '#ffffff', timer: '#b91c1c' },
  { name: 'Roxo', bg: '#faf5ff', card: '#ffffff', text: '#3b0764', primary: '#9333ea', btnText: '#ffffff', timer: '#db2777' },
  { name: 'Escuro', bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', primary: '#22c55e', btnText: '#052e16', timer: '#dc2626' },
  { name: 'Preto', bg: '#0a0a0a', card: '#171717', text: '#fafafa', primary: '#facc15', btnText: '#0a0a0a', timer: '#dc2626' },
]

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
      countdown: c.countdown.enabled
        ? { minutes: c.countdown.minutes, text: c.countdown.text, color: c.countdown.color, textColor: c.countdown.textColor || '#ffffff', position: c.countdown.position ?? 'top', devices: c.countdown.devices ?? 'all' }
        : null,
      design: c.design ?? {},
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
        return { productId: p.id, name: p.name, imageUrl: p.imageUrl ?? null, headline: b.headline || `Leve também: ${p.name}`, description: b.description || p.description, cta: b.cta || 'Sim, eu quero!', animation: b.animation ?? 'none', price: b.price || p.price, fullPrice: p.price }
      })
      .filter((b): b is NonNullable<typeof b> => !!b),
    gateway: { mercadoPago: true, publicKey: null, pixManual: false, testMode: false },
  }
}

type Tab = 'general' | 'desktop' | 'mobile'

/** "Configuração de tela" do checkout: formulário à esquerda, prévia ao vivo à direita.
 *  As abas Computador e Celular mudam a prévia junto. */
export function CheckoutDesigner({ product, allProducts, onChange }: { product: StoreProduct; allProducts: StoreProduct[]; onChange: (patch: Partial<StoreCheckoutConfig>) => void }) {
  const [tab, setTab] = useState<Tab>('general')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const c = product.checkout
  const d = c.design ?? {}
  const others = allProducts.filter((p) => p.id !== product.id)

  const setDesign = (patch: Partial<StoreCheckoutDesign>) => onChange({ design: { ...d, ...patch } })
  const setDesktop = (patch: NonNullable<StoreCheckoutDesign['desktop']>) => setDesign({ desktop: { ...d.desktop, ...patch } })
  const setMobile = (patch: NonNullable<StoreCheckoutDesign['mobile']>) => setDesign({ mobile: { ...d.mobile, ...patch } })
  const setCountdown = (patch: Partial<StoreCountdownConfig>) => onChange({ countdown: { ...c.countdown, ...patch } })
  const pickTab = (t: Tab) => {
    setTab(t)
    if (t !== 'general') setDevice(t)
  }
  const seals = d.seals ?? []
  const toggleSeal = (k: StoreSealKey, on: boolean) => setDesign({ seals: on ? [...seals, k] : seals.filter((x) => x !== k) })

  const countdownSection = (
    <EditorSection title="Contador de escassez" hint="Escolha onde ele aparece e em qual tela." collapsible defaultOpen={c.countdown.enabled}>
      <Toggle label="Mostrar contador" checked={c.countdown.enabled} onChange={(v) => setCountdown({ enabled: v })} />
      {c.countdown.enabled && (
        <>
          <Segmented
            label="Posição"
            value={c.countdown.position ?? 'top'}
            onChange={(v) => setCountdown({ position: v })}
            options={[
              { value: 'top', content: 'Topo fixo', title: 'Faixa presa no topo da página, mesmo rolando' },
              { value: 'form', content: 'No formulário', title: 'Caixa acima do nome do produto' },
              { value: 'side', content: 'Lateral', title: 'No topo da coluna lateral (no celular, depois do formulário)' },
              { value: 'button', content: 'No botão', title: 'Logo acima do botão de comprar' },
            ]}
          />
          <Segmented
            label="Aparece no"
            value={c.countdown.devices ?? 'all'}
            onChange={(v) => setCountdown({ devices: v })}
            options={[
              { value: 'all', content: 'Os dois', title: 'Computador e celular' },
              { value: 'desktop', content: 'Computador', title: 'Só no computador' },
              { value: 'mobile', content: 'Celular', title: 'Só no celular' },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minutos"><Input type="number" min={1} value={c.countdown.minutes} onChange={(e) => setCountdown({ minutes: Number(e.target.value) || 15 })} /></Field>
            <div />
            <ColorInput label="Cor da faixa" value={c.countdown.color} onChange={(v) => setCountdown({ color: v })} />
            <ColorInput label="Cor do texto" value={c.countdown.textColor || '#ffffff'} onChange={(v) => setCountdown({ textColor: v })} />
          </div>
          <Field label="Texto"><Input value={c.countdown.text} onChange={(e) => setCountdown({ text: e.target.value })} /></Field>
        </>
      )}
    </EditorSection>
  )

  const general = (
    <>
      <EditorSection title="Modelos prontos" hint="Troca todas as cores de uma vez. Depois ajuste o que quiser.">
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => {
            const active = c.backgroundColor.toLowerCase() === p.bg && c.primaryColor.toLowerCase() === p.primary
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => onChange({ backgroundColor: p.bg, primaryColor: p.primary, countdown: { ...c.countdown, color: p.timer, textColor: '#ffffff' }, design: { ...d, cardColor: p.card, textColor: p.text, buttonTextColor: p.btnText } })}
                className={`flex flex-col overflow-hidden rounded-lg border-2 text-left ${active ? 'border-brand-600' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <span className="flex h-11 w-full items-center justify-center gap-1.5" style={{ background: p.bg }}>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: p.card, color: p.text }}>Aa</span>
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: p.primary, color: p.btnText }}>Comprar</span>
                </span>
                <span className="block w-full truncate bg-white px-1.5 py-1 text-center text-[11px] font-medium text-slate-600">{p.name}</span>
              </button>
            )
          })}
        </div>
      </EditorSection>

      <EditorSection title="Cores e fonte">
        <div className="grid grid-cols-2 gap-3">
          <ColorInput label="Cor principal (botões)" value={c.primaryColor} onChange={(v) => onChange({ primaryColor: v })} />
          <ColorInput label="Texto do botão" value={d.buttonTextColor || '#ffffff'} onChange={(v) => setDesign({ buttonTextColor: v })} />
          <ColorInput label="Fundo da página" value={c.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
          <ColorInput label="Fundo dos cartões" value={d.cardColor || '#ffffff'} onChange={(v) => setDesign({ cardColor: v })} />
          <ColorInput label="Cor do texto" value={d.textColor || '#0f172a'} onChange={(v) => setDesign({ textColor: v })} />
        </div>
        <Field label="Fonte">
          <Select value={c.font} onChange={(e) => onChange({ font: e.target.value })}>
            {STORE_FONTS.map((f) => <option key={f}>{f}</option>)}
          </Select>
        </Field>
        <Segmented
          label="Cantos dos cartões e botões"
          value={d.radius ?? 'soft'}
          onChange={(v) => setDesign({ radius: v })}
          options={[
            { value: 'square', content: 'Retos', title: 'Quase sem arredondar' },
            { value: 'soft', content: 'Médios', title: 'Padrão' },
            { value: 'round', content: 'Redondos', title: 'Bem arredondados' },
          ]}
        />
      </EditorSection>

      <EditorSection title="Textos e botão">
        <Field label="Título"><Input value={c.headline ?? ''} onChange={(e) => onChange({ headline: e.target.value })} placeholder={product.name} /></Field>
        <Field label="Subtítulo"><Input value={c.subheadline ?? ''} onChange={(e) => onChange({ subheadline: e.target.value })} /></Field>
        <Segmented
          label="Alinhamento do título"
          value={d.titleAlign ?? 'left'}
          onChange={(v) => setDesign({ titleAlign: v })}
          options={[
            { value: 'left', content: 'Foto ao lado', title: 'Foto do produto à esquerda do título' },
            { value: 'center', content: 'Centralizado', title: 'Foto em cima e título no meio' },
          ]}
        />
        <Field label="Texto do botão"><Input value={c.buttonText} onChange={(e) => onChange({ buttonText: e.target.value })} /></Field>
        <ButtonAnimationPicker label="Animação do botão" value={d.buttonAnimation} onChange={(v) => setDesign({ buttonAnimation: v })} />
      </EditorSection>

      {countdownSection}

      <EditorSection title="Garantia e selos de confiança" hint="Selos como Compra segura e 7 dias de garantia passam confiança perto do botão.">
        <Field label="Garantia (dias, 0 = não mostrar o cartão)"><Input type="number" min={0} value={c.guaranteeDays} onChange={(e) => onChange({ guaranteeDays: Number(e.target.value) || 0 })} /></Field>
        {c.guaranteeDays > 0 && (
          <div className="grid gap-2">
            <Input aria-label="Título do cartão de garantia" placeholder={`Garantia de ${c.guaranteeDays} dias`} value={d.guaranteeTitle ?? ''} onChange={(e) => setDesign({ guaranteeTitle: e.target.value })} />
            <Input aria-label="Texto do cartão de garantia" placeholder="Se não gostar, devolvemos 100% do seu dinheiro." value={d.guaranteeText ?? ''} onChange={(e) => setDesign({ guaranteeText: e.target.value })} />
          </div>
        )}
        <fieldset>
          <legend className="mb-1.5 text-[11px] font-medium text-slate-400">Selos</legend>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {STORE_SEALS.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4" checked={seals.includes(s.key)} onChange={(e) => toggleSeal(s.key, e.target.checked)} />
                <span>{s.text(c.guaranteeDays)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <TextListEditor label="Selos com texto seu" items={d.customSeals ?? []} onChange={(v) => setDesign({ customSeals: v })} placeholder="Ex.: Mais de 500 alunos" />
        <Segmented
          label="Onde os selos aparecem"
          value={d.sealsPosition ?? 'button'}
          onChange={(v) => setDesign({ sealsPosition: v })}
          options={[
            { value: 'button', content: 'No botão', title: 'Embaixo do botão de comprar' },
            { value: 'side', content: 'Lateral', title: 'Na coluna lateral' },
            { value: 'both', content: 'Os dois', title: 'Embaixo do botão e na lateral' },
          ]}
        />
        <Segmented
          label="Estilo"
          value={d.sealsStyle ?? 'row'}
          onChange={(v) => setDesign({ sealsStyle: v })}
          options={[
            { value: 'row', content: 'Em linha', title: 'Etiquetas pequenas lado a lado' },
            { value: 'grid', content: 'Em grade', title: 'Quadradinhos com ícone grande' },
          ]}
        />
      </EditorSection>

      <EditorSection title="Campos do formulário">
        <Toggle label="Pedir celular" checked={c.askPhone} onChange={(v) => onChange({ askPhone: v })} />
        <Toggle label="Pedir CPF ou CNPJ" checked={c.askCpf} onChange={(v) => onChange({ askCpf: v })} />
        <Toggle label="Pedir para confirmar o e-mail" checked={c.confirmEmail} onChange={(v) => onChange({ confirmEmail: v })} />
      </EditorSection>

      <EditorSection title="Order bumps (ofertas extras no checkout)" collapsible defaultOpen={c.bumps.length > 0}>
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
              <Input aria-label="Chamada" placeholder="Chamada (ex.: Leve também o Script de vendas para WhatsApp)" value={b.headline} onChange={(e) => set({ headline: e.target.value })} />
              <Textarea aria-label="Descrição" rows={2} placeholder="Descrição curta" value={b.description} onChange={(e) => set({ description: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label="Texto da caixinha" placeholder="Sim, eu quero!" value={b.cta} onChange={(e) => set({ cta: e.target.value })} />
                <Input aria-label="Preço especial" placeholder="Preço especial (opcional)" value={b.price ? maskCurrencyInput(String(b.price)) : ''} onChange={(e) => { const v = parseCurrencyToNumber(e.target.value); set({ price: v ? Math.round(v * 100) : null }) }} />
              </div>
              <Field label="Animação pra chamar atenção">
                <Select value={b.animation ?? 'none'} onChange={(e) => set({ animation: e.target.value as StoreBumpAnimation })}>
                  <option value="none">Nenhuma (parado)</option>
                  <option value="pulse">Pulsar: borda pulsando na cor principal</option>
                  <option value="glow">Brilho: borda brilhando em volta</option>
                  <option value="shake">Balançar de vez em quando</option>
                  <option value="bounce">Pular de vez em quando</option>
                  <option value="arrow">Seta apontando pra caixinha</option>
                  <option value="blink">Chamada piscando</option>
                </Select>
              </Field>
              <p className="text-[11px] text-slate-400">Para quando a pessoa marca a caixinha. Quem pede menos movimento no celular vê parado.</p>
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
      </EditorSection>

      <EditorSection title="Benefícios, depoimentos e imagens" collapsible defaultOpen={c.benefits.length + c.testimonials.length + c.sideImages.length > 0}>
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
      </EditorSection>

      <EditorSection title="Rastreamento e pós-compra" collapsible defaultOpen={!!(c.fbPixelId || c.thankYouUrl || c.footerText)}>
        <Field label="Pixel do Meta (número ou código)">
          <Input value={c.fbPixelId ?? ''} onChange={(e) => onChange({ fbPixelId: parseMetaPixelId(e.target.value) ?? e.target.value })} placeholder="1234567890" />
        </Field>
        <p className="text-[11px] text-slate-400">No navegador: PageView, InitiateCheckout, AddPaymentInfo e Purchase (com valor). UTMs do link ficam salvas no pedido.</p>
        <MetaCapiField pixelId={c.fbPixelId ?? null} enabled={c.capiEnabled !== false} testCode={c.capiTestCode ?? ''} onChange={onChange} />
        <Field label="Página de obrigado própria (opcional)"><Input value={c.thankYouUrl ?? ''} onChange={(e) => onChange({ thankYouUrl: e.target.value || null })} placeholder="https://..." /></Field>
        <Field label="Rodapé"><Input value={c.footerText ?? ''} onChange={(e) => onChange({ footerText: e.target.value })} placeholder="Arrow Shot, CNPJ 00.000.000/0001-00" /></Field>
      </EditorSection>
    </>
  )

  const desktop = (
    <>
      <EditorSection title="Layout no computador">
        <Segmented
          label="Largura da página"
          value={d.desktop?.width ?? 'normal'}
          onChange={(v) => setDesktop({ width: v })}
          options={[
            { value: 'narrow', content: 'Estreita', title: 'Mais focada, parecida com celular' },
            { value: 'normal', content: 'Normal', title: 'Padrão' },
            { value: 'wide', content: 'Larga', title: 'Ocupa mais a tela' },
          ]}
        />
        <Segmented
          label="Coluna lateral (benefícios, garantia, depoimentos)"
          value={d.desktop?.side ?? 'right'}
          onChange={(v) => setDesktop({ side: v })}
          options={[
            { value: 'right', content: 'Direita', title: 'Formulário à esquerda, lateral à direita' },
            { value: 'left', content: 'Esquerda', title: 'Lateral à esquerda, formulário à direita' },
            { value: 'below', content: 'Embaixo', title: 'Uma coluna só: lateral embaixo do formulário' },
          ]}
        />
      </EditorSection>
      <EditorSection title="Banner do topo">
        <ImageField label="Banner do topo" value={c.headerImageUrl} onChange={(v) => onChange({ headerImageUrl: v })} productId={product.id} assetKey="checkout-header" hint="Sugestão: 1200 x 300 px. Vale pro celular também, a menos que você coloque um próprio lá." aspect="aspect-[4/1]" />
        <Toggle label="Esconder o banner no computador" checked={!!d.desktop?.hideHeader} onChange={(v) => setDesktop({ hideHeader: v })} />
      </EditorSection>
      {countdownSection}
    </>
  )

  const mobile = (
    <>
      <EditorSection title="Banner do celular" hint="Banner mais alto costuma ficar melhor no celular. Em branco = usa o do computador.">
        <ImageField label="Banner só do celular" value={d.mobile?.headerImageUrl ?? null} onChange={(v) => setMobile({ headerImageUrl: v })} productId={product.id} assetKey="checkout-header-mobile" hint="Sugestão: 1080 x 600 px" aspect="aspect-[9/5]" />
        <Toggle label="Esconder o banner no celular" checked={!!d.mobile?.hideHeader} onChange={(v) => setMobile({ hideHeader: v })} />
      </EditorSection>
      <EditorSection title="Ordem e o que aparece">
        <Toggle label="Benefícios e garantia antes do formulário" hint="Por padrão o formulário vem primeiro e a lateral desce pra baixo." checked={!!d.mobile?.sideFirst} onChange={(v) => setMobile({ sideFirst: v })} />
        <Toggle label="Esconder as imagens da lateral" hint="Deixa a página mais curta no celular." checked={!!d.mobile?.hideSideImages} onChange={(v) => setMobile({ hideSideImages: v })} />
        <Toggle label="Esconder os depoimentos" checked={!!d.mobile?.hideTestimonials} onChange={(v) => setMobile({ hideTestimonials: v })} />
      </EditorSection>
      <EditorSection title="Botão fixo">
        <Toggle label="Botão de comprar fixo no rodapé" hint="Fica sempre visível enquanto a pessoa rola, com o valor total. Não aparece no cartão de crédito (o Mercado Pago tem o botão próprio)." checked={!!d.mobile?.stickyButton} onChange={(v) => setMobile({ stickyButton: v })} />
      </EditorSection>
      {countdownSection}
    </>
  )

  const tabs: { key: Tab; label: string; icon: typeof Monitor }[] = [
    { key: 'general', label: 'Geral', icon: Settings2 },
    { key: 'desktop', label: 'Computador', icon: Monitor },
    { key: 'mobile', label: 'Celular', icon: Smartphone },
  ]

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <div className="space-y-3">
        <div role="tablist" aria-label="Configurações" className="flex rounded-xl bg-slate-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => pickTab(t.key)}
              className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <t.icon size={15} aria-hidden="true" /> {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4" role="tabpanel">
          {tab === 'general' ? general : tab === 'desktop' ? desktop : mobile}
        </div>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-600">Pré-visualização</p>
          <div role="radiogroup" aria-label="Dispositivo da pré-visualização" className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(['desktop', 'mobile'] as const).map((dv) => (
              <button key={dv} type="button" role="radio" aria-checked={device === dv} onClick={() => setDevice(dv)} className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${device === dv ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                {dv === 'desktop' ? <Monitor size={14} /> : <Smartphone size={14} />} {dv === 'desktop' ? 'Computador' : 'Celular'}
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

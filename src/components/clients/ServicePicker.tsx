import type { ReactNode } from 'react'
import { Megaphone, Camera, LayoutTemplate } from 'lucide-react'

/** Cartão de serviço clicável (checkbox de verdade, pra leitor de tela). */
function ServiceCard({
  checked,
  onChange,
  icon,
  title,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors duration-150 ${
        checked ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <span aria-hidden="true" className={checked ? 'text-brand-600' : 'text-slate-400'}>{icon}</span>
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
      </span>
    </label>
  )
}

/** Opção marcável em formato de "pílula" (plataforma, responsável...). */
export function ChoiceChip({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-150 ${
        checked ? 'border-brand-600 bg-brand-50 text-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
      />
      {label}
    </label>
  )
}

export type ServiceFlags = {
  paidTraffic: boolean
  metaAds: boolean
  googleAds: boolean
  socialMedia: boolean
  landingPage: boolean
}

/** Serviços do cliente/lead: Tráfego Pago (→ Meta e/ou Google), Social Mídia
 *  e Landing Page. Mesmo componente no cadastro de cliente e de lead. */
export function ServicePicker({
  value,
  onChange,
  showMissing = false,
  platformRequired = true,
}: {
  value: ServiceFlags
  onChange: (patch: Partial<ServiceFlags>) => void
  /** Mostra "marque pelo menos um" em vermelho quando nada está marcado. */
  showMissing?: boolean
  /** Cliente: plataforma é obrigatória. Lead: só sugestão. */
  platformRequired?: boolean
}) {
  const none = !value.paidTraffic && !value.socialMedia && !value.landingPage
  const platformMissing = value.paidTraffic && !value.metaAds && !value.googleAds
  const warn = platformMissing && platformRequired
  return (
    <div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <ServiceCard
          checked={value.paidTraffic}
          onChange={(v) => onChange({ paidTraffic: v })}
          icon={<Megaphone size={15} />}
          title="Tráfego Pago"
          description="Anúncios no Meta (Facebook/Instagram) e/ou Google"
        />
        <ServiceCard
          checked={value.socialMedia}
          onChange={(v) => onChange({ socialMedia: v })}
          icon={<Camera size={15} />}
          title="Social Mídia"
          description="Posts e gestão do Instagram"
        />
        <ServiceCard
          checked={value.landingPage}
          onChange={(v) => onChange({ landingPage: v })}
          icon={<LayoutTemplate size={15} />}
          title="Landing Page / Site"
          description="Página de vendas ou site do cliente"
        />
      </div>
      {showMissing && none && <p className="mt-2 text-xs font-medium text-red-500">Marque pelo menos um serviço.</p>}

      {value.paidTraffic && (
        <fieldset className={`mt-3 rounded-lg border p-3 ${warn ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <legend className="px-1 text-xs font-semibold text-slate-700">Onde o tráfego pago roda?{platformRequired && ' *'}</legend>
          <div className="flex flex-wrap gap-2">
            <ChoiceChip checked={value.metaAds} onChange={(v) => onChange({ metaAds: v })} label="Meta Ads (Facebook / Instagram)" />
            <ChoiceChip checked={value.googleAds} onChange={(v) => onChange({ googleAds: v })} label="Google Ads" />
          </div>
          <p className={`mt-2 text-xs ${warn ? 'font-medium text-amber-700' : 'text-slate-400'}`}>
            {warn
              ? 'Escolha pelo menos uma — define o Planejamento de Campanha, as otimizações e os relatórios.'
              : 'Define o Planejamento de Campanha, as otimizações e os relatórios deste cliente.'}
          </p>
        </fieldset>
      )}
    </div>
  )
}

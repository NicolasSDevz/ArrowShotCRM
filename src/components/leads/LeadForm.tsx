import { Field, Input, Select, Textarea } from '../ui/Field'
import { maskPhone, maskCurrencyInput } from '../../utils/masks'
import { useRef } from 'react'
import { useProducts } from '../../hooks/useProducts'
import { modulesFromProducts, productModules, resolveServices, PRODUCT_MODULE_SHORT } from '../../utils/productModules'
import { LEAD_SOURCE_LABEL, type AppUser, type LeadSource } from '../../types'
import type { LeadFormState } from './leadFormState'
import { LeadCustomFields } from './LeadCustomFields'
import type { PipelineField } from '../../types'

export function LeadForm({
  value,
  onChange,
  users,
  originalProductIds = [],
  pipelineFields = [],
}: {
  value: LeadFormState
  onChange: (next: LeadFormState) => void
  users: AppUser[]
  /** Produtos que o lead já tinha salvos — desmarcar um deles desliga o serviço. */
  originalProductIds?: string[]
  /** Campos extras do pipeline em que o lead está. */
  pipelineFields?: PipelineField[]
}) {
  const { data: products, loading: productsLoading } = useProducts()
  const set = <K extends keyof LeadFormState>(key: K, v: LeadFormState[K]) => onChange({ ...value, [key]: v })
  const internalUsers = users.filter((u) => u.role !== 'client')
  const catalogEmpty = !productsLoading && products.length === 0
  const selectableProducts = products.filter((p) => p.active || value.contractedProductIds.includes(p.id))
  const origCovered = modulesFromProducts(products.filter((p) => originalProductIds.includes(p.id)))
  const svc = resolveServices(products, value.contractedProductIds, value, origCovered)
  // Serviços marcados no cadastro antigo do lead (antes do catálogo) — guardados
  // do primeiro render pra a linha não sumir quando a pessoa desmarca.
  const initialFlags = useRef({ paidTraffic: value.paidTraffic, socialMedia: value.socialMedia, landingPage: value.landingPage }).current
  const showLegacyRow = (k: 'paidTraffic' | 'socialMedia' | 'landingPage') => !catalogEmpty && initialFlags[k] && !origCovered[k] && !svc.derived[k]

  const toggleProduct = (id: string) =>
    set('contractedProductIds', value.contractedProductIds.includes(id) ? value.contractedProductIds.filter((v) => v !== id) : [...value.contractedProductIds, id])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome do responsável" required>
          <Input value={value.contactName} onChange={(e) => set('contactName', e.target.value)} autoFocus />
        </Field>
        <Field label="Nome da empresa">
          <Input value={value.companyName} onChange={(e) => set('companyName', e.target.value)} />
        </Field>
        <Field label="WhatsApp" required>
          <Input validate="phone" value={value.whatsapp} onChange={(e) => set('whatsapp', maskPhone(e.target.value))} placeholder="(00) 00000-0000" />
        </Field>
        <Field label="E-mail">
          <Input type="email" validate="email" value={value.email} onChange={(e) => set('email', e.target.value)} placeholder="nome@empresa.com" />
        </Field>
        <Field label="Cidade/Região">
          <Input value={value.cityRegion} onChange={(e) => set('cityRegion', e.target.value)} />
        </Field>
        <Field label="Origem do lead">
          <Select value={value.source} onChange={(e) => set('source', e.target.value as LeadSource)}>
            {(Object.entries(LEAD_SOURCE_LABEL) as [LeadSource, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
      </div>

      {catalogEmpty ? (
        <>
      <div>
        <span className="mb-1.5 block text-xs font-medium text-slate-500">Serviço de interesse</span>
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={value.paidTraffic}
              onChange={(e) => set('paidTraffic', e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
            />
            Tráfego Pago
          </label>
          {value.paidTraffic && (
            <div className="ml-5 flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={value.metaAds}
                  onChange={(e) => set('metaAds', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                />
                Meta Ads
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={value.googleAds}
                  onChange={(e) => set('googleAds', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                />
                Google Ads
              </label>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={value.socialMedia}
              onChange={(e) => set('socialMedia', e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
            />
            Social Mídia
          </label>
          {value.socialMedia && (
            <div className="ml-5">
              <Field label="Pacote">
                <Select value={value.socialMediaPackage} onChange={(e) => set('socialMediaPackage', e.target.value as 'weekly' | 'monthly')}>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                </Select>
              </Field>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={value.landingPage}
              onChange={(e) => set('landingPage', e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
            />
            Landing Page
          </label>
        </div>
      </div>

        </>
      ) : (
        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-500">Serviços (interesse ou já contratado)</span>
          <div className="flex flex-col gap-2.5 rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-400">Os serviços vêm do catálogo do Dashboard (Produtos e Serviços). Ao virar cliente, as abas e tarefas de cada área são liberadas sozinhas.</p>
            <div className="flex flex-col gap-1.5">
              {selectableProducts.map((p) => {
                const { keys, inferred } = productModules(p)
                return (
                  <label key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={value.contractedProductIds.includes(p.id)}
                      onChange={() => toggleProduct(p.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                    />
                    <span className="font-medium">{p.name}</span>
                    {!p.active && <span className="text-[11px] text-slate-400">(inativo)</span>}
                    {keys.map((k) => (
                      <span key={k} className="rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                        {PRODUCT_MODULE_SHORT[k]}
                        {inferred && '?'}
                      </span>
                    ))}
                  </label>
                )
              })}
            </div>

            {(['paidTraffic', 'socialMedia', 'landingPage'] as const).some(showLegacyRow) && (
              <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2.5">
                <p className="text-xs font-semibold text-slate-500">Já marcados neste lead (cadastro antigo)</p>
                {showLegacyRow('paidTraffic') && (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={value.paidTraffic} onChange={(e) => set('paidTraffic', e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                    Tráfego Pago
                  </label>
                )}
                {showLegacyRow('socialMedia') && (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={value.socialMedia} onChange={(e) => set('socialMedia', e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                    Social Mídia
                  </label>
                )}
                {showLegacyRow('landingPage') && (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={value.landingPage} onChange={(e) => set('landingPage', e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                    Landing Page
                  </label>
                )}
              </div>
            )}

            {svc.showPlatformPicker && (
              <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2.5">
                <p className="text-xs font-semibold text-slate-700">Plataforma do tráfego pago</p>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={value.metaAds} onChange={(e) => set('metaAds', e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                  Meta Ads
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={value.googleAds} onChange={(e) => set('googleAds', e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                  Google Ads
                </label>
              </div>
            )}

            {svc.socialMedia && (
              <Field label="Pacote (Social Mídia)">
                <Select value={value.socialMediaPackage} onChange={(e) => set('socialMediaPackage', e.target.value as 'weekly' | 'monthly')}>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                </Select>
              </Field>
            )}

            {value.contractedProductIds.length > 0 && (
              <Field label="Tempo de contrato">
                <Input value={value.contractedDuration} onChange={(e) => set('contractedDuration', e.target.value)} placeholder='Ex: "6 meses", "1 ano"' />
              </Field>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Valor estimado do contrato (R$)">
          <Input
            value={value.estimatedValueStr}
            onChange={(e) => set('estimatedValueStr', maskCurrencyInput(e.target.value))}
            placeholder="R$ 0,00"
          />
        </Field>
        <Field label="Responsável">
          <Select value={value.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
            <option value="">Sem responsável</option>
            {internalUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Próxima ação">
          <Input value={value.nextAction} onChange={(e) => set('nextAction', e.target.value)} placeholder='Ex: "Ligar amanhã às 14h"' />
        </Field>
        <Field label="Data da próxima ação">
          <Input type="date" value={value.nextActionDateStr} onChange={(e) => set('nextActionDateStr', e.target.value)} />
        </Field>
      </div>

      <LeadCustomFields fields={pipelineFields} values={value.customFields} onChange={(next) => set('customFields', next)} />

      <Field label="Observações">
        <Textarea rows={3} value={value.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </div>
  )
}

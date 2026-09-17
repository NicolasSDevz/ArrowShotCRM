import { Field, Input, Select, Textarea } from '../ui/Field'
import { maskPhone, maskCurrencyInput } from '../../utils/masks'
import { LEAD_SOURCE_LABEL, type AppUser, type LeadSource } from '../../types'
import type { LeadFormState } from './leadFormState'

export function LeadForm({
  value,
  onChange,
  users,
}: {
  value: LeadFormState
  onChange: (next: LeadFormState) => void
  users: AppUser[]
}) {
  const set = <K extends keyof LeadFormState>(key: K, v: LeadFormState[K]) => onChange({ ...value, [key]: v })
  const internalUsers = users.filter((u) => u.role !== 'client')

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
          <Input value={value.whatsapp} onChange={(e) => set('whatsapp', maskPhone(e.target.value))} placeholder="(00) 00000-0000" />
        </Field>
        <Field label="E-mail">
          <Input type="email" value={value.email} onChange={(e) => set('email', e.target.value)} />
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

      <Field label="Observações">
        <Textarea rows={3} value={value.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </div>
  )
}

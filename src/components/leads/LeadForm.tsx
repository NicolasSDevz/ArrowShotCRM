import { Field, Input, Select, Textarea } from '../ui/Field'
import { maskPhone, maskCurrencyInput } from '../../utils/masks'
import { ServicePicker } from '../clients/ServicePicker'
import { LEAD_SEGMENT_LABEL, LEAD_SOURCE_LABEL, type AppUser, type LeadSegment, type LeadSource } from '../../types'
import type { LeadFormState } from './leadFormState'
import { LeadCustomFields } from './LeadCustomFields'
import type { PipelineField } from '../../types'

export function LeadForm({
  value,
  onChange,
  users,
  pipelineFields = [],
}: {
  value: LeadFormState
  onChange: (next: LeadFormState) => void
  users: AppUser[]
  /** Campos extras do pipeline em que o lead está. */
  pipelineFields?: PipelineField[]
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
          <Input validate="phone" value={value.whatsapp} onChange={(e) => set('whatsapp', maskPhone(e.target.value))} placeholder="(00) 00000-0000" />
        </Field>
        <Field label="E-mail">
          <Input type="email" validate="email" value={value.email} onChange={(e) => set('email', e.target.value)} placeholder="nome@empresa.com" />
        </Field>
        <Field label="Cidade/Região">
          <Input value={value.cityRegion} onChange={(e) => set('cityRegion', e.target.value)} />
        </Field>
        <Field label="Segmento">
          <Select value={value.segment} onChange={(e) => set('segment', e.target.value as LeadSegment | '')}>
            <option value="">Não definido</option>
            {(Object.entries(LEAD_SEGMENT_LABEL) as [LeadSegment, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Origem do lead">
          <Select value={value.source} onChange={(e) => set('source', e.target.value as LeadSource)}>
            {(Object.entries(LEAD_SOURCE_LABEL) as [LeadSource, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
      </div>

      <section aria-labelledby="lead-services-title" className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <h3 id="lead-services-title" className="text-sm font-semibold text-slate-800">Serviços (interesse ou já fechado)</h3>
        <p className="mb-3 mt-0.5 text-xs text-slate-500">Ao virar cliente, as abas e tarefas de cada área são liberadas sozinhas.</p>
        <ServicePicker
          value={{ paidTraffic: value.paidTraffic, metaAds: value.metaAds, googleAds: value.googleAds, socialMedia: value.socialMedia, landingPage: value.landingPage }}
          onChange={(patch) => onChange({ ...value, ...patch })}
          platformRequired={false}
        />
        {(value.socialMedia || value.paidTraffic || value.landingPage) && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {value.socialMedia && (
              <Field label="Pacote (Social Mídia)">
                <Select value={value.socialMediaPackage} onChange={(e) => set('socialMediaPackage', e.target.value as 'weekly' | 'monthly')}>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                </Select>
              </Field>
            )}
            <Field label="Tempo de contrato">
              <Input value={value.contractedDuration} onChange={(e) => set('contractedDuration', e.target.value)} placeholder='Ex: "6 meses", "1 ano"' />
            </Field>
          </div>
        )}
      </section>

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

import { Field, Input, Select, Textarea } from '../ui/Field'
import { maskCurrencyInput, parseCurrencyToNumber } from '../../utils/masks'
import type { PipelineField } from '../../types'

type Values = Record<string, string | number | boolean | null>

/** Inputs dos campos extras de um pipeline — um por campo, conforme o tipo.
 *  Os valores ficam num objeto por id do campo (Lead.customFields). */
export function LeadCustomFields({ fields, values, onChange }: { fields: PipelineField[]; values: Values; onChange: (next: Values) => void }) {
  if (fields.length === 0) return null
  const set = (id: string, v: string | number | boolean | null) => onChange({ ...values, [id]: v })

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Campos do pipeline</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const raw = values[f.id]
          switch (f.type) {
            case 'long_text':
              return (
                <div key={f.id} className="sm:col-span-2">
                  <Field label={f.label}>
                    <Textarea rows={3} value={(raw as string) ?? ''} onChange={(e) => set(f.id, e.target.value)} />
                  </Field>
                </div>
              )
            case 'number':
              return (
                <Field key={f.id} label={f.label}>
                  <Input type="number" value={raw == null ? '' : String(raw)} onChange={(e) => set(f.id, e.target.value === '' ? null : Number(e.target.value))} />
                </Field>
              )
            case 'currency':
              return (
                <Field key={f.id} label={f.label}>
                  <Input
                    value={typeof raw === 'number' ? maskCurrencyInput(String(Math.round(raw * 100))) : ''}
                    onChange={(e) => {
                      const masked = maskCurrencyInput(e.target.value)
                      set(f.id, masked ? (parseCurrencyToNumber(masked) ?? null) : null)
                    }}
                    placeholder="R$ 0,00"
                  />
                </Field>
              )
            case 'date':
              return (
                <Field key={f.id} label={f.label}>
                  <Input type="date" value={(raw as string) ?? ''} onChange={(e) => set(f.id, e.target.value || null)} />
                </Field>
              )
            case 'select':
              return (
                <Field key={f.id} label={f.label}>
                  <Select value={(raw as string) ?? ''} onChange={(e) => set(f.id, e.target.value || null)}>
                    <option value="">—</option>
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                </Field>
              )
            case 'checkbox':
              return (
                <label key={f.id} className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!raw}
                    onChange={(e) => set(f.id, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                  />
                  {f.label}
                </label>
              )
            case 'link':
              return (
                <Field key={f.id} label={f.label}>
                  <Input type="url" value={(raw as string) ?? ''} onChange={(e) => set(f.id, e.target.value)} placeholder="https://" />
                </Field>
              )
            default:
              return (
                <Field key={f.id} label={f.label}>
                  <Input value={(raw as string) ?? ''} onChange={(e) => set(f.id, e.target.value)} />
                </Field>
              )
          }
        })}
      </div>
    </div>
  )
}

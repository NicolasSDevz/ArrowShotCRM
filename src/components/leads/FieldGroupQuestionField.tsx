import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fetchAddressByCep } from '../../services/viaCepService'
import { isCepComplete, maskCep, maskPhone } from '../../utils/masks'
import type { LeadFormSubfield } from '../../types/leadForm'

const WIDTH_CLASS: Record<NonNullable<LeadFormSubfield['width']>, string> = {
  full: 'col-span-6',
  half: 'col-span-6 sm:col-span-3',
  third: 'col-span-3 sm:col-span-2',
}

const INPUT_TYPE: Record<LeadFormSubfield['type'], string> = {
  text: 'text',
  number: 'number',
  time: 'time',
  date: 'date',
  phone: 'tel',
  email: 'email',
  cep: 'text',
}

/** Pergunta de "vários campos" na página do formulário — os campos que o
 *  admin montou (endereço, horário de funcionamento, dados da empresa…). O
 *  valor é um string[] com uma posição por campo, na ordem de `subfields`.
 *  Um campo do tipo CEP busca o endereço e preenche os campos marcados como
 *  Rua/Bairro/Cidade/Estado. */
export function FieldGroupQuestionField({
  subfields,
  value,
  onChange,
  autoFocus,
  missingIds,
}: {
  subfields: LeadFormSubfield[]
  value: string[]
  onChange: (v: string[]) => void
  autoFocus: boolean
  /** Campos obrigatórios que ficaram em branco ao tentar avançar. */
  missingIds: Set<string>
}) {
  const [loadingCep, setLoadingCep] = useState(false)
  const at = (i: number) => value[i] ?? ''
  const withValue = (base: string[], i: number, v: string) => {
    const next = subfields.map((_, idx) => base[idx] ?? '')
    next[i] = v
    return next
  }

  const handleCep = async (i: number, raw: string) => {
    const masked = maskCep(raw)
    let next = withValue(value, i, masked)
    onChange(next)
    if (!isCepComplete(masked)) return
    setLoadingCep(true)
    const found = await fetchAddressByCep(masked)
    setLoadingCep(false)
    if (!found) return
    subfields.forEach((f, idx) => {
      const v = f.fill ? found[f.fill] : ''
      if (v) next = withValue(next, idx, v)
    })
    onChange(next)
  }

  return (
    <div className="grid grid-cols-6 gap-2.5">
      {subfields.map((f, i) => {
        const invalid = missingIds.has(f.id)
        return (
          <label key={f.id} className={`block ${WIDTH_CLASS[f.width ?? 'full']}`}>
            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
              {f.label || 'Campo'}
              {f.required && <span className="text-red-400">*</span>}
              {f.type === 'cep' && loadingCep && <Loader2 size={12} className="animate-spin" />}
            </span>
            <input
              autoFocus={autoFocus && i === 0}
              type={INPUT_TYPE[f.type]}
              inputMode={f.type === 'cep' ? 'numeric' : undefined}
              placeholder={f.placeholder || (f.type === 'cep' ? '00000-000' : undefined)}
              value={at(i)}
              onChange={(e) =>
                f.type === 'cep'
                  ? void handleCep(i, e.target.value)
                  : onChange(withValue(value, i, f.type === 'phone' ? maskPhone(e.target.value) : e.target.value))
              }
              className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${
                invalid ? 'border-red-300' : 'border-slate-200'
              }`}
            />
          </label>
        )
      })}
    </div>
  )
}

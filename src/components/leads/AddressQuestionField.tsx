import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fetchAddressByCep } from '../../services/viaCepService'
import { isCepComplete, maskCep } from '../../utils/masks'
import { ADDRESS_PART_LABEL, ADDRESS_PARTS, type AddressPart } from '../../types/leadForm'

/** Pergunta do tipo Endereço na página do formulário: CEP, rua, número,
 *  complemento, bairro, cidade e estado. Ao completar o CEP, busca no ViaCEP
 *  e preenche rua/bairro/cidade/estado (a pessoa ainda pode corrigir). O
 *  valor é um string[] na ordem de ADDRESS_PARTS. */
export function AddressQuestionField({
  value,
  onChange,
  autoFocus,
  invalid,
}: {
  value: string[]
  onChange: (v: string[]) => void
  autoFocus: boolean
  invalid: boolean
}) {
  const [loading, setLoading] = useState(false)
  const get = (p: AddressPart) => value[ADDRESS_PARTS.indexOf(p)] ?? ''
  const withPart = (base: string[], p: AddressPart, v: string) => {
    const next = ADDRESS_PARTS.map((_, i) => base[i] ?? '')
    next[ADDRESS_PARTS.indexOf(p)] = v
    return next
  }

  const handleCep = async (raw: string) => {
    const masked = maskCep(raw)
    let next = withPart(value, 'cep', masked)
    onChange(next)
    if (!isCepComplete(masked)) return
    setLoading(true)
    const found = await fetchAddressByCep(masked)
    setLoading(false)
    if (!found) return
    if (found.street) next = withPart(next, 'street', found.street)
    if (found.neighborhood) next = withPart(next, 'neighborhood', found.neighborhood)
    if (found.city) next = withPart(next, 'city', found.city)
    if (found.state) next = withPart(next, 'state', found.state)
    onChange(next)
  }

  const inputClass = `w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${
    invalid ? 'border-red-300' : 'border-slate-200'
  }`
  const field = (p: AddressPart, extra: { placeholder?: string; className?: string; inputMode?: 'numeric' } = {}) => (
    <label className={`block ${extra.className ?? ''}`}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{ADDRESS_PART_LABEL[p]}</span>
      <input
        className={inputClass}
        value={get(p)}
        inputMode={extra.inputMode}
        placeholder={extra.placeholder}
        onChange={(e) => onChange(withPart(value, p, e.target.value))}
      />
    </label>
  )

  return (
    <div className="grid grid-cols-6 gap-2.5">
      <label className="col-span-6 block sm:col-span-3">
        <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          CEP {loading && <Loader2 size={12} className="animate-spin" />}
        </span>
        <input
          autoFocus={autoFocus}
          className={inputClass}
          value={get('cep')}
          inputMode="numeric"
          placeholder="00000-000"
          onChange={(e) => void handleCep(e.target.value)}
        />
      </label>
      {field('street', { className: 'col-span-6', placeholder: 'Nome da rua' })}
      {field('number', { className: 'col-span-2', placeholder: 'Nº' })}
      {field('complement', { className: 'col-span-4', placeholder: 'Apto, bloco… (opcional)' })}
      {field('neighborhood', { className: 'col-span-6 sm:col-span-3' })}
      {field('city', { className: 'col-span-4 sm:col-span-2' })}
      {field('state', { className: 'col-span-2 sm:col-span-1', placeholder: 'UF' })}
    </div>
  )
}

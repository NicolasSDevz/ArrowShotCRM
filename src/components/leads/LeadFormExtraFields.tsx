import { useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import type { LeadFormTheme } from './leadFormUtils'

/** Campos dos tipos de resposta "Lista" e "Confirmação" (também usada no "Arquivo pelo Drive") na página
 *  do formulário (os demais tipos ficam no próprio LeadFormRenderer). */

export function ListAnswerField({
  value,
  onChange,
  placeholder,
  addLabel,
  autoFocus,
  invalid,
  inputClass,
  theme,
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  addLabel?: string
  autoFocus: boolean
  invalid: boolean
  inputClass: string
  theme: LeadFormTheme
}) {
  const items = value.length > 0 ? value : ['']
  const [focusIndex, setFocusIndex] = useState<number | null>(autoFocus ? 0 : null)
  const set = (i: number, v: string) => onChange(items.map((x, idx) => (idx === i ? v : x)))
  const add = () => {
    onChange([...items, ''])
    setFocusIndex(items.length)
  }
  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i)
    onChange(next.length ? next : [''])
    setFocusIndex(Math.max(0, i - 1))
  }
  const canAdd = items[items.length - 1]?.trim() !== ''

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-center text-xs text-slate-400" style={theme.text ? { color: theme.text, opacity: 0.6 } : undefined}>
            {i + 1}.
          </span>
          <input
            autoFocus={focusIndex === i}
            className={`${inputClass} ${invalid && !item.trim() ? 'border-red-300' : ''}`}
            value={item}
            placeholder={placeholder || 'Escreva aqui'}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => {
              // Enter no último item preenchido abre o próximo (em vez de avançar a pergunta).
              if (e.key === 'Enter') {
                e.preventDefault()
                if (item.trim() && i === items.length - 1) add()
                else setFocusIndex(i + 1)
              }
            }}
          />
          {items.length > 1 && (
            <button type="button" onClick={() => remove(i)} aria-label="Remover" className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-500">
              <X size={15} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={!canAdd}
        className="ml-7 flex w-fit items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-40"
        style={{ borderColor: theme.primary, color: theme.primary }}
      >
        <Plus size={14} /> {addLabel?.trim() || 'Adicionar outro'}
      </button>
    </div>
  )
}

export function ConfirmAnswerField({
  checked,
  label,
  onChange,
  invalid,
  theme,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
  invalid: boolean
  theme: LeadFormTheme
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm transition-colors ${checked ? '' : invalid ? 'border-red-300' : 'border-slate-200'}`}
      style={checked ? { borderColor: theme.primary, background: `${theme.primary}1A`, color: theme.primary } : theme.text ? { color: theme.text } : undefined}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? '' : 'border-slate-300 bg-white'}`}
        style={checked ? { borderColor: theme.primary, background: theme.primary } : undefined}
      >
        {checked && <Check size={13} strokeWidth={3} style={{ color: theme.buttonText }} />}
      </span>
      <span className="font-medium">{label}</span>
    </button>
  )
}

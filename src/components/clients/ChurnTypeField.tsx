import { useId } from 'react'
import { CHURN_TYPE_DESCRIPTION, CHURN_TYPE_LABEL, type ChurnType } from '../../types/client'

const TYPES: ChurnType[] = ['voluntary', 'involuntary', 'early']

/** Escolha do tipo de churn ao encerrar um cliente + se ele entra no Churn
 *  Rate. Radios nativos (leitor de tela lê nome e descrição de cada um). */
export function ChurnTypeField({
  value,
  counts,
  suggestedEarly,
  contractDays,
  onChange,
  onCountsChange,
}: {
  value: ChurnType | ''
  counts: boolean
  suggestedEarly: boolean
  contractDays: number | null
  onChange: (type: ChurnType) => void
  onCountsChange: (counts: boolean) => void
}) {
  const name = useId()
  return (
    <div className="flex flex-col gap-3">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-800">
          Tipo de churn <span className="text-red-500">*</span>
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TYPES.map((t) => {
            const checked = value === t
            const descId = `${name}-${t}-desc`
            return (
              <label
                key={t}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors ${
                  checked ? 'border-red-400 bg-white ring-2 ring-red-100' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={name}
                    value={t}
                    checked={checked}
                    onChange={() => onChange(t)}
                    aria-describedby={descId}
                    className="h-4 w-4 border-slate-300 text-red-600 focus:ring-red-400"
                  />
                  <span className="text-sm font-semibold text-slate-800">{CHURN_TYPE_LABEL[t]}</span>
                </span>
                <span id={descId} className="text-xs leading-snug text-slate-500">
                  {CHURN_TYPE_DESCRIPTION[t]}
                </span>
                {t === 'early' && suggestedEarly && contractDays != null && (
                  <span className="text-xs font-medium text-amber-700">Sugerido: contrato com {contractDays} dias.</span>
                )}
              </label>
            )
          })}
        </div>
      </fieldset>

      {value && (
        <label className="flex items-start gap-2 rounded-lg bg-white p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={counts}
            onChange={(e) => onCountsChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-400"
          />
          <span>
            <span className="font-semibold">Contar no Churn Rate do CRM</span>
            <span className="block text-xs text-slate-500">
              {counts
                ? 'Este encerramento entra na taxa de cancelamento do Dashboard.'
                : 'O cliente fica como Encerrado, mas não entra na taxa de cancelamento (a receita perdida continua contando).'}
            </span>
          </span>
        </label>
      )}
    </div>
  )
}

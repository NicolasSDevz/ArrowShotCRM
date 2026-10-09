import { Plus, Trash2 } from 'lucide-react'

/** Lista simples de textos (benefícios etc.) com adicionar/remover. */
export function TextListEditor({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-slate-500">{label}</legend>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-1.5">
            <input
              aria-label={`${label} ${i + 1}`}
              value={item}
              placeholder={placeholder}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              className="h-9 flex-1 rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:border-brand-600"
            />
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="rounded-lg px-2 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Remover ${label} ${i + 1}`}>
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onChange([...items, ''])} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
        <Plus size={13} /> Adicionar
      </button>
    </fieldset>
  )
}

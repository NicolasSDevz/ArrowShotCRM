import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react'
import { Input, Select } from '../ui/Field'
import { CEP_FILL_LABEL, FIELD_GROUP_PRESETS, SUBFIELD_TYPE_LABEL, SUBFIELD_WIDTH_LABEL, newSubfield } from './leadFormFieldGroups'
import type { LeadFormSubfield, LeadFormSubfieldType } from '../../types/leadForm'
import { askConfirm } from '../../utils/confirmDialog'

/** Editor dos campos de uma pergunta de "vários campos": o admin monta a
 *  lista (nome, tipo, largura, obrigatório) ou parte de um modelo pronto. */
export function FieldGroupEditor({ subfields, onChange }: { subfields: LeadFormSubfield[]; onChange: (next: LeadFormSubfield[]) => void }) {
  const hasCep = subfields.some((f) => f.type === 'cep')
  const update = (id: string, patch: Partial<LeadFormSubfield>) => onChange(subfields.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  const move = (i: number, dir: -1 | 1) => {
    const to = i + dir
    if (to < 0 || to >= subfields.length) return
    const next = [...subfields]
    ;[next[i], next[to]] = [next[to], next[i]]
    onChange(next)
  }
  const applyPreset = async (key: string) => {
    const preset = FIELD_GROUP_PRESETS.find((p) => p.key === key)
    if (!preset) return
    if (subfields.some((f) => f.label.trim()) && !(await askConfirm({ title: `Trocar os campos atuais pelo modelo "${preset.name}"?`, message: 'Os campos que você já montou nesta pergunta são substituídos.', confirmLabel: 'Trocar' }))) return
    onChange(preset.make())
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-400">Usar modelo:</span>
        {FIELD_GROUP_PRESETS.filter((p) => p.key !== 'custom').map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.key)}
            className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:ring-brand-300"
          >
            {p.name}
          </button>
        ))}
      </div>

      {subfields.map((f, i) => (
        <div key={f.id} className="flex flex-col gap-1.5 rounded-lg border border-slate-200 p-2">
          <div className="flex items-center gap-1.5">
            <Input value={f.label} onChange={(e) => update(f.id, { label: e.target.value })} placeholder="Nome do campo (ex: Abre às)" className="flex-1" />
            <button type="button" title="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
              <ArrowUp size={13} />
            </button>
            <button type="button" title="Descer" disabled={i === subfields.length - 1} onClick={() => move(i, 1)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
              <ArrowDown size={13} />
            </button>
            <button
              type="button"
              title="Excluir campo"
              disabled={subfields.length <= 1}
              onClick={() => onChange(subfields.filter((x) => x.id !== f.id))}
              className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Select value={f.type} onChange={(e) => update(f.id, { type: e.target.value as LeadFormSubfieldType })} className="text-xs">
              {(Object.entries(SUBFIELD_TYPE_LABEL) as [LeadFormSubfieldType, string][]).map(([t, l]) => (
                <option key={t} value={t}>
                  {l}
                </option>
              ))}
            </Select>
            <Select value={f.width ?? 'full'} onChange={(e) => update(f.id, { width: e.target.value as LeadFormSubfield['width'] })} className="text-xs">
              {Object.entries(SUBFIELD_WIDTH_LABEL).map(([w, l]) => (
                <option key={w} value={w}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={!!f.required} onChange={(e) => update(f.id, { required: e.target.checked })} className="h-3.5 w-3.5 rounded border-slate-300" />
              Obrigatório
            </label>
            {hasCep && f.type !== 'cep' && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                Preencher pelo CEP:
                <select
                  value={f.fill ?? ''}
                  onChange={(e) => update(f.id, { fill: (e.target.value || undefined) as LeadFormSubfield['fill'] })}
                  className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs"
                >
                  <option value="">Não</option>
                  {Object.entries(CEP_FILL_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <Input value={f.placeholder ?? ''} onChange={(e) => update(f.id, { placeholder: e.target.value || undefined })} placeholder="Texto de exemplo dentro do campo (opcional)" className="text-xs" />
        </div>
      ))}

      <button type="button" onClick={() => onChange([...subfields, newSubfield()])} className="flex w-fit items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
        <Plus size={12} /> Adicionar campo
      </button>
    </div>
  )
}

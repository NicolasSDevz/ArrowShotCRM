import { Input, Select } from '../ui/Field'
import { CONTENT_FORMAT_LABEL, CONTENT_TYPE_LABEL } from '../../types/content'
import { DEFAULT_SOCIAL_PLANS, PLAN_FORMATS, WEEKDAY_LABEL, type SocialPlan } from '../../types/socialPlan'

/** Escolha do plano (2x ou 3x por semana) e da grade fixa de dias e formatos. */
export function SocialPlanEditor({ value, onChange }: { value: SocialPlan | null; onChange: (plan: SocialPlan | null) => void }) {
  const setSlot = (i: number, patch: Partial<SocialPlan['slots'][number]>) => {
    if (!value) return
    onChange({ ...value, slots: value.slots.map((s, k) => (k === i ? { ...s, ...patch } : s)) })
  }

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={value ? String(value.postsPerWeek) : ''}
        onChange={(e) => {
          const n = e.target.value
          onChange(n ? structuredClone(DEFAULT_SOCIAL_PLANS[Number(n) as 2 | 3]) : null)
        }}
      >
        <option value="">Sem plano definido</option>
        <option value="3">3 posts por semana (estático, carrossel e reels)</option>
        <option value="2">2 posts por semana (carrossel e reels)</option>
      </Select>

      {value && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 p-2.5">
          {value.slots.map((slot, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <Select value={slot.weekday} onChange={(e) => setSlot(i, { weekday: Number(e.target.value) })}>
                {WEEKDAY_LABEL.map((l, d) => (
                  <option key={d} value={d}>
                    {l}
                  </option>
                ))}
              </Select>
              <Select value={slot.type} onChange={(e) => setSlot(i, { type: e.target.value as typeof slot.type })}>
                {PLAN_FORMATS.map((t) => (
                  <option key={t} value={t}>
                    {CONTENT_FORMAT_LABEL[t] ?? CONTENT_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          <label className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            Horário padrão
            <Input
              type="time"
              value={value.time ?? ''}
              onChange={(e) => onChange({ ...value, time: e.target.value || undefined })}
              className="w-28"
            />
          </label>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { Flame, Snowflake, ThermometerSun, Ban } from 'lucide-react'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Field'
import { useAuth } from '../../context/AuthContext'
import { updateLead } from '../../services/leadService'
import {
  BANT_CRITERIA,
  BANT_LEVEL_LABEL,
  LEAD_TEMPERATURE_ACTION,
  LEAD_TEMPERATURE_LABEL,
  LEAD_TEMPERATURE_RANGE,
  bantTotal,
  leadTemperature,
  type BantScore,
  type Lead,
  type LeadBant,
  type LeadTemperature,
} from '../../types'

const TEMP_STYLE: Record<LeadTemperature, { box: string; text: string; icon: typeof Flame }> = {
  hot: { box: 'border-red-200 bg-red-50', text: 'text-red-700', icon: Flame },
  warm: { box: 'border-amber-200 bg-amber-50', text: 'text-amber-700', icon: ThermometerSun },
  cold: { box: 'border-blue-200 bg-blue-50', text: 'text-blue-700', icon: Snowflake },
  disqualified: { box: 'border-slate-200 bg-slate-100', text: 'text-slate-600', icon: Ban },
}

const LEVEL_SELECTED = ['border-slate-400 bg-slate-100 text-slate-800', 'border-red-300 bg-red-50 text-red-700', 'border-amber-300 bg-amber-50 text-amber-700', 'border-emerald-400 bg-emerald-50 text-emerald-700']

/** Aba "Qualificação (BANT)" do lead: o comercial (Bruno) dá nota de 0 a 3
 *  em Budget, Authority, Need e Timing; o total define Quente / Morno / Frio. */
export function LeadBantTab({ lead }: { lead: Lead }) {
  const { profile } = useAuth()
  const [bant, setBant] = useState<LeadBant>(() => ({ ...lead.bant }))
  const [saving, setSaving] = useState(false)

  const total = bantTotal(bant)
  const partial = BANT_CRITERIA.reduce((s, c) => s + (bant[c.key] ?? 0), 0)
  const answered = BANT_CRITERIA.filter((c) => bant[c.key] != null).length
  const temp = leadTemperature(bant)

  const setScore = (key: (typeof BANT_CRITERIA)[number]['key'], v: BantScore) => setBant((b) => ({ ...b, [key]: v }))

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    try {
      await updateLead(
        lead.id,
        { bant: { ...bant, note: bant.note?.trim() || undefined, scoredAt: Timestamp.now(), scoredBy: profile.id } },
        profile.id,
        profile.name
      )
      toast.success(temp ? `Lead classificado como ${LEAD_TEMPERATURE_LABEL[temp]}` : 'Qualificação salva')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar a qualificação')
    } finally {
      setSaving(false)
    }
  }

  const style = temp ? TEMP_STYLE[temp] : null
  const Icon = style?.icon

  return (
    <div className="flex flex-col gap-4">
      {/* Resultado */}
      <div className={`flex items-center gap-4 rounded-xl border p-4 ${style ? style.box : 'border-slate-200 bg-slate-50'}`} aria-live="polite">
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-white shadow-sm">
          <span className={`text-2xl font-extrabold leading-none ${style ? style.text : 'text-slate-400'}`}>{total ?? partial}</span>
          <span className="text-[10px] font-semibold text-slate-400">de 12</span>
        </div>
        <div className="min-w-0">
          {temp && Icon ? (
            <>
              <p className={`flex items-center gap-1.5 text-lg font-bold ${style!.text}`}>
                <Icon size={18} aria-hidden="true" /> {LEAD_TEMPERATURE_LABEL[temp]}
                <span className="text-xs font-medium opacity-70">({LEAD_TEMPERATURE_RANGE[temp]})</span>
              </p>
              <p className="text-sm text-slate-600">{LEAD_TEMPERATURE_ACTION[temp]}</p>
            </>
          ) : (
            <>
              <p className="text-base font-bold text-slate-700">Ainda não classificado</p>
              <p className="text-sm text-slate-500">Dê nota nas 4 letras ({answered} de 4 feitas). Quente 9 a 12, Morno 6 a 8, Frio 0 a 5.</p>
            </>
          )}
        </div>
      </div>

      {/* Scorecard */}
      {BANT_CRITERIA.map((c) => {
        const value = bant[c.key]
        return (
          <fieldset key={c.key} className="rounded-xl border border-slate-200 p-3">
            <legend className="px-1">
              <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white" aria-hidden="true">
                {c.letter}
              </span>
              <span className="text-sm font-semibold text-slate-800">{c.label}</span>
              <span className="ml-1.5 text-xs text-slate-500">{c.question}</span>
            </legend>
            <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {c.levels.map((desc, i) => {
                const selected = value === i
                return (
                  <label
                    key={i}
                    className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      selected ? LEVEL_SELECTED[i] : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`bant-${lead.id}-${c.key}`}
                      checked={selected}
                      onChange={() => setScore(c.key, i as BantScore)}
                      className="sr-only"
                    />
                    <span className="text-xs font-bold">
                      {i} · {BANT_LEVEL_LABEL[i]}
                    </span>
                    <span className="text-[11px] leading-snug opacity-90">{desc}</span>
                  </label>
                )
              })}
            </div>
            {(c.key === 'budget' || c.key === 'authority') && value === 0 && (
              <p className="mt-2 text-xs font-medium text-slate-600">Nota zero aqui desqualifica o lead (regra de ouro).</p>
            )}
          </fieldset>
        )
      })}

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-slate-500">Observações da qualificação</span>
        <Textarea
          rows={2}
          value={bant.note ?? ''}
          onChange={(e) => setBant((b) => ({ ...b, note: e.target.value }))}
          placeholder="Ex: verba de R$ 1.500/mês, sócio decide junto, quer começar em novembro..."
        />
      </label>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saving}>
          Salvar qualificação
        </Button>
        {lead.bant?.scoredAt && (
          <span className="text-xs text-slate-400">Última avaliação em {lead.bant.scoredAt.toDate().toLocaleDateString('pt-BR')}</span>
        )}
      </div>
    </div>
  )
}

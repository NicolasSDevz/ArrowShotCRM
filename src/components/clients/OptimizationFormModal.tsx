import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Field, Input, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { createOptimization, updateOptimization } from '../../services/optimizationService'
import { dateInputToTimestamp, timestampToDateInput } from '../../utils/dateInput'
import { maskCurrencyInput, parseCurrencyToNumber } from '../../utils/masks'
import {
  OPTIMIZATION_SUGGESTIONS,
  OPTIMIZATION_PLATFORM_LABEL,
  type Optimization,
  type OptimizationPlatform,
} from '../../types'

function todayInput() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function OptimizationFormModal({
  open,
  onClose,
  clientId,
  optimization,
  defaultPlatforms,
}: {
  open: boolean
  onClose: () => void
  clientId: string
  /** Quando setado, edita este registro. */
  optimization?: Optimization | null
  defaultPlatforms?: OptimizationPlatform[]
}) {
  const { profile } = useAuth()
  const [dateStr, setDateStr] = useState(todayInput())
  const [platforms, setPlatforms] = useState<OptimizationPlatform[]>(defaultPlatforms ?? ['meta', 'google'])
  const [text, setText] = useState('')
  const [notes, setNotes] = useState('')
  const [metaBalance, setMetaBalance] = useState('')
  const [googleBalance, setGoogleBalance] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (optimization) {
      setDateStr(timestampToDateInput(optimization.date))
      setPlatforms(optimization.platforms.length ? optimization.platforms : ['meta'])
      setText(optimization.optimizationsText)
      setNotes(optimization.notes ?? '')
      setMetaBalance(optimization.metaBalance != null ? maskCurrencyInput(String(Math.round(optimization.metaBalance * 100))) : '')
      setGoogleBalance(optimization.googleBalance != null ? maskCurrencyInput(String(Math.round(optimization.googleBalance * 100))) : '')
    } else {
      setDateStr(todayInput())
      setPlatforms(defaultPlatforms ?? ['meta', 'google'])
      setText('')
      setNotes('')
      setMetaBalance('')
      setGoogleBalance('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, optimization])

  const togglePlatform = (p: OptimizationPlatform) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))

  const addSuggestion = (s: string) =>
    setText((prev) => (prev.trim() ? `${prev.trim()}\n${s}` : s))

  const handleSave = async () => {
    if (!profile) return
    if (!text.trim()) {
      toast.error('Descreva o que foi otimizado (ou use "Sem otimização necessária").')
      return
    }
    const dateTs = dateInputToTimestamp(dateStr)
    if (!dateTs) {
      toast.error('Informe a data.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        clientId,
        date: dateTs,
        platforms,
        optimizationsText: text.trim(),
        notes: notes.trim() || undefined,
        metaBalance: platforms.includes('meta') ? parseCurrencyToNumber(metaBalance) : undefined,
        googleBalance: platforms.includes('google') ? parseCurrencyToNumber(googleBalance) : undefined,
        responsavelId: optimization?.responsavelId ?? profile.id,
        responsavelName: optimization?.responsavelName ?? profile.name,
      }
      if (optimization) {
        await updateOptimization(optimization.id, payload, profile.id)
        toast.success('Otimização atualizada')
      } else {
        await createOptimization(payload, profile.id, profile.name)
        toast.success('Otimização registrada')
      }
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar a otimização')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={optimization ? 'Editar otimização' : 'Registrar otimização'} width="max-w-xl">
      <div className="flex flex-col gap-3">
        <Field label="Data" required>
          <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </Field>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-500">Plataforma</span>
          <div className="flex gap-4">
            {(['meta', 'google'] as OptimizationPlatform[]).map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={platforms.includes(p)}
                  onChange={() => togglePlatform(p)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                />
                {OPTIMIZATION_PLATFORM_LABEL[p]}
              </label>
            ))}
          </div>
        </div>

        <Field label="Otimizações realizadas" required>
          <Textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Descreva o que foi otimizado..."
          />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {OPTIMIZATION_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addSuggestion(s)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              {s}
            </button>
          ))}
        </div>

        <Field label="Observações">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          {platforms.includes('meta') && (
            <Field label="Saldo Meta Ads (R$)">
              <Input value={metaBalance} onChange={(e) => setMetaBalance(maskCurrencyInput(e.target.value))} placeholder="R$ 0,00" />
            </Field>
          )}
          {platforms.includes('google') && (
            <Field label="Saldo Google Ads (R$)">
              <Input value={googleBalance} onChange={(e) => setGoogleBalance(maskCurrencyInput(e.target.value))} placeholder="R$ 0,00" />
            </Field>
          )}
        </div>

        <p className="text-xs text-slate-400">
          Responsável: <span className="font-medium text-slate-600">{optimization?.responsavelName ?? profile?.name ?? '—'}</span>
        </p>

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!text.trim()}>Salvar otimização</Button>
        </div>
      </div>
    </Modal>
  )
}

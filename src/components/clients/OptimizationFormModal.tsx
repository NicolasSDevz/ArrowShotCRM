import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Field, Input, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { createOptimization, updateOptimization } from '../../services/optimizationService'
import { dateInputToTimestamp, timestampToDateInput } from '../../utils/dateInput'
import { maskCurrencyInput, parseCurrencyToNumber } from '../../utils/masks'
import { OPTIMIZATION_SUGGESTIONS_BY_PLATFORM, type Optimization, type OptimizationPlatform } from '../../types'

function todayInput() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const centsMask = (n?: number) => (n != null ? maskCurrencyInput(String(Math.round(n * 100))) : '')

export function OptimizationFormModal({
  open,
  onClose,
  clientId,
  optimization,
  availablePlatforms,
}: {
  open: boolean
  onClose: () => void
  clientId: string
  /** Quando setado, edita este registro. */
  optimization?: Optimization | null
  /** Plataformas contratadas pelo cliente — ['meta'] | ['google'] | ambas.
   *  1 plataforma: formulário simples. 2: duas seções (Meta / Google). */
  availablePlatforms?: OptimizationPlatform[]
}) {
  const { profile } = useAuth()
  const avail: OptimizationPlatform[] = availablePlatforms?.length ? availablePlatforms : ['meta', 'google']
  const showMeta = avail.includes('meta')
  const showGoogle = avail.includes('google')
  const both = showMeta && showGoogle

  const [dateStr, setDateStr] = useState(todayInput())
  const [metaText, setMetaText] = useState('')
  const [googleText, setGoogleText] = useState('')
  const [metaNotes, setMetaNotes] = useState('')
  const [googleNotes, setGoogleNotes] = useState('')
  const [metaBalance, setMetaBalance] = useState('')
  const [googleBalance, setGoogleBalance] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (optimization) {
      const o = optimization
      setDateStr(timestampToDateInput(o.date))
      // registro por-plataforma novo, senão cai pro campo legado conforme a
      // plataforma daquele registro
      const legacyIsMeta = o.platforms.includes('meta')
      const legacyIsGoogle = o.platforms.includes('google')
      setMetaText(o.metaOptimizationsText ?? (legacyIsMeta && !legacyIsGoogle ? o.optimizationsText : legacyIsMeta ? o.optimizationsText : ''))
      setGoogleText(o.googleOptimizationsText ?? (legacyIsGoogle && !legacyIsMeta ? o.optimizationsText : legacyIsGoogle ? o.optimizationsText : ''))
      setMetaNotes(o.metaNotes ?? (legacyIsMeta ? (o.notes ?? '') : ''))
      setGoogleNotes(o.googleNotes ?? (legacyIsGoogle ? (o.notes ?? '') : ''))
      setMetaBalance(centsMask(o.metaBalance))
      setGoogleBalance(centsMask(o.googleBalance))
    } else {
      setDateStr(todayInput())
      setMetaText('')
      setGoogleText('')
      setMetaNotes('')
      setGoogleNotes('')
      setMetaBalance('')
      setGoogleBalance('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, optimization])

  const addSuggestion = (which: 'meta' | 'google', s: string) => {
    const setter = which === 'meta' ? setMetaText : setGoogleText
    setter((prev) => (prev.trim() ? `${prev.trim()}\n${s}` : s))
  }

  const handleSave = async () => {
    if (!profile) return
    const metaFilled = showMeta && metaText.trim()
    const googleFilled = showGoogle && googleText.trim()
    if (!metaFilled && !googleFilled) {
      toast.error('Descreva o que foi otimizado em pelo menos uma plataforma.')
      return
    }
    const dateTs = dateInputToTimestamp(dateStr)
    if (!dateTs) {
      toast.error('Informe a data.')
      return
    }

    const platforms: OptimizationPlatform[] = []
    if (metaFilled) platforms.push('meta')
    if (googleFilled) platforms.push('google')

    // texto combinado (fallback pra telas antigas / exclusão em cascata)
    const combined = both
      ? [metaFilled && `Meta Ads:\n${metaText.trim()}`, googleFilled && `Google Ads:\n${googleText.trim()}`]
          .filter(Boolean)
          .join('\n\n')
      : (metaFilled ? metaText.trim() : googleText.trim())

    setSaving(true)
    try {
      const payload = {
        clientId,
        date: dateTs,
        platforms,
        optimizationsText: combined,
        notes: both ? undefined : (metaFilled ? metaNotes.trim() : googleNotes.trim()) || undefined,
        metaOptimizationsText: metaFilled ? metaText.trim() : undefined,
        googleOptimizationsText: googleFilled ? googleText.trim() : undefined,
        metaNotes: metaFilled && metaNotes.trim() ? metaNotes.trim() : undefined,
        googleNotes: googleFilled && googleNotes.trim() ? googleNotes.trim() : undefined,
        metaBalance: metaFilled ? parseCurrencyToNumber(metaBalance) : undefined,
        googleBalance: googleFilled ? parseCurrencyToNumber(googleBalance) : undefined,
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

  const platformSection = (
    which: 'meta' | 'google',
    text: string,
    setText: (v: string) => void,
    notes: string,
    setNotes: (v: string) => void,
    balance: string,
    setBalance: (v: string) => void,
  ) => {
    const label = which === 'meta' ? 'Meta Ads' : 'Google Ads'
    const badge = which === 'meta' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
    return (
      <div className={both ? 'rounded-lg border border-slate-200 p-3' : ''}>
        {both && (
          <span className={`mb-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge}`}>{label}</span>
        )}
        <div className="flex flex-col gap-3">
          <Field label="Otimizações realizadas" required>
            <Textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`O que foi otimizado no ${label}...`}
            />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {OPTIMIZATION_SUGGESTIONS_BY_PLATFORM[which].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addSuggestion(which, s)}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Saldo ${label} (R$)`}>
              <Input value={balance} onChange={(e) => setBalance(maskCurrencyInput(e.target.value))} placeholder="R$ 0,00" />
            </Field>
          </div>
          <Field label={`Observações ${both ? label.split(' ')[0] : ''}`.trim()}>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </div>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={optimization ? 'Editar otimização' : 'Registrar otimização'} width="max-w-xl">
      <div className="flex flex-col gap-3">
        <Field label="Data" required>
          <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </Field>

        {both && (
          <p className="text-xs text-slate-400">
            Este cliente tem Meta Ads e Google Ads — preencha as seções das plataformas que otimizou hoje.
          </p>
        )}

        <div className="flex flex-col gap-4">
          {showMeta &&
            platformSection('meta', metaText, setMetaText, metaNotes, setMetaNotes, metaBalance, setMetaBalance)}
          {showGoogle &&
            platformSection('google', googleText, setGoogleText, googleNotes, setGoogleNotes, googleBalance, setGoogleBalance)}
        </div>

        <p className="text-xs text-slate-400">
          Responsável: <span className="font-medium text-slate-600">{optimization?.responsavelName ?? profile?.name ?? '—'}</span>
        </p>

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Salvar otimização</Button>
        </div>
      </div>
    </Modal>
  )
}

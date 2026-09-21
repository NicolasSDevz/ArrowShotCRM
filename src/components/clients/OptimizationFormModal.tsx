import { useEffect, useState } from 'react'
import { format } from 'date-fns'
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
   *  1 plataforma: uma seção, um botão. 2: duas seções independentes, cada
   *  uma com seu próprio botão "Salvar" — salvar uma NUNCA mexe nem apaga o
   *  que já estava salvo na outra (ver handleSaveSingle). */
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
  const [savingWhich, setSavingWhich] = useState<'meta' | 'google' | null>(null)
  // Registro que as gravações desta sessão vão atualizar — começa como o
  // registro sendo editado (se houver) e passa a apontar pro registro recém
  // criado assim que a 1ª plataforma é salva, pra a 2ª (se vier em seguida,
  // no mesmo modal aberto) atualizar o MESMO doc em vez de criar outro.
  const [activeRecordId, setActiveRecordId] = useState<string | undefined>(optimization?.id)
  const [metaSavedAt, setMetaSavedAt] = useState<Date | null>(null)
  const [googleSavedAt, setGoogleSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    if (!open) return
    setActiveRecordId(optimization?.id)
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
      // o.updatedAt pode vir null por um instante em registro recém-criado
      // (serverTimestamp() ainda não resolvido no snapshot local/cache
      // offline) — sem essa checagem, .toDate() explode e derruba a tela.
      setMetaSavedAt(o.metaOptimizationsText && o.updatedAt ? o.updatedAt.toDate() : null)
      setGoogleSavedAt(o.googleOptimizationsText && o.updatedAt ? o.updatedAt.toDate() : null)
    } else {
      setDateStr(todayInput())
      setMetaText('')
      setGoogleText('')
      setMetaNotes('')
      setGoogleNotes('')
      setMetaBalance('')
      setGoogleBalance('')
      setMetaSavedAt(null)
      setGoogleSavedAt(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, optimization])

  const addSuggestion = (which: 'meta' | 'google', s: string) => {
    const setter = which === 'meta' ? setMetaText : setGoogleText
    setter((prev) => (prev.trim() ? `${prev.trim()}\n${s}` : s))
  }

  /** Salva só a plataforma `which`, preservando o que a OUTRA já tinha no
   *  registro ativo desta sessão (se estiver editando/já tiver salvo uma
   *  antes) — nunca lê o textarea da outra seção pra montar o payload. */
  const handleSaveSingle = async (which: 'meta' | 'google') => {
    if (!profile) return
    const isMeta = which === 'meta'
    const label = isMeta ? 'Meta Ads' : 'Google Ads'
    const text = (isMeta ? metaText : googleText).trim()
    if (!text) {
      toast.error(`Descreva o que foi otimizado no ${label}.`)
      return
    }
    const dateTs = dateInputToTimestamp(dateStr)
    if (!dateTs) {
      toast.error('Informe a data.')
      return
    }

    // A plataforma sendo salva agora usa o texto atual da tela. A OUTRA só
    // entra no payload se já tiver um valor de verdade PERSISTIDO (registro
    // carregado pra edição, ou já salva nesta mesma sessão) — nunca um
    // rascunho ainda não salvo digitado na outra seção, senão clicar
    // "Salvar Meta" salvaria escondido um Google ainda não revisado.
    const keepMetaText = isMeta ? text : metaSavedAt ? metaText.trim() || undefined : undefined
    const keepGoogleText = isMeta ? (googleSavedAt ? googleText.trim() || undefined : undefined) : text
    const keepMetaNotes = isMeta ? metaNotes.trim() || undefined : metaSavedAt ? metaNotes.trim() || undefined : undefined
    const keepGoogleNotes = isMeta ? (googleSavedAt ? googleNotes.trim() || undefined : undefined) : googleNotes.trim() || undefined
    const keepMetaBalance = isMeta ? parseCurrencyToNumber(metaBalance) : metaSavedAt ? parseCurrencyToNumber(metaBalance) : undefined
    const keepGoogleBalance = isMeta ? (googleSavedAt ? parseCurrencyToNumber(googleBalance) : undefined) : parseCurrencyToNumber(googleBalance)

    const platforms: OptimizationPlatform[] = []
    if (keepMetaText) platforms.push('meta')
    if (keepGoogleText) platforms.push('google')

    const combined =
      keepMetaText && keepGoogleText
        ? `Meta Ads:\n${keepMetaText}\n\nGoogle Ads:\n${keepGoogleText}`
        : (keepMetaText ?? keepGoogleText ?? '')

    setSavingWhich(which)
    try {
      const payload = {
        clientId,
        date: dateTs,
        platforms,
        optimizationsText: combined,
        notes: undefined,
        metaOptimizationsText: keepMetaText,
        googleOptimizationsText: keepGoogleText,
        metaNotes: keepMetaNotes,
        googleNotes: keepGoogleNotes,
        metaBalance: keepMetaBalance,
        googleBalance: keepGoogleBalance,
        responsavelId: optimization?.responsavelId ?? profile.id,
        responsavelName: optimization?.responsavelName ?? profile.name,
      }
      if (activeRecordId) {
        await updateOptimization(activeRecordId, payload, profile.id)
      } else {
        const id = await createOptimization(payload, profile.id, profile.name)
        setActiveRecordId(id)
      }
      toast.success(both ? `✅ ${label} registrado!` : '✅ Otimização registrada!')
      if (isMeta) setMetaSavedAt(new Date())
      else setGoogleSavedAt(new Date())
      // Não fecha sozinho — se o cliente tem as duas plataformas, deixa a
      // pessoa registrar a outra sem perder o que acabou de salvar.
      if (!both) onClose()
    } catch (err) {
      console.error(err)
      toast.error(`Erro ao salvar ${label}`)
    } finally {
      setSavingWhich(null)
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
    savedAt: Date | null,
  ) => {
    const label = which === 'meta' ? 'Meta Ads' : 'Google Ads'
    const badge = which === 'meta' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
    return (
      <div className={both ? 'rounded-lg border border-slate-200 p-3' : ''}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {both && <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge}`}>{label}</span>}
          {savedAt && (
            <span className="text-[11px] font-medium text-emerald-600">✅ Salvo às {format(savedAt, 'HH:mm')}</span>
          )}
        </div>
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
          {both && (
            <Button
              size="sm"
              onClick={() => handleSaveSingle(which)}
              loading={savingWhich === which}
              disabled={savingWhich != null && savingWhich !== which}
              className="self-start"
            >
              {savedAt ? `Atualizar ${label}` : `Salvar otimização ${label}`}
            </Button>
          )}
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
            Este cliente tem Meta Ads e Google Ads — cada seção salva de forma independente, sem afetar a outra.
          </p>
        )}

        <div className="flex flex-col gap-4">
          {showMeta && platformSection('meta', metaText, setMetaText, metaNotes, setMetaNotes, metaBalance, setMetaBalance, metaSavedAt)}
          {showGoogle &&
            platformSection('google', googleText, setGoogleText, googleNotes, setGoogleNotes, googleBalance, setGoogleBalance, googleSavedAt)}
        </div>

        <p className="text-xs text-slate-400">
          Responsável: <span className="font-medium text-slate-600">{optimization?.responsavelName ?? profile?.name ?? '—'}</span>
        </p>

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {both ? 'Fechar' : 'Cancelar'}
          </Button>
          {!both && (
            <Button
              onClick={() => handleSaveSingle(showMeta ? 'meta' : 'google')}
              loading={savingWhich != null}
            >
              Salvar otimização
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

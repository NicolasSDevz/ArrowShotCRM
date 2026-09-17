import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Field, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { createClientSuccessEvaluation } from '../../services/clientSuccessService'
import {
  CLIENT_SUCCESS_CRITERIA,
  CLIENT_SUCCESS_CRITERION_LABEL,
  CLIENT_SUCCESS_SCORE_DESCRIPTION,
  averageClientSuccessScore,
  classifyClientSuccessScore,
  CLIENT_SUCCESS_TIER_LABEL,
  CLIENT_SUCCESS_TIER_BADGE,
  type ClientSuccessCriterion,
  type ClientSuccessScores,
} from '../../types/clientSuccess'

function currentMonthInput() {
  return format(new Date(), 'yyyy-MM')
}

const EMPTY_SCORES: ClientSuccessScores = {
  meetings: 0,
  whatsapp: 0,
  materials: 0,
  platform: 0,
  payment: 0,
}

export function ClientSuccessFormModal({
  open,
  onClose,
  clientId,
  clientName,
}: {
  open: boolean
  onClose: () => void
  clientId: string
  clientName: string
}) {
  const { profile } = useAuth()
  const [referenceMonth, setReferenceMonth] = useState(currentMonthInput())
  const [scores, setScores] = useState<ClientSuccessScores>(EMPTY_SCORES)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setReferenceMonth(currentMonthInput())
      setScores(EMPTY_SCORES)
      setNotes('')
    }
  }, [open])

  const setScore = (criterion: ClientSuccessCriterion, value: number) =>
    setScores((s) => ({ ...s, [criterion]: value }))

  const canSubmit = referenceMonth !== '' && CLIENT_SUCCESS_CRITERIA.every((c) => scores[c] > 0)
  const preview = averageClientSuccessScore(scores)
  const previewTier = classifyClientSuccessScore(preview)
  const allFilled = CLIENT_SUCCESS_CRITERIA.every((c) => scores[c] > 0)

  const handleSubmit = async () => {
    if (!canSubmit || !profile) return
    setSaving(true)
    try {
      await createClientSuccessEvaluation(clientId, clientName, referenceMonth, scores, notes, profile.id, profile.name)
      toast.success('Avaliação registrada')
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar avaliação')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova avaliação de Sucesso do Cliente" width="max-w-xl">
      <div className="flex flex-col gap-4">
        <Field label="Mês de referência" required>
          <input
            type="month"
            value={referenceMonth}
            onChange={(e) => setReferenceMonth(e.target.value)}
            className="h-[38px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 ease-in-out focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
        </Field>

        {CLIENT_SUCCESS_CRITERIA.map((criterion) => (
          <div key={criterion} className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-700">{CLIENT_SUCCESS_CRITERION_LABEL[criterion]}</p>
            <div className="flex gap-1.5">
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScore(criterion, n)}
                  title={CLIENT_SUCCESS_SCORE_DESCRIPTION[criterion][n]}
                  className={`flex h-9 flex-1 items-center justify-center rounded-lg border text-sm font-semibold transition-colors duration-150 ease-in-out ${
                    scores[criterion] === n
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              {scores[criterion] > 0
                ? CLIENT_SUCCESS_SCORE_DESCRIPTION[criterion][scores[criterion] as 1 | 2 | 3 | 4 | 5]
                : 'Selecione uma nota de 1 a 5'}
            </p>
          </div>
        ))}

        <Field label="Observações gerais">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações sobre este mês..." />
        </Field>

        {allFilled && (
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
            <span className="text-sm text-slate-500">Score calculado</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">{preview.toFixed(1)}/5</span>
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${CLIENT_SUCCESS_TIER_BADGE[previewTier]}`}>
                {CLIENT_SUCCESS_TIER_LABEL[previewTier]}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={saving} disabled={!canSubmit}>
          Salvar avaliação
        </Button>
      </div>
    </Modal>
  )
}

import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { ClientSuccessFormModal } from './ClientSuccessFormModal'
import { useAuth } from '../../context/AuthContext'
import { useClientSuccessEvaluations } from '../../hooks/useClientSuccessEvaluations'
import { deleteClientSuccessEvaluation } from '../../services/clientSuccessService'
import {
  CLIENT_SUCCESS_CRITERIA,
  CLIENT_SUCCESS_CRITERION_LABEL,
  CLIENT_SUCCESS_TIER_LABEL,
  CLIENT_SUCCESS_TIER_BADGE,
  type ClientSuccessEvaluation,
} from '../../types/clientSuccess'

function monthLabel(referenceMonth: string) {
  try {
    return format(new Date(`${referenceMonth}-01T12:00:00`), 'MMMM yyyy', { locale: ptBR })
  } catch {
    return referenceMonth
  }
}

/** Aba "Sucesso do Cliente" da ficha do cliente — preenchida pelo CS
 *  (Janilson). Uma avaliação mensal com 5 critérios de 1 a 5, que vira um
 *  score médio (0-5) classificado em 4 faixas (ver types/clientSuccess.ts). */
export function ClientSuccessTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const { profile } = useAuth()
  const { data: evaluations } = useClientSuccessEvaluations(clientId)
  const [creating, setCreating] = useState(false)

  const handleDelete = async (evaluation: ClientSuccessEvaluation) => {
    if (!profile) return
    if (!confirm(`Excluir a avaliação de ${monthLabel(evaluation.referenceMonth)}? Essa ação não pode ser desfeita.`)) return
    try {
      await deleteClientSuccessEvaluation(evaluation, profile.id, profile.name)
      toast.success('Avaliação excluída')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao excluir a avaliação')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-800">Avaliação de Sucesso do Cliente</p>
          <p className="text-sm text-slate-400">Mensure o engajamento e saúde do relacionamento com o cliente</p>
        </div>
        <Button size="sm" icon={<Plus size={13} />} onClick={() => setCreating(true)}>
          Nova avaliação
        </Button>
      </div>

      {evaluations.length === 0 ? (
        <EmptyState
          title="Nenhuma avaliação registrada ainda"
          description="Clique em “Nova avaliação” para registrar a primeira avaliação mensal deste cliente."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {evaluations.map((evaluation) => (
            <div key={evaluation.id} className="rounded-xl border border-slate-100 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold capitalize text-slate-800">{monthLabel(evaluation.referenceMonth)}</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-700">{evaluation.score.toFixed(1)}/5</span>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${CLIENT_SUCCESS_TIER_BADGE[evaluation.tier]}`}>
                    {CLIENT_SUCCESS_TIER_LABEL[evaluation.tier]}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(evaluation)}
                    className="rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                    title="Excluir avaliação"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {CLIENT_SUCCESS_CRITERIA.map((c) => (
                  <div key={c} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs">
                    <span className="text-slate-500">{CLIENT_SUCCESS_CRITERION_LABEL[c]}</span>
                    <span className="font-semibold text-slate-700">{evaluation.scores[c]}/5</span>
                  </div>
                ))}
              </div>

              {evaluation.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 text-sm text-slate-600">{evaluation.notes}</p>}

              <p className="mt-2.5 text-xs text-slate-400">
                Avaliado por {evaluation.evaluatedByName} em {format(evaluation.createdAt.toDate(), 'dd/MM/yyyy', { locale: ptBR })}
              </p>
            </div>
          ))}
        </div>
      )}

      <ClientSuccessFormModal open={creating} onClose={() => setCreating(false)} clientId={clientId} clientName={clientName} />
    </div>
  )
}

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { clearLeadFormMetrics, deleteLeadsFromForm } from '../../services/leadFormResetService'
import { showError } from '../../utils/notifyError'
import type { LeadForm } from '../../types/leadForm'

/** "Limpar dados" de um formulário — pra depois de testar: zera as métricas
 *  e, se marcado, apaga os leads que vieram por ele (os de teste). */
export function ClearFormDataModal({ form, leadCount, onClose }: { form: LeadForm | null; leadCount: number; onClose: () => void }) {
  const [metrics, setMetrics] = useState(true)
  const [leads, setLeads] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!form) return
    setMetrics(true)
    setLeads(false)
  }, [form])

  const handleClear = async () => {
    if (!form || (!metrics && !leads)) return
    if (leads && !confirm(`Apagar os ${leadCount} lead(s) que vieram por "${form.name}"? Isso não pode ser desfeito.`)) return
    setBusy(true)
    try {
      const parts: string[] = []
      if (metrics) {
        await clearLeadFormMetrics(form.id)
        parts.push('métricas zeradas')
      }
      if (leads) {
        const n = await deleteLeadsFromForm(form.id)
        parts.push(`${n} lead(s) apagado(s)`)
      }
      toast.success(`Pronto: ${parts.join(' e ')}`)
      onClose()
    } catch (err) {
      showError(err, 'Não foi possível limpar os dados do formulário')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!form} onClose={onClose} title={`Limpar dados — ${form?.name ?? ''}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-500">Use depois de testar o formulário, pra começar a medir do zero. As perguntas e o visual não mudam.</p>
        <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3">
          <input type="checkbox" checked={metrics} onChange={(e) => setMetrics(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span>
            <span className="block text-sm font-medium text-slate-700">Zerar as métricas</span>
            <span className="block text-xs text-slate-400">Visualizações, inícios, respostas, tempo médio e desistência por pergunta.</span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3">
          <input type="checkbox" checked={leads} onChange={(e) => setLeads(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span>
            <span className="block text-sm font-medium text-slate-700">Apagar os leads que vieram por este formulário ({leadCount})</span>
            <span className="block text-xs text-slate-400">Os que já viraram cliente ficam de fora. Não dá pra desfazer.</span>
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleClear} loading={busy} disabled={!metrics && !leads} className="bg-red-600 hover:bg-red-700">
            Limpar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

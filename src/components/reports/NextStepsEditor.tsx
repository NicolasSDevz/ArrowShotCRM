import { useState } from 'react'
import toast from 'react-hot-toast'
import { Pencil } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { updateReportNextSteps } from '../../services/reportService'
import { showError } from '../../utils/notifyError'
import { Button } from '../ui/Button'
import type { Report } from '../../types'

/** "Próximos passos" do relatório mensal — o gestor escreve o plano do mês
 *  seguinte; aparece no resumo, na apresentação e no PDF. */
export function NextStepsEditor({ report }: { report: Report }) {
  const { profile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(report.nextSteps ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!profile) return
    setSaving(true)
    try {
      await updateReportNextSteps(report, draft, profile.id)
      toast.success('Próximos passos salvos')
      setEditing(false)
    } catch (err) {
      showError(err, 'Erro ao salvar os próximos passos')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-5 border-t border-[#E2E8F0] pt-4">
      <div className="mb-1 flex items-center gap-2">
        <p className="text-sm font-semibold text-slate-800">Próximos passos</p>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(report.nextSteps ?? '')
              setEditing(true)
            }}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 print:hidden"
          >
            <Pencil size={11} /> {report.nextSteps ? 'Editar' : 'Escrever'}
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2 print:hidden">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            autoFocus
            placeholder={'Ex:\n• Testar 3 criativos novos em vídeo\n• Subir o orçamento da campanha de WhatsApp em 20%'}
            className="w-full rounded-lg border border-slate-200 bg-white p-3 text-[15px] leading-relaxed outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} loading={saving}>
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : report.nextSteps ? (
        <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{report.nextSteps}</p>
      ) : (
        <p className="text-sm text-slate-400 print:hidden">Ainda não escrito — o que vai ser feito no próximo mês.</p>
      )}
    </div>
  )
}

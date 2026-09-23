import { useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Copy, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLeadForms } from '../../hooks/useLeadForms'
import { useLeads } from '../../hooks/useLeads'
import { deleteLeadForm, updateLeadForm } from '../../services/leadFormService'
import { LeadFormBuilderModal } from './LeadFormBuilderModal'
import { Button } from '../ui/Button'
import type { LeadForm } from '../../types/leadForm'

/** Aba "Formulários" da página de Leads — cria/edita formulários de captura
 *  e mostra o link público de cada um (pra colar direto no anúncio do Meta),
 *  quantos leads cada um já trouxe e um atalho pra ativar/pausar. */
export function LeadFormsPanel() {
  const { profile } = useAuth()
  const { data: forms } = useLeadForms()
  const { data: leads } = useLeads()
  const [editing, setEditing] = useState<LeadForm | null | undefined>(undefined)

  const countByForm = (formId: string) => leads.filter((l) => l.sourceFormId === formId).length

  const copyLink = (formId: string) => {
    const url = `${window.location.origin}/captura/${formId}`
    navigator.clipboard.writeText(url).then(
      () => toast.success('Link copiado'),
      () => toast.error('Não foi possível copiar — copie manualmente pela barra de endereço')
    )
  }

  const toggleActive = async (form: LeadForm) => {
    if (!profile) return
    try {
      await updateLeadForm(form.id, { active: !form.active }, profile.id)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao atualizar o formulário')
    }
  }

  const handleDelete = async (form: LeadForm) => {
    if (!confirm(`Excluir o formulário "${form.name}"? Os leads já recebidos por ele continuam no pipeline.`)) return
    try {
      await deleteLeadForm(form.id)
      toast.success('Formulário excluído')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao excluir o formulário')
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Crie um formulário e cole o link dele no anúncio (Meta Ads, Google Ads etc.) — cada resposta cai direto aqui como um novo lead.
        </p>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing(null)} className="shrink-0">
          Novo formulário
        </Button>
      </div>

      {forms.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">Nenhum formulário criado ainda.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {forms.map((form) => (
            <div key={form.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-800">{form.name}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${form.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {form.active ? 'Ativo' : 'Pausado'}
                  </span>
                </div>
                <p className="truncate text-xs text-slate-400">/captura/{form.id}</p>
              </div>
              <p className="shrink-0 text-xs font-medium text-slate-500">{countByForm(form.id)} lead{countByForm(form.id) === 1 ? '' : 's'}</p>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => copyLink(form.id)} title="Copiar link" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <Copy size={14} />
                </button>
                <a href={`/captura/${form.id}`} target="_blank" rel="noreferrer" title="Abrir formulário" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <ExternalLink size={14} />
                </a>
                <button onClick={() => setEditing(form)} title="Editar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <Pencil size={14} />
                </button>
                <button onClick={() => toggleActive(form)} title={form.active ? 'Pausar' : 'Ativar'} className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">
                  {form.active ? 'Pausar' : 'Ativar'}
                </button>
                <button onClick={() => handleDelete(form)} title="Excluir" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <LeadFormBuilderModal open={editing !== undefined} onClose={() => setEditing(undefined)} form={editing} />
    </div>
  )
}

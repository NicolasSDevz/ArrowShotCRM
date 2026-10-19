import { useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Copy, Pencil, Trash2, ExternalLink, BarChart3, Eraser, Link2, ClipboardPaste, CopyPlus, Inbox, Send, MoreHorizontal } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLeadForms } from '../../hooks/useLeadForms'
import { useAllLeads } from '../../hooks/useLeads'
import { createLeadForm, deleteLeadForm, slugifyFormName, updateLeadForm } from '../../services/leadFormService'
import { LeadFormBuilderModal } from './LeadFormBuilderModal'
import { LeadFormAnalyticsModal } from './LeadFormAnalyticsModal'
import { ClearFormDataModal } from './ClearFormDataModal'
import { leadFormColor } from './leadFormColors'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Field, Input, Textarea } from '../ui/Field'
import type { LeadForm, LeadFormInput } from '../../types/leadForm'
import type { ResolvedPipeline } from '../../types'
import { askConfirm } from '../../utils/confirmDialog'

/** Marca do texto copiado — só cola o que veio do botão "Copiar formulário". */
const CLIPBOARD_KIND = 'arrowshot-lead-form'

/** Só o conteúdo do formulário (sem id, datas e autor), pronto pra virar outro. */
function formContent(form: LeadForm): LeadFormInput {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, createdAt, updatedAt, createdBy, updatedBy, ...rest } = form as LeadForm & Record<string, unknown>
  return rest as LeadFormInput
}

function parseClipboard(text: string): LeadFormInput | null {
  try {
    const data = JSON.parse(text.trim())
    if (data?.kind !== CLIPBOARD_KIND || !data.form || !Array.isArray(data.form.questions)) return null
    return data.form as LeadFormInput
  } catch {
    return null
  }
}

/** Aba "Formulários" da página de Leads: cria/edita formulários de captura,
 *  mostra o link público (pra colar no anúncio), para onde vão as respostas,
 *  quantos leads cada um trouxe, e permite copiar/colar/duplicar. */
export function LeadFormsPanel({ pipelines = [] }: { pipelines?: ResolvedPipeline[] }) {
  const { profile } = useAuth()
  const { data: forms } = useLeadForms()
  // Total de todos os tempos por formulário (esta aba é pouco aberta).
  const { data: leads } = useAllLeads()
  const [editing, setEditing] = useState<LeadForm | null | undefined>(undefined)
  const [viewingStats, setViewingStats] = useState<LeadForm | null>(null)
  const [clearing, setClearing] = useState<LeadForm | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  // Colar / duplicar: conteúdo + nome e link do formulário novo.
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteContent, setPasteContent] = useState<LeadFormInput | null>(null)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [creating, setCreating] = useState(false)

  const countByForm = (formId: string) => leads.filter((l) => l.sourceFormId === formId).length
  const sorted = [...forms].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))

  const destinationLabel = (form: LeadForm) => {
    if (form.destination !== 'sales') return 'Questionários'
    const p = pipelines.find((x) => (form.destinationPipelineId ? x.id === form.destinationPipelineId : x.isDefault))
    return `Vendas${p ? `, pipeline ${p.name}` : ''}`
  }

  const copyLink = (formId: string) => {
    const url = `${window.location.origin}/captura/${formId}`
    navigator.clipboard.writeText(url).then(
      () => toast.success('Link copiado'),
      () => toast.error('Não foi possível copiar. Copie manualmente pela barra de endereço')
    )
  }

  const copyForm = (form: LeadForm) => {
    const text = JSON.stringify({ kind: CLIPBOARD_KIND, form: formContent(form) })
    navigator.clipboard.writeText(text).then(
      () => toast.success(`Formulário "${form.name}" copiado. Use "Colar formulário" para criar outro igual`),
      () => toast.error('Não foi possível copiar')
    )
  }

  const startNew = (content: LeadFormInput, text = '') => {
    const name = `${content.name} (cópia)`
    setPasteText(text)
    setPasteContent(content)
    setNewName(name)
    setNewSlug(slugifyFormName(name))
    setPasteOpen(true)
  }

  const openPaste = async () => {
    setPasteText('')
    setPasteContent(null)
    setNewName('')
    setNewSlug('')
    setPasteOpen(true)
    // Tenta já trazer o que está copiado (o navegador pode pedir permissão).
    try {
      const text = await navigator.clipboard.readText()
      const content = parseClipboard(text)
      if (content) startNew(content, text)
    } catch {
      /* sem permissão: a pessoa cola no campo */
    }
  }

  const onPasteTextChange = (text: string) => {
    setPasteText(text)
    const content = parseClipboard(text)
    setPasteContent(content)
    if (content) {
      const name = `${content.name} (cópia)`
      setNewName(name)
      setNewSlug(slugifyFormName(name))
    }
  }

  const createFromContent = async () => {
    if (!profile || !pasteContent) return
    const slug = slugifyFormName(newSlug || newName)
    if (!newName.trim() || !slug) {
      toast.error('Dê um nome e um link para o formulário novo')
      return
    }
    setCreating(true)
    try {
      // Começa pausado: dá pra revisar antes de colocar no anúncio.
      const ok = await createLeadForm(slug, { ...pasteContent, name: newName.trim(), active: false }, profile.id)
      if (!ok) {
        toast.error('Esse link já está em uso. Escolha outro')
        return
      }
      toast.success('Formulário criado (pausado). Revise e ative quando quiser')
      setPasteOpen(false)
    } catch (err) {
      console.error(err)
      toast.error('Não foi possível criar o formulário')
    } finally {
      setCreating(false)
    }
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
    if (!(await askConfirm({ title: `Excluir o formulário "${form.name}"?`, message: 'As respostas já recebidas por ele continuam em Questionários e no pipeline.', confirmLabel: 'Excluir', danger: true }))) return
    try {
      await deleteLeadForm(form.id)
      toast.success('Formulário excluído')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao excluir o formulário')
    }
  }

  const iconBtn = 'flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700'

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">
          Crie um formulário e cole o link no anúncio. Em cada formulário você escolhe se as respostas caem em Questionários (pra triar antes) ou direto em Vendas.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" icon={<ClipboardPaste size={14} />} onClick={openPaste}>
            Colar formulário
          </Button>
          <Button icon={<Plus size={14} />} onClick={() => setEditing(null)}>
            Novo formulário
          </Button>
        </div>
      </div>

      {forms.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">Nenhum formulário criado ainda.</p>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing(null)}>
            Criar o primeiro
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3" aria-label="Formulários">
          {sorted.map((form) => {
            const color = leadFormColor(form)
            const count = countByForm(form.id)
            const toSales = form.destination === 'sales'
            return (
              <li key={form.id} className={`relative flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-md ${form.active ? '' : 'opacity-80'}`}>
                <span className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ background: color }} aria-hidden="true" />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-bold text-slate-800">{form.name}</h3>
                    <button type="button" onClick={() => copyLink(form.id)} className="flex max-w-full items-center gap-1 text-xs text-slate-400 hover:text-brand-600" title="Copiar link">
                      <Link2 size={12} className="shrink-0" aria-hidden="true" />
                      <span className="truncate">/captura/{form.id}</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleActive(form)}
                    aria-label={`${form.name}: ${form.active ? 'ativo, clique para pausar' : 'pausado, clique para ativar'}`}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${form.active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    {form.active ? 'Ativo' : 'Pausado'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-lg bg-slate-50 px-2 py-1 font-semibold text-slate-700 ring-1 ring-slate-100">
                    {count} lead{count === 1 ? '' : 's'}
                  </span>
                  <span className="rounded-lg bg-slate-50 px-2 py-1 text-slate-500 ring-1 ring-slate-100">
                    {form.questions.length} pergunta{form.questions.length === 1 ? '' : 's'}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold ${toSales ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-700'}`}>
                    {toSales ? <Send size={12} aria-hidden="true" /> : <Inbox size={12} aria-hidden="true" />}
                    Respostas vão para {destinationLabel(form)}
                  </span>
                </div>

                <div className="mt-auto flex items-center gap-1 border-t border-slate-100 pt-3">
                  <Button size="sm" variant="secondary" icon={<Pencil size={13} />} onClick={() => setEditing(form)} aria-label={`Editar ${form.name}`}>
                    Editar
                  </Button>
                  <button type="button" onClick={() => copyLink(form.id)} title="Copiar link" aria-label={`Copiar link de ${form.name}`} className={iconBtn}>
                    <Link2 size={15} />
                  </button>
                  <a href={`/captura/${form.id}`} target="_blank" rel="noreferrer" title="Abrir formulário" aria-label={`Abrir ${form.name} em outra aba`} className={iconBtn}>
                    <ExternalLink size={15} />
                  </a>
                  <button type="button" onClick={() => setViewingStats(form)} title="Métricas" aria-label={`Métricas de ${form.name}`} className={iconBtn}>
                    <BarChart3 size={15} />
                  </button>
                  <div className="relative ml-auto">
                    <button
                      type="button"
                      onClick={() => setMenuFor(menuFor === form.id ? null : form.id)}
                      aria-expanded={menuFor === form.id}
                      aria-label={`Mais opções de ${form.name}`}
                      title="Mais opções"
                      className={iconBtn}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {menuFor === form.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                        <div role="menu" className="absolute bottom-full right-0 z-20 mb-1 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                          {(
                            [
                              [<CopyPlus key="d" size={14} />, 'Duplicar', () => startNew(formContent(form)), false],
                              [<Copy key="c" size={14} />, 'Copiar formulário', () => copyForm(form), false],
                              [<Eraser key="e" size={14} />, 'Limpar dados de teste', () => setClearing(form), false],
                              [<Trash2 key="t" size={14} />, 'Excluir', () => handleDelete(form), true],
                            ] as const
                          ).map(([icon, label, action, danger]) => (
                            <button
                              key={label}
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuFor(null)
                                action()
                              }}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}
                            >
                              {icon}
                              {label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title={pasteContent && !pasteText ? 'Duplicar formulário' : 'Colar formulário'}>
        <div className="flex flex-col gap-4">
          {!pasteContent || pasteText ? (
            <Field label="Formulário copiado">
              <Textarea
                rows={4}
                value={pasteText}
                onChange={(e) => onPasteTextChange(e.target.value)}
                placeholder='Use "Copiar formulário" no menu de um formulário (botão de três pontos) e cole aqui com Ctrl+V'
                aria-describedby="paste-status"
              />
            </Field>
          ) : null}
          <p id="paste-status" className={`text-sm ${pasteContent ? 'text-emerald-700' : 'text-slate-500'}`} aria-live="polite">
            {pasteContent
              ? `Pronto: "${pasteContent.name}", com ${pasteContent.questions.length} pergunta${pasteContent.questions.length === 1 ? '' : 's'}, telas e cores.`
              : pasteText.trim()
                ? 'Não reconheci esse texto. Copie de novo pelo botão "Copiar formulário".'
                : 'Cole o formulário copiado no campo acima.'}
          </p>
          {pasteContent && (
            <>
              <Field label="Nome do formulário novo">
                <Input
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value)
                    setNewSlug(slugifyFormName(e.target.value))
                  }}
                />
              </Field>
              <Field label="Link">
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-xs text-slate-400">/captura/</span>
                  <Input value={newSlug} onChange={(e) => setNewSlug(slugifyFormName(e.target.value))} aria-label="Link do formulário novo" />
                </div>
              </Field>
              <p className="text-xs text-slate-400">O formulário novo começa pausado, pra você revisar antes de colocar no anúncio.</p>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPasteOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button icon={<CopyPlus size={14} />} onClick={createFromContent} loading={creating} disabled={!pasteContent}>
              Criar formulário
            </Button>
          </div>
        </div>
      </Modal>

      <LeadFormBuilderModal open={editing !== undefined} onClose={() => setEditing(undefined)} form={editing} />
      <ClearFormDataModal form={clearing} leadCount={clearing ? countByForm(clearing.id) : 0} onClose={() => setClearing(null)} />
      <LeadFormAnalyticsModal
        open={!!viewingStats}
        onClose={() => setViewingStats(null)}
        form={viewingStats}
        leads={leads}
        onClearData={(f) => {
          setViewingStats(null)
          setClearing(f)
        }}
      />
    </div>
  )
}

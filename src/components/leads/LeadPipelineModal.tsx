import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { useAuth } from '../../context/AuthContext'
import { createLeadPipeline, saveLeadPipeline, deleteLeadPipeline } from '../../services/leadPipelineService'
import {
  newPipelineStages,
  PIPELINE_FIELD_TYPE_LABEL,
  type PipelineField,
  type PipelineFieldType,
  type PipelineStage,
  type PipelineStageKind,
  type ResolvedPipeline,
} from '../../types'

const KIND_LABEL: Record<PipelineStageKind, string> = { open: 'Etapa normal', won: 'Ganho (vira cliente)', lost: 'Perdido (pede o motivo)' }
const STAGE_COLORS = ['#64748B', '#3B82F6', '#8B5CF6', '#F59E0B', '#F97316', '#10B981', '#EF4444', '#EC4899']

function move<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

/** Criar ou configurar um pipeline de leads: nome, etapas (só nos pipelines
 *  criados pelo time — as do padrão são fixas) e campos extras que cada lead
 *  desse pipeline passa a ter. `pipeline == null` = criando um novo. */
export function LeadPipelineModal({
  open,
  onClose,
  pipeline,
  leadCountByStage,
  totalLeads,
  nextOrder,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  pipeline: ResolvedPipeline | null
  /** Quantos leads há em cada etapa — não deixa apagar etapa com lead. */
  leadCountByStage: Record<string, number>
  totalLeads: number
  nextOrder: number
  onSaved: (id: string) => void
}) {
  const { profile } = useAuth()
  const isDefault = !!pipeline?.isDefault
  const [name, setName] = useState('')
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [fields, setFields] = useState<PipelineField[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(pipeline?.name ?? '')
    setStages(pipeline ? pipeline.stages : newPipelineStages())
    setFields(pipeline?.fields ?? [])
  }, [open, pipeline])

  const updateStage = (id: string, patch: Partial<PipelineStage>) => setStages((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const updateField = (id: string, patch: Partial<PipelineField>) => setFields((cur) => cur.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  const handleSave = async () => {
    if (!profile) return
    if (!name.trim()) return toast.error('Dê um nome ao pipeline')
    if (stages.length < 2) return toast.error('O pipeline precisa de pelo menos 2 etapas')
    if (stages.some((s) => !s.label.trim())) return toast.error('Toda etapa precisa de um nome')
    if (fields.some((f) => !f.label.trim())) return toast.error('Todo campo precisa de um nome')
    if (fields.some((f) => f.type === 'select' && (f.options ?? []).filter((o) => o.trim()).length < 2)) {
      return toast.error('Campos de lista precisam de pelo menos 2 opções')
    }
    const cleanFields = fields.map((f) => ({
      ...f,
      label: f.label.trim(),
      options: f.type === 'select' ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined,
    }))
    const cleanStages = stages.map((s) => ({ ...s, label: s.label.trim() }))
    setSaving(true)
    try {
      if (pipeline) {
        await saveLeadPipeline(pipeline.id, { name: name.trim(), fields: cleanFields, stages: cleanStages }, profile.id)
        toast.success('Pipeline atualizado')
        onSaved(pipeline.id)
      } else {
        const id = await createLeadPipeline({ name: name.trim(), fields: cleanFields, stages: cleanStages, order: nextOrder }, profile.id)
        toast.success('Pipeline criado')
        onSaved(id)
      }
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar o pipeline')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!pipeline || isDefault) return
    if (totalLeads > 0) return toast.error('Mova ou exclua os leads deste pipeline antes de apagá-lo')
    if (!confirm(`Excluir o pipeline "${pipeline.name}"?`)) return
    try {
      await deleteLeadPipeline(pipeline.id)
      toast.success('Pipeline excluído')
      onSaved('default')
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao excluir o pipeline')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={pipeline ? `Configurar pipeline — ${pipeline.name}` : 'Novo pipeline'} width="max-w-2xl">
      <div className="flex flex-col gap-5">
        <Field label="Nome do pipeline" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Parcerias, Indicações, Eventos" autoFocus />
        </Field>

        <section className="flex flex-col gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">Etapas</p>
            <p className="text-xs text-slate-400">As colunas do quadro, da esquerda pra direita. Ex: acrescente "No show" pra quem faltou à reunião.</p>
          </div>
          <>
              {stages.map((s, i) => {
                const count = leadCountByStage[s.id] ?? 0
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 p-2">
                    <input
                      type="color"
                      value={s.color}
                      onChange={(e) => updateStage(s.id, { color: e.target.value })}
                      title="Cor da etapa"
                      className="h-8 w-9 shrink-0 cursor-pointer rounded border border-slate-200 bg-white"
                    />
                    <Input value={s.label} onChange={(e) => updateStage(s.id, { label: e.target.value })} placeholder="Nome da etapa" className="min-w-[140px] flex-1" />
                    <Select value={s.kind} onChange={(e) => updateStage(s.id, { kind: e.target.value as PipelineStageKind })} className="max-w-[190px] text-xs">
                      {(Object.entries(KIND_LABEL) as [PipelineStageKind, string][]).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </Select>
                    <button type="button" onClick={() => setStages((c) => move(c, i, -1))} disabled={i === 0} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="Mover pra esquerda">
                      <ArrowUp size={13} />
                    </button>
                    <button type="button" onClick={() => setStages((c) => move(c, i, 1))} disabled={i === stages.length - 1} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="Mover pra direita">
                      <ArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setStages((c) => c.filter((x) => x.id !== s.id))}
                      disabled={count > 0 || stages.length <= 2}
                      title={count > 0 ? `${count} lead(s) nesta etapa — mova antes de apagar` : 'Excluir etapa'}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                    >
                      <Trash2 size={13} />
                    </button>
                    {count > 0 && <span className="w-full pl-1 text-[11px] text-slate-400">{count} lead(s) nesta etapa</span>}
                  </div>
                )
              })}
              <button
                type="button"
                onClick={() => setStages((c) => [...c, { id: crypto.randomUUID(), label: '', color: STAGE_COLORS[c.length % STAGE_COLORS.length], kind: 'open' }])}
                className="flex w-fit items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                <Plus size={12} /> Adicionar etapa
              </button>
          </>
        </section>

        <section className="flex flex-col gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">Campos extras</p>
            <p className="text-xs text-slate-400">Informações a mais que cada lead deste pipeline passa a ter (ex: "Nº de funcionários", "Data do evento").</p>
          </div>
          {fields.map((f, i) => (
            <div key={f.id} className="flex flex-col gap-1.5 rounded-lg border border-slate-200 p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Input value={f.label} onChange={(e) => updateField(f.id, { label: e.target.value })} placeholder="Nome do campo" className="min-w-[140px] flex-1" />
                <Select value={f.type} onChange={(e) => updateField(f.id, { type: e.target.value as PipelineFieldType })} className="max-w-[190px] text-xs">
                  {(Object.entries(PIPELINE_FIELD_TYPE_LABEL) as [PipelineFieldType, string][]).map(([t, l]) => (
                    <option key={t} value={t}>
                      {l}
                    </option>
                  ))}
                </Select>
                <button type="button" onClick={() => setFields((c) => move(c, i, -1))} disabled={i === 0} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="Subir">
                  <ArrowUp size={13} />
                </button>
                <button type="button" onClick={() => setFields((c) => move(c, i, 1))} disabled={i === fields.length - 1} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="Descer">
                  <ArrowDown size={13} />
                </button>
                <button type="button" onClick={() => setFields((c) => c.filter((x) => x.id !== f.id))} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" title="Excluir campo">
                  <Trash2 size={13} />
                </button>
              </div>
              {f.type === 'select' && (
                <Textarea
                  rows={2}
                  value={(f.options ?? []).join('\n')}
                  onChange={(e) => updateField(f.id, { options: e.target.value.split('\n') })}
                  placeholder="Uma opção por linha"
                />
              )}
              <label className="flex w-fit items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={!!f.showOnCard}
                  onChange={(e) => updateField(f.id, { showOnCard: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                />
                Mostrar no card do quadro
              </label>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setFields((c) => [...c, { id: crypto.randomUUID(), label: '', type: 'text' }])}
            className="flex w-fit items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            <Plus size={12} /> Adicionar campo
          </button>
        </section>

        <div className="flex items-center justify-between gap-2">
          {pipeline && !isDefault ? (
            <button type="button" onClick={handleDelete} className="text-xs font-medium text-red-500 underline hover:text-red-600">
              Excluir este pipeline
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {pipeline ? 'Salvar' : 'Criar pipeline'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

import type { BaseDoc } from './common'
import { LEAD_STATUS_COLOR, LEAD_STATUS_LABEL, LEAD_STATUS_ORDER } from './lead'

/** 'won' = etapa de ganho (oferece converter em cliente, comemora); 'lost' =
 *  etapa de perda (pede o motivo). As demais são 'open'. */
export type PipelineStageKind = 'open' | 'won' | 'lost'

export interface PipelineStage {
  id: string
  label: string
  /** Hex da etapa (coluna do Kanban e badges). */
  color: string
  kind: PipelineStageKind
}

export type PipelineFieldType = 'text' | 'long_text' | 'number' | 'currency' | 'date' | 'select' | 'link' | 'checkbox'

export const PIPELINE_FIELD_TYPE_LABEL: Record<PipelineFieldType, string> = {
  text: 'Texto curto',
  long_text: 'Texto longo',
  number: 'Número',
  currency: 'Valor em R$',
  date: 'Data',
  select: 'Lista de opções',
  link: 'Link',
  checkbox: 'Sim / Não',
}

/** Campo extra que o time define pra um pipeline — aparece na ficha e (se
 *  `showOnCard`) no card de todo lead desse pipeline. O valor fica em
 *  `Lead.customFields[field.id]`. */
export interface PipelineField {
  id: string
  label: string
  type: PipelineFieldType
  /** Só `select`. */
  options?: string[]
  showOnCard?: boolean
}

/** Um pipeline (quadro de leads) criado pelo time. O pipeline padrão
 *  ("Vendas", com as 7 etapas de sempre) é virtual — só existe um doc com o
 *  id `default` se alguém renomear ou acrescentar campos a ele (etapas,
 *  nome e campos — sem edição, valem as 7 etapas de sempre). */
export interface LeadPipeline extends BaseDoc {
  name: string
  order: number
  stages: PipelineStage[]
  fields: PipelineField[]
}

export const DEFAULT_PIPELINE_ID = 'default'

export interface ResolvedPipeline {
  id: string
  name: string
  stages: PipelineStage[]
  fields: PipelineField[]
  isDefault: boolean
}

const LEGACY_KIND: Record<string, PipelineStageKind> = { closed: 'won', lost: 'lost' }

export function defaultPipelineStages(): PipelineStage[] {
  return LEAD_STATUS_ORDER.map((s) => ({ id: s, label: LEAD_STATUS_LABEL[s], color: LEAD_STATUS_COLOR[s], kind: LEGACY_KIND[s] ?? 'open' }))
}

/** Etapas de partida de um pipeline novo (o time edita à vontade). */
export function newPipelineStages(): PipelineStage[] {
  return [
    { id: crypto.randomUUID(), label: 'Novo', color: '#64748B', kind: 'open' },
    { id: crypto.randomUUID(), label: 'Em andamento', color: '#3B82F6', kind: 'open' },
    { id: crypto.randomUUID(), label: 'Ganho', color: '#10B981', kind: 'won' },
    { id: crypto.randomUUID(), label: 'Perdido', color: '#EF4444', kind: 'lost' },
  ]
}

/** Pipeline padrão (virtual, mesclado com o doc `default` se existir) + os
 *  criados pelo time, na ordem. */
export function resolvePipelines(docs: LeadPipeline[]): ResolvedPipeline[] {
  const defaultDoc = docs.find((d) => d.id === DEFAULT_PIPELINE_ID)
  const base: ResolvedPipeline = {
    id: DEFAULT_PIPELINE_ID,
    name: defaultDoc?.name?.trim() || 'Vendas',
    // Sem edição salva, as 7 etapas de sempre; depois que alguém edita, vale o que está no doc.
    stages: defaultDoc?.stages?.length ? defaultDoc.stages : defaultPipelineStages(),
    fields: defaultDoc?.fields ?? [],
    isDefault: true,
  }
  const custom = docs
    .filter((d) => d.id !== DEFAULT_PIPELINE_ID)
    .sort((a, b) => a.order - b.order)
    .map((d) => ({ id: d.id, name: d.name, stages: d.stages ?? [], fields: d.fields ?? [], isDefault: false }))
  return [base, ...custom]
}

/** Em qual pipeline um lead está (sem `pipelineId` = o padrão). */
export function leadPipelineId(lead: { pipelineId?: string | null }): string {
  return lead.pipelineId || DEFAULT_PIPELINE_ID
}

/** Etapa em que o lead está; se a etapa foi apagada, cai na primeira. */
export function stageOfLead(pipeline: ResolvedPipeline, status: string): PipelineStage {
  return pipeline.stages.find((s) => s.id === status) ?? pipeline.stages[0]
}

/** Pipeline + etapa atuais de um lead, dado o conjunto de pipelines. */
export function locateLead(pipelines: ResolvedPipeline[], lead: { pipelineId?: string | null; status: string }): { pipeline: ResolvedPipeline; stage: PipelineStage } {
  const pipeline = pipelines.find((p) => p.id === leadPipelineId(lead)) ?? pipelines[0]
  return { pipeline, stage: stageOfLead(pipeline, lead.status) }
}

/** Texto de um valor de campo extra, pra card/lista (vazio = não mostra). */
export function formatFieldValue(field: PipelineField, value: unknown): string {
  if (value === undefined || value === null || value === '' || value === false) return ''
  if (field.type === 'checkbox') return 'Sim'
  if (field.type === 'currency') return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  if (field.type === 'date') {
    const [y, m, d] = String(value).split('-')
    return y && m && d ? `${d}/${m}/${y}` : String(value)
  }
  return String(value)
}

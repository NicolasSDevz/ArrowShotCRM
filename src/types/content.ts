import type { Timestamp } from 'firebase/firestore'
import type { BaseDoc } from './common'

export type ContentType = 'post' | 'carousel' | 'reels' | 'story' | 'video' | 'other'

export type ContentPlatform = 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'other'

/** Social Media production pipeline, ClickUp-style. */
export type ContentStatus =
  | 'ideas'
  | 'production'
  | 'review'
  | 'waiting_client'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'cancelled'

/** Recurring content themes used to plan and balance the weekly/monthly
 *  editorial grade (see the Social Media playbook — Roteiro Semanal/Mensal). */
export type ContentPillar =
  | 'dor_solucao'
  | 'autoridade'
  | 'prova_social'
  | 'bastidores'
  | 'educativo'
  | 'engajamento'
  | 'institucional'
  | 'antes_depois'
  | 'diferenciais'
  | 'comercial'
  | 'cta'

export interface Content extends BaseDoc {
  clientId: string
  title: string
  type: ContentType
  platform: ContentPlatform
  pillar?: ContentPillar
  objective?: string
  /** Shot-by-shot breakdown for reels (hook / development / close), free text. */
  script?: string
  caption?: string
  cta?: string
  hashtags?: string[]
  scheduledDate?: Timestamp | null
  scheduledTime?: string // "HH:mm", kept separate from date for quick editing
  assignedTo?: string
  canvaLink?: string
  notes?: string
  status: ContentStatus
  order: number
  /** Set when an internal user generates a public approval link. Non-null =
   *  this content is fetchable (get-by-id only, never listable) without auth
   *  at /aprovar/{id}/{approvalToken}. Cleared to revoke the link. */
  approvalToken?: string | null
  /** Client company name captured when the approval link was generated —
   *  purely for display on the public page, never used as a relational key
   *  (the public page has no read access to the clients collection). */
  clientNameSnapshot?: string
  /** Internal user ids to notify when the client acts on the public approval
   *  link (owner/admin + the assignee) — captured at link-generation time
   *  because the public page can't read the users collection. */
  approvalNotifyUserIds?: string[]
}

export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
  ideas: 'Produzir',
  production: 'Em Produção',
  review: 'Revisão',
  waiting_client: 'Aguardando Cliente',
  approved: 'Aprovado',
  scheduled: 'Agendado',
  published: 'Publicado',
  cancelled: 'Cancelado',
}

export const CONTENT_STATUS_ORDER: ContentStatus[] = [
  'ideas',
  'production',
  'review',
  'waiting_client',
  'approved',
  'scheduled',
  'published',
  'cancelled',
]

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  post: 'Post',
  carousel: 'Carrossel',
  reels: 'Reels',
  story: 'Story',
  video: 'Vídeo',
  other: 'Outro',
}

/** Shorter aliases for the 3 formats offered when criando conteúdo (campo
 *  "Formato") and shown no card do Kanban — mesmos valores de ContentType,
 *  só a palavra muda. */
export const CONTENT_FORMAT_LABEL: Partial<Record<ContentType, string>> = {
  post: 'Post',
  reels: 'Reel',
  story: 'Stories',
}

export const CONTENT_PLATFORM_LABEL: Record<ContentPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  other: 'Outra',
}

export const CONTENT_PILLAR_LABEL: Record<ContentPillar, string> = {
  dor_solucao: 'Dor / Solução',
  autoridade: 'Autoridade',
  prova_social: 'Prova Social',
  bastidores: 'Bastidores',
  educativo: 'Educativo',
  engajamento: 'Engajamento',
  institucional: 'Institucional',
  antes_depois: 'Antes e Depois',
  diferenciais: 'Diferenciais',
  comercial: 'Comercial',
  cta: 'CTA',
}

/** Ordem canônica dos pilares (dropdowns, filtros, legendas). */
export const CONTENT_PILLAR_ORDER: ContentPillar[] = [
  'dor_solucao',
  'autoridade',
  'prova_social',
  'bastidores',
  'educativo',
  'engajamento',
  'institucional',
  'antes_depois',
  'diferenciais',
  'comercial',
  'cta',
]

/** Cor (hex) de cada pilar — usada nos labels/chips coloridos e na borda
 *  esquerda dos cards do kanban. */
export const CONTENT_PILLAR_COLOR: Record<ContentPillar, string> = {
  dor_solucao: '#dc2626',
  autoridade: '#2563eb',
  prova_social: '#059669',
  bastidores: '#d97706',
  educativo: '#7c3aed',
  engajamento: '#ec4899',
  institucional: '#0ea5e9',
  antes_depois: '#14b8a6',
  diferenciais: '#f97316',
  comercial: '#ef4444',
  cta: '#eab308',
}

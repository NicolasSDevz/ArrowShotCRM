import type { Timestamp } from 'firebase/firestore'
import type { EntityType } from './common'

export type ActivityAction =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'assignee_changed'
  | 'file_uploaded'
  | 'comment_added'
  | 'approved'
  | 'change_requested'
  | 'deleted'
  /** Cliente expandiu o contrato (novo serviço/módulo ou aumento de valor) —
   *  alimenta o card "Upsell" do painel Visão Geral. */
  | 'upsell'

export interface Activity {
  id: string
  entityType: EntityType
  entityId: string
  clientId?: string
  action: ActivityAction
  /** human-readable summary, e.g. "moveu de Revisão para Aprovado" */
  message: string
  userId: string
  userName: string
  createdAt: Timestamp
}

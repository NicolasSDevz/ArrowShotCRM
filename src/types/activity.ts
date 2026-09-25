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
  /** Cliente reduziu o contrato (tirou serviço ou baixou o valor) sem
   *  cancelar — desconta da "Receita gerada no mês". */
  | 'downsell'

export interface Activity {
  id: string
  entityType: EntityType
  entityId: string
  clientId?: string
  action: ActivityAction
  /** human-readable summary, e.g. "moveu de Revisão para Aprovado" */
  message: string
  /** Valor em R$ do upsell — só preenchido quando `action === 'upsell'` e
   *  registrado manualmente pelo widget "Registrar upsell" (upsells
   *  detectados automaticamente ao editar o cliente não têm esse valor
   *  estruturado, só descrito em `message`). Alimenta o gráfico de receita
   *  de upsell do painel Visão Geral. */
  amount?: number
  userId: string
  userName: string
  createdAt: Timestamp
}

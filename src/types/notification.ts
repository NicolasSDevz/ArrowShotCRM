import type { Timestamp } from 'firebase/firestore'
import type { EntityType } from './common'

export type NotificationType =
  // Legacy types (public content-approval flow, generic task assignment).
  | 'task_assigned'
  | 'mention'
  | 'approval_requested'
  | 'content_approved'
  | 'change_requested'
  | 'due_soon'
  // Sistema de notificações internas — ver README/spec do módulo.
  | 'briefing_scheduled' // 1. Reunião agendada
  | 'task_completed' // 2. Tarefa concluída
  | 'task_overdue' // 3. Tarefa atrasada
  | 'new_client' // 4. Novo cliente
  | 'briefing_filled' // 5. Briefing preenchido
  | 'content_review_requested' // 6. Conteúdo aguardando aprovação (interna)
  | 'content_ready_to_schedule' // 7. Conteúdo aprovado (interna)
  | 'funnel_saved' // 8. Funil comercial salvo
  | 'task_reminder' // 9. Lembrete de tarefa (vence amanhã)
  // Cobertura ampla para o dono da plataforma (ver notifyAdminsOfAction).
  | 'task_created'
  | 'task_updated'
  | 'client_status_changed'
  | 'client_deleted'
  | 'planning_saved'
  | 'content_created'
  | 'content_published'
  | 'content_imported'
  | 'lead_created'
  | 'lead_stage_changed'
  | 'lead_converted'
  | 'meeting_created'
  | 'report_created'
  | 'team_member_added'
  | 'member_health_updated'
  | 'meta_token_expiring'

export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  message: string
  /** Who generated the notification — shown as its own small line in the UI
   *  (separate from `message`, which already carries the full sentence). */
  actorName?: string
  entityType?: EntityType
  entityId?: string
  read: boolean
  createdAt: Timestamp
}

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  task_assigned: 'Tarefa atribuída',
  mention: 'Menção',
  approval_requested: 'Aprovação solicitada',
  content_approved: 'Conteúdo aprovado pelo cliente',
  change_requested: 'Alteração solicitada pelo cliente',
  due_soon: 'Vencimento próximo',
  briefing_scheduled: 'Reunião agendada',
  task_completed: 'Tarefa concluída',
  task_overdue: 'Tarefa atrasada',
  new_client: 'Novo cliente',
  briefing_filled: 'Briefing preenchido',
  content_review_requested: 'Conteúdo aguardando aprovação',
  content_ready_to_schedule: 'Conteúdo aprovado',
  funnel_saved: 'Funil comercial salvo',
  task_reminder: 'Lembrete de tarefa',
  task_created: 'Tarefa criada',
  task_updated: 'Tarefa atualizada',
  client_status_changed: 'Status do cliente alterado',
  client_deleted: 'Cliente excluído',
  planning_saved: 'Planejamento de campanha salvo',
  content_created: 'Conteúdo criado',
  content_published: 'Conteúdo publicado',
  content_imported: 'Calendário editorial importado',
  lead_created: 'Novo lead',
  lead_stage_changed: 'Lead mudou de etapa',
  lead_converted: 'Lead convertido em cliente',
  meeting_created: 'Reunião registrada',
  report_created: 'Relatório gerado',
  team_member_added: 'Novo membro da equipe',
  member_health_updated: 'Informações de saúde atualizadas',
  meta_token_expiring: 'Token Meta Ads expirando',
}

/** Notifications older than this are pruned client-side (no backend
 *  scheduler in this project — see taskDueDateSweep/useNotifications). */
export const NOTIFICATION_RETENTION_DAYS = 30

/** A notification with no `createdAt` yet (serverTimestamp() briefly
 *  unresolved right after creation) is treated as brand new, never stale. */
export function isNotificationStale(n: Pick<AppNotification, 'createdAt'>): boolean {
  const cutoff = Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  return (n.createdAt?.toMillis() ?? Infinity) < cutoff
}

import type { NotificationType } from '../types/notification'

/** Quem recebe cada aviso no sino/celular (09/11/2026). Antes os 4 eram admin
 *  e tudo ia pra todo mundo. A pessoa é reconhecida pelo e-mail do login.
 *  Cópia igual no servidor: api/_lib/notificationRouting.js. */
export type TeamPerson = 'bruno' | 'nicolas' | 'ciane' | 'jamilson'

export const TEAM_EMAILS: Record<TeamPerson, string> = {
  bruno: 'arrowshotmkt@gmail.com', // vendas
  nicolas: 'gestorarrowshot@gmail.com', // tráfego (Zeus)
  ciane: 'gestorarrowshotmkt@gmail.com', // tráfego
  jamilson: 'jamilson.andrademk@gmail.com', // sucesso do cliente
}

export function personOfEmail(email?: string | null): TeamPerson | undefined {
  const e = String(email || '').trim().toLowerCase()
  return (Object.keys(TEAM_EMAILS) as TeamPerson[]).find((k) => TEAM_EMAILS[k] === e)
}

const VENDAS: TeamPerson[] = ['bruno']
const TRAFEGO: TeamPerson[] = ['nicolas', 'ciane']
const CS: TeamPerson[] = ['jamilson']
const SISTEMA: TeamPerson[] = ['nicolas']

/** 'direct' = só quem o aviso cita (o responsável da tarefa); ninguém recebe cópia. */
export const NOTIFICATION_ROUTES: Record<NotificationType, TeamPerson[] | 'direct'> = {
  // Vendas — Bruno
  lead_created: VENDAS,
  lead_stage_changed: VENDAS,
  lead_converted: VENDAS,
  funnel_saved: VENDAS,
  whatsapp_handoff: VENDAS,
  whatsapp_approval: VENDAS,
  store_sale: VENDAS,
  store_pix_pending: VENDAS,
  store_refund_request: VENDAS,
  store_refund: VENDAS,
  // Clientes e contas de anúncio — Nicolas e Ciane
  new_client: [...TRAFEGO, 'jamilson'], // Jamilson marca o briefing do cliente novo
  client_status_changed: TRAFEGO,
  client_deleted: TRAFEGO,
  briefing_filled: TRAFEGO,
  planning_saved: TRAFEGO,
  landing_page_saved: TRAFEGO,
  report_created: TRAFEGO,
  meta_token_expiring: TRAFEGO,
  ad_balance_low: TRAFEGO,
  // Sucesso do cliente — Jamilson
  briefing_scheduled: [...CS, ...TRAFEGO],
  meeting_created: CS,
  consulting_pending: CS,
  birthday_today: CS,
  content_review_requested: TRAFEGO, // aprovação de conteúdo: Nicolas e Ciane
  content_ready_to_schedule: TRAFEGO, // aprovação de conteúdo: Nicolas e Ciane
  approval_requested: TRAFEGO, // aprovação de conteúdo: Nicolas e Ciane
  content_approved: TRAFEGO, // aprovação de conteúdo: Nicolas e Ciane
  change_requested: TRAFEGO, // aprovação de conteúdo: Nicolas e Ciane
  content_created: TRAFEGO, // aprovação de conteúdo: Nicolas e Ciane
  content_published: TRAFEGO, // aprovação de conteúdo: Nicolas e Ciane
  content_imported: TRAFEGO, // aprovação de conteúdo: Nicolas e Ciane
  // Sistema — Nicolas
  system_error: SISTEMA,
  store_capi_error: SISTEMA,
  whatsapp_account: ['bruno', 'nicolas'],
  team_member_added: SISTEMA,
  member_health_updated: SISTEMA,
  // Tarefas — só o responsável
  task_assigned: 'direct',
  task_created: 'direct',
  task_updated: 'direct',
  task_completed: 'direct',
  task_overdue: 'direct',
  task_reminder: 'direct',
  due_soon: 'direct',
  mention: 'direct',
}

/** A pessoa (pelo e-mail) deve receber esse tipo? Tipos 'direct' sempre passam. */
export function shouldReceive(type: NotificationType, email?: string | null): boolean {
  const route = NOTIFICATION_ROUTES[type]
  if (!route || route === 'direct') return true
  const who = personOfEmail(email)
  return !!who && route.includes(who)
}

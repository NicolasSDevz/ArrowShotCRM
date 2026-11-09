// Quem recebe cada aviso (sino + celular). Cópia de src/config/notificationRouting.ts —
// mudou lá, muda aqui. A pessoa é reconhecida pelo e-mail do login.

export const TEAM_EMAILS = {
  bruno: 'arrowshotmkt@gmail.com', // vendas
  nicolas: 'gestorarrowshot@gmail.com', // tráfego (Zeus)
  ciane: 'gestorarrowshotmkt@gmail.com', // tráfego
  jamilson: 'jamilson.andrademk@gmail.com', // sucesso do cliente
}

const VENDAS = ['bruno']
const TRAFEGO = ['nicolas', 'ciane']
const CS = ['jamilson']
const SISTEMA = ['nicolas']

export const NOTIFICATION_ROUTES = {
  lead_created: VENDAS,
  lead_stage_changed: VENDAS,
  lead_converted: VENDAS,
  funnel_saved: VENDAS,
  whatsapp_handoff: VENDAS,
  whatsapp_approval: VENDAS,
  store_sale: VENDAS,
  store_pix_generated: VENDAS,
  store_card_refused: VENDAS,
  store_cart_abandoned: VENDAS,
  store_pix_pending: VENDAS,
  store_refund_request: VENDAS,
  store_refund: VENDAS,
  new_client: [...TRAFEGO, 'jamilson'],
  client_status_changed: TRAFEGO,
  client_deleted: TRAFEGO,
  briefing_filled: TRAFEGO,
  planning_saved: TRAFEGO,
  landing_page_saved: TRAFEGO,
  report_created: TRAFEGO,
  meta_token_expiring: TRAFEGO,
  ad_balance_low: TRAFEGO,
  briefing_scheduled: [...CS, ...TRAFEGO],
  meeting_created: CS,
  consulting_pending: CS,
  birthday_today: CS,
  content_review_requested: TRAFEGO,
  content_ready_to_schedule: TRAFEGO,
  approval_requested: TRAFEGO,
  content_approved: TRAFEGO,
  change_requested: TRAFEGO,
  content_created: TRAFEGO,
  content_published: TRAFEGO,
  content_imported: TRAFEGO,
  system_error: SISTEMA,
  store_capi_error: SISTEMA,
  whatsapp_account: ['bruno', 'nicolas'],
}

export function personOfEmail(email) {
  const e = String(email || '').trim().toLowerCase()
  return Object.keys(TEAM_EMAILS).find((k) => TEAM_EMAILS[k] === e)
}

/** Ids (de `users`) de quem recebe esse tipo. Tipo fora da tabela: admins e gerentes, como antes. */
export function routedUserIds(users, type) {
  const active = (users || []).filter((u) => u.active !== false)
  const route = NOTIFICATION_ROUTES[type]
  if (!route) return active.filter((u) => u.role === 'admin' || u.role === 'manager').map((u) => u.id)
  return active.filter((u) => route.includes(personOfEmail(u.email))).map((u) => u.id)
}

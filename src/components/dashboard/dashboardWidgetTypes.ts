import type { Task } from '../../types/task'
import type { Content } from '../../types/content'
import type { Client } from '../../types/client'
import type { Assignee } from '../../hooks/useAssignees'
import type { ClientSuccessTier } from '../../types/clientSuccess'

export interface DashboardBuckets {
  today: Task[]
  overdue: Task[]
  upcoming: Task[]
  inProduction: Content[]
  waitingApproval: Content[]
  approved: Content[]
  nextPublications: Content[]
}

export type ClientHealth = 'green' | 'yellow' | 'red'

/** Um motivo que deixou o cliente amarelo/vermelho (ver getClientHealth). */
export interface ClientHealthReason {
  level: 'red' | 'yellow'
  text: string
}

export interface ClientSummaryRow {
  client: Client
  health: ClientHealth
  reasons: ClientHealthReason[]
  service: string
  ownerName: string
  nextTask?: Task
  /** Classificação da avaliação de Sucesso do Cliente mais recente (aba
   *  "Sucesso do Cliente" da ficha) — undefined quando ainda não há avaliação. */
  successTier?: ClientSuccessTier
}

/** Dados/handlers computados uma vez em OperationalDashboard e repassados
 *  pros widgets extraídos que precisam deles (tarefas/conteúdo) — evita
 *  cada widget assinar de novo os mesmos listeners do Firestore e mantém um
 *  único drawer de tarefa/conteúdo compartilhado entre todos. Os widgets
 *  que já buscam os próprios dados (Rotina, Aniversário, Conteúdos pra
 *  produzir, Otimizações, Nova tarefa) não usam isso. */
export interface DashboardWidgetSharedData {
  clients: Client[]
  clientMap: Record<string, Client>
  buckets: DashboardBuckets
  upcomingGroups: { date: Date; tasks: Task[] }[]
  clientSummary: ClientSummaryRow[]
  assigneeMap: Record<string, Assignee>
  canSeeAllTasks: boolean
  onOpenTask: (id: string) => void
  onOpenContent: (id: string) => void
  onAddTask: () => void
  onAddContent: () => void
  onNavigateClient: (clientId: string) => void
}

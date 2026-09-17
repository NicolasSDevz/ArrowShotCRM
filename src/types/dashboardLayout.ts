import type { Timestamp } from 'firebase/firestore'

/** Catálogo de widgets do Dashboard Operacional personalizável (ver
 *  src/components/dashboard/dashboardWidgetCatalog.tsx pros rótulos/
 *  componentes). `conteudos_aprovados` existia no dashboard fixo antes desta
 *  feature — mantido disponível pra não sumir funcionalidade, mas não entra
 *  em nenhum layout padrão por cargo. */
export type DashboardWidgetId =
  | 'rotina'
  | 'rotina_equipe'
  | 'otimizacoes'
  | 'otimizacoes_equipe'
  | 'tarefas_equipe'
  | 'tarefas_atrasadas'
  | 'tarefas_hoje'
  | 'proximas_7dias'
  | 'conteudos_produzir'
  | 'em_producao'
  | 'aguardando_aprovacao'
  | 'conteudos_aprovados'
  | 'proximas_publicacoes'
  | 'resumo_clientes'
  | 'aniversarios'
  | 'nova_tarefa'

export type DashboardWidgetWidth = 'full' | 'half'

export interface DashboardWidgetConfig {
  id: DashboardWidgetId
  /** false = oculto, mas continua no array (preserva width/order pra quando
   *  o usuário adicionar de volta pelo painel "adicionar widget"). */
  visible: boolean
  order: number
  width: DashboardWidgetWidth
}

export interface UserDashboardLayout {
  widgets: DashboardWidgetConfig[]
  updatedAt?: Timestamp
  updatedBy?: string
}
